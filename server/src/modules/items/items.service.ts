import { PoolClient } from "pg";
import { z } from "zod";
import { pool, query, queryOne, withTransaction } from "../../db";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  OptimisticLockError,
} from "../../utils/errors";
import {
  Item,
  WorkflowTransition,
  WorkflowState,
  TenantRole,
} from "../../types";
import { createAuditLog } from "../audit/audit.service";
import {
  PaginationParams,
  paginationToSql,
  buildPaginatedResult,
} from "../../utils/pagination";
import { createItemSchema } from "./item.schema";

export async function createItem(
  tenantId: string,
  actorId: string,
  data: z.infer<typeof createItemSchema>,
): Promise<Item> {
  return withTransaction(async (client) => {
    // Get workflow initial state
    const workflow = await client.query<{ id: string }>(
      `SELECT id FROM workflows WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [data.workflow_id, tenantId],
    );
    if (!workflow.rows[0])
      throw new NotFoundError("Workflow", data.workflow_id);

    const initialState = await client.query<WorkflowState>(
      `SELECT * FROM workflow_states WHERE workflow_id = $1 AND is_initial = true`,
      [data.workflow_id],
    );
    if (!initialState.rows[0]) {
      throw new ValidationError("Workflow has no initial state");
    }

    const result = await client.query<Item>(
      `INSERT INTO items (tenant_id, workflow_id, current_state_id, title, description, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        data.workflow_id,
        initialState.rows[0].id,
        data.title,
        data.description ?? null,
        JSON.stringify(data.metadata),
        actorId,
      ],
    );
    const item = result.rows[0]!;

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "item.created",
        entityType: "item",
        entityId: item.id,
        afterState: {
          title: item.title,
          initial_state: initialState.rows[0].name,
        },
      },
      client,
    );

    return item;
  });
}

