import { PoolClient } from 'pg';
import { query, pool } from '../../db';
import { AuditAction, AuditLog } from '../../types';
import { PaginationParams, paginationToSql, buildPaginatedResult, PaginatedResult } from '../../utils/pagination';

interface CreateAuditLogParams {
  tenantId?: string;
  actorId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function createAuditLog(
  params: CreateAuditLogParams,
  client?: PoolClient
): Promise<void> {
  await (client ?? pool).query(
    `INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.tenantId ?? null,
      params.actorId ?? null,
      params.action,
      params.entityType ?? null,
      params.entityId ?? null,
      params.beforeState ? JSON.stringify(params.beforeState) : null,
      params.afterState ? JSON.stringify(params.afterState) : null,
      JSON.stringify(params.metadata ?? {}),
      params.ipAddress ?? null,
    ]
  );
}

interface AuditLogFilters {
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
}

export async function getAuditLogs(
  tenantId: string,
  filters: AuditLogFilters,
  pagination: PaginationParams
): Promise<PaginatedResult<AuditLog>> {
  const conditions: string[] = ['a.tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (filters.action) {
    conditions.push(`a.action = $${paramIdx++}`);
    params.push(filters.action);
  }
  if (filters.entityType) {
    conditions.push(`a.entity_type = $${paramIdx++}`);
    params.push(filters.entityType);
  }
  if (filters.entityId) {
    conditions.push(`a.entity_id = $${paramIdx++}`);
    params.push(filters.entityId);
  }
  if (filters.actorId) {
    conditions.push(`a.actor_id = $${paramIdx++}`);
    params.push(filters.actorId);
  }
  if (filters.from) {
    conditions.push(`a.created_at >= $${paramIdx++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`a.created_at <= $${paramIdx++}`);
    params.push(filters.to);
  }

  const where = conditions.join(' AND ');
  const { limit, offset } = paginationToSql(pagination);

  const [countResult, data] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_logs a WHERE ${where}`,
      params
    ),
    query<AuditLog>(
      `SELECT a.*, u.email as actor_email, u.full_name as actor_name
       FROM audit_logs a
       LEFT JOIN users u ON a.actor_id = u.id
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
  return buildPaginatedResult(data, total, pagination);
}
