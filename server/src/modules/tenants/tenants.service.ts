import { pool, query, queryOne, withTransaction } from "../../db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/errors";
import { Tenant, TenantMembership, TenantRole } from "../../types";
import { createAuditLog } from "../audit/audit.service";
import {
  PaginationParams,
  paginationToSql,
  buildPaginatedResult,
} from "../../utils/pagination";

export async function createTenant(
  name: string,
  slug: string,
  createdBy: string,
): Promise<Tenant> {
  return withTransaction(async (client) => {
    const existing = await client.query(
      "SELECT id FROM tenants WHERE slug = $1",
      [slug],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      throw new ConflictError(`Tenant slug '${slug}' is already taken`);
    }

    const result = await client.query<Tenant>(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2)
       RETURNING id, name, slug, created_at, updated_at`,
      [name, slug],
    );
    const tenant = result.rows[0]!;

    // Creator becomes admin
    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'admin')`,
      [tenant.id, createdBy],
    );

    await createAuditLog(
      {
        tenantId: tenant.id,
        actorId: createdBy,
        action: "tenant.created",
        entityType: "tenant",
        entityId: tenant.id,
        afterState: { name, slug },
      },
      client,
    );

    return tenant;
  });
}

export async function getTenants(userId: string, pagination: PaginationParams) {
  const { limit, offset } = paginationToSql(pagination);

  const [countResult, data] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tenants t
       JOIN tenant_memberships m ON t.id = m.tenant_id
       WHERE m.user_id = $1`,
      [userId],
    ),
    query<Tenant & { role: TenantRole }>(
      `SELECT t.*, m.role FROM tenants t
       JOIN tenant_memberships m ON t.id = m.tenant_id
       WHERE m.user_id = $1
       ORDER BY t.name ASC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
  return buildPaginatedResult(data, total, pagination);
}

export async function getTenant(tenantId: string): Promise<Tenant> {
  const tenant = await queryOne<Tenant>(
    "SELECT id, name, slug, created_at, updated_at FROM tenants WHERE id = $1",
    [tenantId],
  );
  if (!tenant) throw new NotFoundError("Tenant", tenantId);
  return tenant;
}

export async function getMembers(
  tenantId: string,
  pagination: PaginationParams,
) {
  const { limit, offset } = paginationToSql(pagination);

  const [countResult, data] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tenant_memberships WHERE tenant_id = $1`,
      [tenantId],
    ),
    query<TenantMembership & { email: string; full_name: string }>(
      `SELECT m.id, m.tenant_id, m.user_id, m.role, m.created_at, m.updated_at,
              u.email, u.full_name
       FROM tenant_memberships m
       JOIN users u ON m.user_id = u.id
       WHERE m.tenant_id = $1
       ORDER BY u.full_name ASC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
  return buildPaginatedResult(data, total, pagination);
}

export async function addMember(
  tenantId: string,
  email: string,
  role: TenantRole,
  actorId: string,
): Promise<TenantMembership> {
  return withTransaction(async (client) => {
    const user = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    if (!user.rows[0]) {
      throw new NotFoundError("User with email", email);
    }
    const userId = user.rows[0].id;

    const existing = await client.query(
      "SELECT id FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2",
      [tenantId, userId],
    );
    
    if (existing.rowCount && existing.rowCount > 0) {
      throw new ConflictError("User is already a member of this tenant");
    }

    const result = await client.query<TenantMembership>(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)
       RETURNING id, tenant_id, user_id, role, created_at, updated_at`,
      [tenantId, userId, role],
    );

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "tenant.membership_added",
        entityType: "user",
        entityId: userId,
        afterState: { role },
      },
      client,
    );

    return result.rows[0]!;
  });
}

export async function updateMember(
  tenantId: string,
  userId: string,
  role: TenantRole,
  actorId: string,
): Promise<TenantMembership> {
  return withTransaction(async (client) => {
    const existing = await client.query<TenantMembership>(
      "SELECT * FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2",
      [tenantId, userId],
    );
    if (!existing.rows[0]) {
      throw new NotFoundError("Membership");
    }

    // Prevent demoting yourself if you're the last admin
    if (existing.rows[0].role === "admin" && role !== "admin") {
      const adminCount = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tenant_memberships WHERE tenant_id = $1 AND role = 'admin'`,
        [tenantId],
      );
      if (parseInt(adminCount.rows[0]?.count ?? "0", 10) <= 1) {
        throw new ForbiddenError("Cannot demote the last admin of a tenant");
      }
    }

    const result = await client.query<TenantMembership>(
      `UPDATE tenant_memberships SET role = $1 WHERE tenant_id = $2 AND user_id = $3
       RETURNING id, tenant_id, user_id, role, created_at, updated_at`,
      [role, tenantId, userId],
    );

    await createAuditLog(
      {
        tenantId,
        actorId,
        action: "tenant.membership_updated",
        entityType: "user",
        entityId: userId,
        beforeState: { role: existing.rows[0].role },
        afterState: { role },
      },
      client,
    );

    return result.rows[0]!;
  });
}