export async function getItems(
  tenantId: string,
  filters: { workflowId?: string; stateId?: string; search?: string },
  pagination: PaginationParams,
) {
  const conditions: string[] = ["i.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters.workflowId) {
    conditions.push(`i.workflow_id = $${idx++}`);
    params.push(filters.workflowId);
  }
  if (filters.stateId) {
    conditions.push(`i.current_state_id = $${idx++}`);
    params.push(filters.stateId);
  }
  if (filters.search) {
    conditions.push(`(i.title ILIKE $${idx} OR i.description ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.join(" AND ");
  const { limit, offset } = paginationToSql(pagination);

  const [countResult, data] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM items i WHERE ${where}`,
      params,
    ),
    query<
      Item & {
        current_state_name: string;
        workflow_name: string;
        created_by_name: string;
      }
    >(
      `SELECT i.*,
              s.name as current_state_name,
              s.is_terminal,
              w.name as workflow_name,
              u.full_name as created_by_name
       FROM items i
       JOIN workflow_states s ON i.current_state_id = s.id
       JOIN workflows w ON i.workflow_id = w.id
       JOIN users u ON i.created_by = u.id
       WHERE ${where}
       ORDER BY i.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
  return buildPaginatedResult(data, total, pagination);
}

export async function getItem(tenantId: string, itemId: string) {
  const item = await queryOne<
    Item & {
      current_state_name: string;
      workflow_name: string;
      is_terminal: boolean;
      created_by_name: string;
    }
  >(
    `SELECT i.*,
            s.name as current_state_name,
            s.is_terminal,
            w.name as workflow_name,
            u.full_name as created_by_name
     FROM items i
     JOIN workflow_states s ON i.current_state_id = s.id
     JOIN workflows w ON i.workflow_id = w.id
     JOIN users u ON i.created_by = u.id
     WHERE i.id = $1 AND i.tenant_id = $2`,
    [itemId, tenantId],
  );
  if (!item) throw new NotFoundError("Item", itemId);

  // Get available transitions from current state
  const transitions = await query<
    WorkflowTransition & { to_state_name: string }
  >(
    `SELECT t.*, s.name as to_state_name
     FROM workflow_transitions t
     JOIN workflow_states s ON t.to_state_id = s.id
     WHERE t.from_state_id = $1 AND t.workflow_id = $2`,
    [item.current_state_id, item.workflow_id],
  );

  // Get pending approval requests
  const pendingApprovals = await query<{
    id: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT id, status, created_at FROM approval_requests
     WHERE item_id = $1 AND status = 'pending'`,
    [itemId],
  );

  return { item, transitions, pendingApprovals };
}

export async function requestTransition(
  tenantId: string,
  itemId: string,
  actorId: string,
  actorRole: TenantRole,
  transitionId: string,
  version: number,
  idempotencyKey?: string,
): Promise<{ item?: Item; approvalRequest?: { id: string; status: string } }> {
  return withTransaction(async (client) => {
    // Idempotency check
    if (idempotencyKey) {
      const existing = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM approval_requests WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, idempotencyKey],
      );
      if (existing.rows[0]) {
        return { approvalRequest: existing.rows[0] };
      }
    }

    // Lock the item row for update
    const itemResult = await client.query<Item>(
      `SELECT * FROM items WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [itemId, tenantId],
    );
    const item = itemResult.rows[0];
    if (!item) throw new NotFoundError("Item", itemId);

    // Optimistic lock check
    if (item.version !== version) {
      throw new OptimisticLockError();
    }

    // Validate transition
    const transitionResult = await client.query<WorkflowTransition>(
      `SELECT * FROM workflow_transitions
       WHERE id = $1 AND workflow_id = $2 AND from_state_id = $3 AND tenant_id = $4`,
      [transitionId, item.workflow_id, item.current_state_id, tenantId],
    );
    const transition = transitionResult.rows[0];
    if (!transition) {
      throw new ValidationError("Invalid transition from current state");
    }

    // Check role permission
    if (
      transition.allowed_roles &&
      !transition.allowed_roles.includes(actorRole)
    ) {
      throw new ForbiddenError(
        `Your role '${actorRole}' is not allowed for this transition`,
      );
    }

    // Cancel any existing pending approval requests for this item
    await client.query(
      `UPDATE approval_requests SET status = 'superseded', resolved_at = NOW()
       WHERE item_id = $1 AND status = 'pending'`,
      [itemId],
    );

    if (transition.requires_approval) {
      // Create approval request instead of transitioning directly
      const approvalResult = await client.query<{ id: string; status: string }>(
        `INSERT INTO approval_requests (tenant_id, item_id, transition_id, requested_by, idempotency_key)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, status`,
        [tenantId, itemId, transitionId, actorId, idempotencyKey ?? null],
      );

      await createAuditLog(
        {
          tenantId,
          actorId,
          action: "item.transition_requested",
          entityType: "item",
          entityId: itemId,
          afterState: { transition_id: transitionId },
        },
        client,
      );

      await createAuditLog(
        {
          tenantId,
          actorId,
          action: "approval_request.created",
          entityType: "approval_request",
          entityId: approvalResult.rows[0]!.id,
        },
        client,
      );

      return { approvalRequest: approvalResult.rows[0] };
    } else {
      // Direct transition
      return await performTransition(
        client,
        item,
        transition,
        actorId,
        tenantId,
      );
    }
  });
}

export async function performTransition(
  client: PoolClient,
  item: Item,
  transition: WorkflowTransition,
  actorId: string,
  tenantId: string,
): Promise<{ item: Item }> {
  const updatedResult = await client.query<Item>(
    `UPDATE items
     SET current_state_id = $1, version = version + 1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 AND version = $4
     RETURNING *`,
    [transition.to_state_id, item.id, tenantId, item.version],
  );

  if (!updatedResult.rowCount || updatedResult.rowCount === 0) {
    throw new OptimisticLockError();
  }

  await createAuditLog(
    {
      tenantId,
      actorId,
      action: "item.transitioned",
      entityType: "item",
      entityId: item.id,
      beforeState: { state_id: item.current_state_id },
      afterState: { state_id: transition.to_state_id },
      metadata: { transition_id: transition.id },
    },
    client,
  );

  return { item: updatedResult.rows[0]! };
}
