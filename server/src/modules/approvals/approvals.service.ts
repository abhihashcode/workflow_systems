import { z } from "zod";
import { pool, query, queryOne, withTransaction } from "../../db";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../../utils/errors";
import { ApprovalRequest, WorkflowTransition, Item } from "../../types";
import { createAuditLog } from "../audit/audit.service";
import { performTransition } from "../items/items.service";
import {
  PaginationParams,
  paginationToSql,
  buildPaginatedResult,
} from "../../utils/pagination";

export const resolveApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(2000).optional(),
});

export async function resolveApproval(
  tenantId: string,
  approvalRequestId: string,
  actorId: string,
  decision: "approved" | "rejected",
  comment?: string,
): Promise<ApprovalRequest> {
  return withTransaction(async (client) => {
    // Lock the approval request
    const requestResult = await client.query<ApprovalRequest>(
      `SELECT * FROM approval_requests WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [approvalRequestId, tenantId],
    );
    const approvalRequest = requestResult.rows[0];
    if (!approvalRequest)
      throw new NotFoundError("Approval request", approvalRequestId);
    if (approvalRequest.status !== "pending") {
      throw new ConflictError(
        `Approval request is already ${approvalRequest.status}`,
      );
    }

    // Check actor is approver or admin
    const memberResult = await client.query<{ role: string }>(
      `SELECT role FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, actorId],
    );
    if (
      !memberResult.rows[0] ||
      !["admin", "approver"].includes(memberResult.rows[0].role)
    ) {
      throw new ForbiddenError(
        "Only approvers and admins can resolve approval requests",
      );
    }

    // Get transition
    const transitionResult = await client.query<WorkflowTransition>(
      `SELECT * FROM workflow_transitions WHERE id = $1`,
      [approvalRequest.transition_id],
    );
    const transition = transitionResult.rows[0];
    if (!transition) throw new NotFoundError("Transition");

    // Lock and get item
    const itemResult = await client.query<Item>(
      `SELECT * FROM items WHERE id = $1 FOR UPDATE`,
      [approvalRequest.item_id],
    );
    const item = itemResult.rows[0];
    if (!item) throw new NotFoundError("Item");

    // Resolve the request
    const updatedResult = await client.query<ApprovalRequest>(
      `UPDATE approval_requests
       SET status = $1, resolved_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [decision, approvalRequestId],
    );

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "approval_request.resolved",
        entityType: "approval_request",
        entityId: approvalRequestId,
        afterState: { decision, comment: comment ?? null },
      },
      client,
    );

    // If approved, perform the transition
    if (decision === "approved") {
      await performTransition(client, item, transition, actorId, tenantId);
    }

    return updatedResult.rows[0]!;
  });
}

export async function getApprovalRequests(
  tenantId: string,
  filters: { itemId?: string; status?: string },
  pagination: PaginationParams,
) {
  const conditions: string[] = ["ar.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters.itemId) {
    conditions.push(`ar.item_id = $${idx++}`);
    params.push(filters.itemId);
  }
  if (filters.status) {
    conditions.push(`ar.status = $${idx++}`);
    params.push(filters.status);
  }

  const where = conditions.join(" AND ");
  const { limit, offset } = paginationToSql(pagination);

  const [countResult, data] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM approval_requests ar WHERE ${where}`,
      params,
    ),
    query<
      ApprovalRequest & {
        item_title: string;
        requester_name: string;
        to_state_name: string;
      }
    >(
      `SELECT ar.*,
              i.title as item_title,
              u.full_name as requester_name,
              ts.name as to_state_name
       FROM approval_requests ar
       JOIN items i ON ar.item_id = i.id
       JOIN users u ON ar.requested_by = u.id
       JOIN workflow_transitions wt ON ar.transition_id = wt.id
       JOIN workflow_states ts ON wt.to_state_id = ts.id
       WHERE ${where}
       ORDER BY ar.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
  return buildPaginatedResult(data, total, pagination);
}

export async function getApprovalRequest(tenantId: string, requestId: string) {
  const request = await queryOne<
    ApprovalRequest & {
      item_title: string;
      to_state_name: string;
      requester_name: string;
    }
  >(
    `SELECT ar.*,
            i.title as item_title,
            u.full_name as requester_name,
            ts.name as to_state_name
     FROM approval_requests ar
     JOIN items i ON ar.item_id = i.id
     JOIN users u ON ar.requested_by = u.id
     JOIN workflow_transitions wt ON ar.transition_id = wt.id
     JOIN workflow_states ts ON wt.to_state_id = ts.id
     WHERE ar.id = $1 AND ar.tenant_id = $2`,
    [requestId, tenantId],
  );
  if (!request) throw new NotFoundError("Approval request", requestId);
  return request;
}
