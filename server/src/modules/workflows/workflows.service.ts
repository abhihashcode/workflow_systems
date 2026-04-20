import { z } from "zod";
import { pool, query, queryOne, withTransaction } from "../../db";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../../utils/errors";
import { Workflow, WorkflowState, WorkflowTransition } from "../../types";
import { createAuditLog } from "../audit/audit.service";
import {
  PaginationParams,
  paginationToSql,
  buildPaginatedResult,
} from "../../utils/pagination";
import {
  createWorkflowSchema,
  addStateSchema,
  addTransitionSchema,
} from "./workflows.schema";
import { validateWorkflowDefinition } from "./workflows.helper";

export async function createWorkflow(
  tenantId: string,
  actorId: string,
  data: z.infer<typeof createWorkflowSchema>,
): Promise<{
  workflow: Workflow;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}> {
  validateWorkflowDefinition(data.states, data.transitions);

  return withTransaction(async (client) => {
    // Check name uniqueness within tenant
    const existing = await client.query(
      `SELECT id FROM workflows WHERE tenant_id = $1 AND name = $2 AND is_active = true`,
      [tenantId, data.name],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      throw new ConflictError(
        `Workflow '${data.name}' already exists in this tenant`,
      );
    }

    const wfResult = await client.query<Workflow>(
      `INSERT INTO workflows (tenant_id, name, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, data.name, data.description ?? null, actorId],
    );
    const workflow = wfResult.rows[0]!;

    // Create states
    const stateMap = new Map<string, string>(); // name -> id
    const states: WorkflowState[] = [];
    for (const s of data.states) {
      const result = await client.query<WorkflowState>(
        `INSERT INTO workflow_states (workflow_id, tenant_id, name, description, is_initial, is_terminal, position_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          workflow.id,
          tenantId,
          s.name,
          s.description ?? null,
          s.is_initial,
          s.is_terminal,
          s.position_order,
        ],
      );
      const state = result.rows[0]!;
      stateMap.set(s.name, state.id);
      states.push(state);
    }

    // Create transitions
    const transitions: WorkflowTransition[] = [];
    for (const t of data.transitions) {
      const fromId = stateMap.get(t.from_state)!;
      const toId = stateMap.get(t.to_state)!;
      const result = await client.query<WorkflowTransition>(
        `INSERT INTO workflow_transitions
           (workflow_id, tenant_id, from_state_id, to_state_id, name, requires_approval, approval_strategy, quorum_count, allowed_roles)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          workflow.id,
          tenantId,
          fromId,
          toId,
          t.name ?? null,
          t.requires_approval,
          t.approval_strategy,
          t.quorum_count ?? null,
          t.allowed_roles ? `{${t.allowed_roles.join(",")}}` : null,
        ],
      );
      transitions.push(result.rows[0]!);
    }

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "workflow.created",
        entityType: "workflow",
        entityId: workflow.id,
        afterState: {
          name: workflow.name,
          stateCount: states.length,
          transitionCount: transitions.length,
        },
      },
      client,
    );

    return { workflow, states, transitions };
  });
}

export async function getWorkflows(
  tenantId: string,
  pagination: PaginationParams,
) {
  const { limit, offset } = paginationToSql(pagination);

  const [countResult, data] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM workflows WHERE tenant_id = $1 AND is_active = true`,
      [tenantId],
    ),
    query<Workflow>(
      `SELECT w.*, u.full_name as created_by_name
       FROM workflows w
       JOIN users u ON w.created_by = u.id
       WHERE w.tenant_id = $1 AND w.is_active = true
       ORDER BY w.name ASC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
  return buildPaginatedResult(data, total, pagination);
}

export async function getWorkflow(tenantId: string, workflowId: string) {
  const workflow = await queryOne<Workflow>(
    `SELECT w.*, u.full_name as created_by_name
     FROM workflows w
     JOIN users u ON w.created_by = u.id
     WHERE w.id = $1 AND w.tenant_id = $2`,
    [workflowId, tenantId],
  );
  if (!workflow) throw new NotFoundError("Workflow", workflowId);

  const [states, transitions] = await Promise.all([
    query<WorkflowState>(
      `SELECT * FROM workflow_states WHERE workflow_id = $1 ORDER BY position_order, name`,
      [workflowId],
    ),
    query<
      WorkflowTransition & { from_state_name: string; to_state_name: string }
    >(
      `SELECT t.*, fs.name as from_state_name, ts.name as to_state_name
       FROM workflow_transitions t
       JOIN workflow_states fs ON t.from_state_id = fs.id
       JOIN workflow_states ts ON t.to_state_id = ts.id
       WHERE t.workflow_id = $1`,
      [workflowId],
    ),
  ]);

  return { workflow, states, transitions };
}

export async function addState(
  tenantId: string,
  workflowId: string,
  actorId: string,
  data: z.infer<typeof addStateSchema>,
): Promise<WorkflowState> {
  return withTransaction(async (client) => {
    const wf = await client.query(
      "SELECT id FROM workflows WHERE id = $1 AND tenant_id = $2",
      [workflowId, tenantId],
    );
    if (!wf.rows[0]) throw new NotFoundError("Workflow", workflowId);

    // Check no other initial state if adding initial
    if (data.is_initial) {
      const existing = await client.query(
        "SELECT id FROM workflow_states WHERE workflow_id = $1 AND is_initial = true",
        [workflowId],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new ValidationError("Workflow already has an initial state");
      }
    }

    const result = await client.query<WorkflowState>(
      `INSERT INTO workflow_states (workflow_id, tenant_id, name, description, is_initial, is_terminal, position_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        workflowId,
        tenantId,
        data.name,
        data.description ?? null,
        data.is_initial,
        data.is_terminal,
        data.position_order,
      ],
    );

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "workflow.state_added",
        entityType: "workflow",
        entityId: workflowId,
        afterState: data,
      },
      client,
    );

    return result.rows[0]!;
  });
}

export async function addTransition(
  tenantId: string,
  workflowId: string,
  actorId: string,
  data: z.infer<typeof addTransitionSchema>,
): Promise<WorkflowTransition> {
  return withTransaction(async (client) => {
    // Validate states belong to this workflow
    const states = await client.query<{ id: string }>(
      `SELECT id FROM workflow_states WHERE id = ANY($1) AND workflow_id = $2 AND tenant_id = $3`,
      [[data.from_state_id, data.to_state_id], workflowId, tenantId],
    );
    if (states.rowCount !== 2) {
      throw new ValidationError(
        "One or both states not found in this workflow",
      );
    }

    if (data.requires_approval && data.approval_strategy === "none") {
      throw new ValidationError(
        "approval_strategy required when requires_approval is true",
      );
    }

    const result = await client.query<WorkflowTransition>(
      `INSERT INTO workflow_transitions
         (workflow_id, tenant_id, from_state_id, to_state_id, name, requires_approval, approval_strategy, quorum_count, allowed_roles)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        workflowId,
        tenantId,
        data.from_state_id,
        data.to_state_id,
        data.name ?? null,
        data.requires_approval,
        data.approval_strategy,
        data.quorum_count ?? null,
        data.allowed_roles ? `{${data.allowed_roles.join(",")}}` : null,
      ],
    );

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "workflow.transition_added",
        entityType: "workflow",
        entityId: workflowId,
        afterState: data,
      },
      client,
    );

    return result.rows[0]!;
  });
}
