import { z } from "zod";
import { pool, query, queryOne, withTransaction } from "../../db";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../../utils/errors";
import { ApprovalDelegation } from "../../types";
import { createAuditLog } from "../audit/audit.service";
import {
  PaginationParams,
  paginationToSql,
  buildPaginatedResult,
} from "../../utils/pagination";
import { createDelegationSchema } from "./delegation.schema";

export async function createDelegation(
  tenantId: string,
  delegatorId: string,
  data: z.infer<typeof createDelegationSchema>,
): Promise<ApprovalDelegation> {
  return withTransaction(async (client) => {
    // Verify delegator is approver or admin
    const delegatorMember = await client.query<{ role: string }>(
      `SELECT role FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, delegatorId],
    );
    if (
      !delegatorMember.rows[0] ||
      !["admin", "approver"].includes(delegatorMember.rows[0].role)
    ) {
      throw new ForbiddenError(
        "Only approvers and admins can delegate approval authority",
      );
    }

    // Find the delegate user by email
    const delegateUser = await client.query<{ id: string; email: string }>(
      `SELECT u.id, u.email FROM users u
       JOIN tenant_memberships m ON u.id = m.user_id
       WHERE u.email = $1 AND m.tenant_id = $2`,
      [data.delegate_email, tenantId],
    );
    if (!delegateUser.rows[0]) {
      throw new NotFoundError(
        `No tenant member found with email '${data.delegate_email}'`,
      );
    }
    const delegateId = delegateUser.rows[0].id;

    if (delegateId === delegatorId) {
      throw new ConflictError("You cannot delegate to yourself");
    }

    // Check for existing active delegation to same person
    const existing = await client.query(
      `SELECT id FROM approval_delegations
       WHERE tenant_id = $1 AND delegator_id = $2 AND delegate_id = $3 AND is_active = true`,
      [tenantId, delegatorId, delegateId],
    );
    if (existing.rows[0]) {
      throw new ConflictError(
        "An active delegation to this user already exists",
      );
    }

    const result = await client.query<ApprovalDelegation>(
      `INSERT INTO approval_delegations
         (tenant_id, delegator_id, delegate_id, valid_until, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        tenantId,
        delegatorId,
        delegateId,
        data.valid_until ?? null,
        data.reason ?? null,
      ],
    );
    const delegation = result.rows[0]!;

    await createAuditLog(
      {
        tenantId,
        actorId: delegatorId,
        action: "delegation.created",
        entityType: "delegation",
        entityId: delegation.id,
        afterState: {
          delegate_id: delegateId,
          delegate_email: data.delegate_email,
          valid_until: data.valid_until ?? null,
          reason: data.reason ?? null,
        },
      },
      client,
    );

    return delegation;
  });
}

export async function revokeDelegation(
  tenantId: string,
  delegationId: string,
  actorId: string,
): Promise<ApprovalDelegation> {
  return withTransaction(async (client) => {
    const existing = await client.query<ApprovalDelegation>(
      `SELECT * FROM approval_delegations WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [delegationId, tenantId],
    );
    const delegation = existing.rows[0];
    if (!delegation) throw new NotFoundError("Delegation", delegationId);

    // Only the delegator or a tenant admin can revoke
    const memberResult = await client.query<{ role: string }>(
      `SELECT role FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, actorId],
    );
    if (
      delegation.delegator_id !== actorId &&
      memberResult.rows[0]?.role !== "admin"
    ) {
      throw new ForbiddenError(
        "Only the delegator or a tenant admin can revoke this delegation",
      );
    }

    if (!delegation.is_active) {
      throw new ConflictError("Delegation is already inactive");
    }

    const updated = await client.query<ApprovalDelegation>(
      `UPDATE approval_delegations
       SET is_active = false, valid_until = NOW()
       WHERE id = $1
       RETURNING *`,
      [delegationId],
    );

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "delegation.revoked",
        entityType: "delegation",
        entityId: delegationId,
      },
      client,
    );

    return updated.rows[0]!;
  });
}

export async function getDelegations(
  tenantId: string,
  userId: string,
  pagination: PaginationParams,
) {
  const { limit, offset } = paginationToSql(pagination);

  // Fetch delegations where the user is either delegator or delegate
  const [countResult, data] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM approval_delegations
       WHERE tenant_id = $1 AND (delegator_id = $2 OR delegate_id = $2)`,
      [tenantId, userId],
    ),
    query<
      ApprovalDelegation & {
        delegator_name: string;
        delegator_email: string;
        delegate_name: string;
        delegate_email: string;
      }
    >(
      `SELECT ad.*,
              du.full_name as delegator_name,
              du.email as delegator_email,
              de.full_name as delegate_name,
              de.email as delegate_email
       FROM approval_delegations ad
       JOIN users du ON ad.delegator_id = du.id
       JOIN users de ON ad.delegate_id = de.id
       WHERE ad.tenant_id = $1 AND (ad.delegator_id = $2 OR ad.delegate_id = $2)
       ORDER BY ad.created_at DESC
       LIMIT $3 OFFSET $4`,
      [tenantId, userId, limit, offset],
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
  return buildPaginatedResult(data, total, pagination);
}

export async function getAllDelegations(
  tenantId: string,
  pagination: PaginationParams,
) {
  const { limit, offset } = paginationToSql(pagination);

  const [countResult, data] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM approval_delegations WHERE tenant_id = $1`,
      [tenantId],
    ),
    query<
      ApprovalDelegation & {
        delegator_name: string;
        delegator_email: string;
        delegate_name: string;
        delegate_email: string;
      }
    >(
      `SELECT ad.*,
              du.full_name as delegator_name,
              du.email as delegator_email,
              de.full_name as delegate_name,
              de.email as delegate_email
       FROM approval_delegations ad
       JOIN users du ON ad.delegator_id = du.id
       JOIN users de ON ad.delegate_id = de.id
       WHERE ad.tenant_id = $1
       ORDER BY ad.created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
  return buildPaginatedResult(data, total, pagination);
}
