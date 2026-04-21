import { z } from "zod";
import { pool, query, queryOne, withTransaction } from "../../db";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../../utils/errors";
import { ApprovalRequest, WorkflowTransition, Item, ApprovalVote } from "../../types";
import { createAuditLog } from "../audit/audit.service";
import { checkAndResolveApproval } from "./approval.helper";
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
      `SELECT ar.* FROM approval_requests ar
       WHERE ar.id = $1 AND ar.tenant_id = $2 FOR UPDATE`,
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

    // Check actor is approver or admin in this tenant
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

    // Prevent duplicate votes from the same actor
    const existingVote = await client.query(
      `SELECT id FROM approval_votes WHERE approval_request_id = $1 AND voter_id = $2`,
      [approvalRequestId, actorId],
    );
    if (existingVote.rows[0]) {
      throw new ConflictError(
        "You have already cast a vote on this approval request",
      );
    }

    // Check if this actor is voting under a delegation (acting as a delegate for someone else)
    const delegationResult = await client.query<{ delegator_id: string }>(
      `SELECT delegator_id FROM approval_delegations
       WHERE tenant_id = $1 AND delegate_id = $2 AND is_active = true
       AND (valid_until IS NULL OR valid_until > NOW())
       LIMIT 1`,
      [tenantId, actorId],
    );
    const delegatedFromId = delegationResult.rows[0]?.delegator_id ?? null;

    // Create the approval vote record
    await client.query(
      `INSERT INTO approval_votes
         (approval_request_id, tenant_id, voter_id, delegated_from_id, decision, comment)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        approvalRequestId,
        tenantId,
        actorId,
        delegatedFromId,
        decision,
        comment ?? null,
      ],
    );

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "approval_vote.cast",
        entityType: "approval_request",
        entityId: approvalRequestId,
        afterState: {
          decision,
          comment: comment ?? null,
          delegated_from: delegatedFromId,
        },
      },
      client,
    );

    // Get the workflow transition details for strategy evaluation
    const transitionResult = await client.query<WorkflowTransition>(
      `SELECT * FROM workflow_transitions WHERE id = $1`,
      [approvalRequest.transition_id],
    );
    const transition = transitionResult.rows[0];
    if (!transition) throw new NotFoundError("Transition");

    // Lock and get item for potential state change
    const itemResult = await client.query<Item>(
      `SELECT * FROM items WHERE id = $1 FOR UPDATE`,
      [approvalRequest.item_id],
    );
    const item = itemResult.rows[0];
    if (!item) throw new NotFoundError("Item");

    // Evaluate voting threshold — this will resolve the request and transition item if met
    await checkAndResolveApproval(
      approvalRequestId,
      tenantId,
      transition,
      item,
      client,
      actorId,
    );

    // Return fresh state of the approval request
    const updated = await client.query<ApprovalRequest>(
      `SELECT ar.*, wt.approval_strategy, wt.quorum_count
       FROM approval_requests ar
       JOIN workflow_transitions wt ON ar.transition_id = wt.id
       WHERE ar.id = $1`,
      [approvalRequestId],
    );
    return updated.rows[0]!;
  });
}

export async function cancelApprovalRequest(
  tenantId: string,
  approvalRequestId: string,
  actorId: string,
): Promise<ApprovalRequest> {
  return withTransaction(async (client) => {
    const requestResult = await client.query<ApprovalRequest>(
      `SELECT * FROM approval_requests WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [approvalRequestId, tenantId],
    );
    const approvalRequest = requestResult.rows[0];
    if (!approvalRequest)
      throw new NotFoundError("Approval request", approvalRequestId);
    if (approvalRequest.status !== "pending") {
      throw new ConflictError(
        `Cannot cancel — request is already ${approvalRequest.status}`,
      );
    }

    // Only the requester or an admin can cancel
    const memberResult = await client.query<{ role: string }>(
      `SELECT role FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, actorId],
    );
    const role = memberResult.rows[0]?.role;
    if (
      actorId !== approvalRequest.requested_by &&
      role !== "admin"
    ) {
      throw new ForbiddenError(
        "Only the requester or an admin can cancel this approval request",
      );
    }

    const updated = await client.query<ApprovalRequest>(
      `UPDATE approval_requests
       SET status = 'cancelled', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [approvalRequestId],
    );

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "approval_request.cancelled",
        entityType: "approval_request",
        entityId: approvalRequestId,
      },
      client,
    );

    return updated.rows[0]!;
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
        approval_strategy: string;
        quorum_count: number | null;
      }
    >(
      `SELECT ar.*,
              i.title as item_title,
              u.full_name as requester_name,
              ts.name as to_state_name,
              wt.approval_strategy,
              wt.quorum_count
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
      approval_strategy: string;
      quorum_count: number | null;
    }
  >(
    `SELECT ar.*,
            i.title as item_title,
            u.full_name as requester_name,
            ts.name as to_state_name,
            wt.approval_strategy,
            wt.quorum_count
     FROM approval_requests ar
     JOIN items i ON ar.item_id = i.id
     JOIN users u ON ar.requested_by = u.id
     JOIN workflow_transitions wt ON ar.transition_id = wt.id
     JOIN workflow_states ts ON wt.to_state_id = ts.id
     WHERE ar.id = $1 AND ar.tenant_id = $2`,
    [requestId, tenantId],
  );
  if (!request) throw new NotFoundError("Approval request", requestId);

  // Include all votes cast on this request
  const votes = await query<
    ApprovalVote & {
      voter_email: string;
      voter_name: string;
      delegated_from_name: string | null;
    }
  >(
    `SELECT av.*,
            u.email as voter_email,
            u.full_name as voter_name,
            du.full_name as delegated_from_name
     FROM approval_votes av
     JOIN users u ON av.voter_id = u.id
     LEFT JOIN users du ON av.delegated_from_id = du.id
     WHERE av.approval_request_id = $1
     ORDER BY av.created_at ASC`,
    [requestId],
  );

  return { ...request, votes };
}
