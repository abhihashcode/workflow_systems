import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { TenantRole } from '../types';
import { queryOne } from '../db';

interface JwtPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      tenantId?: string;
      tenantRole?: TenantRole;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.userId = payload.userId;
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requireTenantAccess(roles?: TenantRole[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.params['tenantId'] ?? req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      throw new ForbiddenError('Tenant context required');
    }

    const membership = await queryOne<{ role: TenantRole; tenant_id: string }>(
      `SELECT role, tenant_id FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, req.userId]
    );

    if (!membership) {
      throw new ForbiddenError('You do not have access to this tenant');
    }

    if (roles && !roles.includes(membership.role)) {
      throw new ForbiddenError(`Required role: ${roles.join(' or ')}`);
    }

    req.tenantId = membership.tenant_id;
    req.tenantRole = membership.role;
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.tenantRole !== 'admin') {
    throw new ForbiddenError('Admin role required');
  }
  next();
}
