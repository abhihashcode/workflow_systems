import { Router, Request, Response } from "express";
import { authenticate, requireTenantAccess } from "../../middleware/auth";
import {
  resolveApprovalSchema,
  resolveApproval,
  getApprovalRequests,
  getApprovalRequest,
} from "./approvals.service";
import { paginationSchema } from "../../utils/pagination";

const router = Router({ mergeParams: true });

router.get(
  "/",
  authenticate,
  requireTenantAccess(),
  async (req: Request, res: Response) => {
    const pagination = paginationSchema.parse(req.query);
    const filters = {
      itemId: req.query["item_id"] as string | undefined,
      status: req.query["status"] as string | undefined,
    };
    const result = await getApprovalRequests(
      req.tenantId!,
      filters,
      pagination,
    );
    res.json(result);
  },
);

router.get(
  "/:requestId",
  authenticate,
  requireTenantAccess(),
  async (req: Request, res: Response) => {
    const result = await getApprovalRequest(
      req.tenantId!,
      req.params["requestId"]!,
    );
    res.json(result);
  },
);

router.post(
  "/:requestId/resolve",
  authenticate,
  requireTenantAccess(["admin", "approver"]),
  async (req: Request, res: Response) => {
    const { decision, comment } = resolveApprovalSchema.parse(req.body);
    const result = await resolveApproval(
      req.tenantId!,
      req.params["requestId"]!,
      req.userId!,
      decision,
      comment,
    );
    res.json(result);
  },
);

export { router as approvalsRouter };
