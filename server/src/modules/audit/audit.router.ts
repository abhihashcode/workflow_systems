import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireTenantAccess } from '../../middleware/auth';
import { getAuditLogs } from './audit.service';
import { paginationSchema } from '../../utils/pagination';

const router = Router({ mergeParams: true });

const auditFiltersSchema = z.object({
  action: z.string().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  actor_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

router.get('/', authenticate, requireTenantAccess(), async (req: Request, res: Response) => {
  const pagination = paginationSchema.parse(req.query);
  const filters = auditFiltersSchema.parse(req.query);

  const result = await getAuditLogs(
    req.tenantId!,
    {
      action: filters.action as import('../../types').AuditAction | undefined,
      entityType: filters.entity_type,
      entityId: filters.entity_id,
      actorId: filters.actor_id,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
    },
    pagination
  );

  res.json(result);
});

export { router as auditRouter };
