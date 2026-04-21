import { Router, Request, Response } from "express";
import { authenticate, requireTenantAccess } from "../../middleware/auth";
import {
  resolveApprovalSchema,
  resolveApproval,
  cancelApprovalRequest,
  getApprovalRequests,
  getApprovalRequest,
} from "./approvals.service";
import { paginationSchema } from "../../utils/pagination";

const router = Router({ mergeParams: true });

// List approval requests (with optional filters)
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

// Get single approval request with votes
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

// Cast a vote (approve or reject)
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

// Cancel a pending approval request
router.post(
  "/:requestId/cancel",
  authenticate,
  requireTenantAccess(["admin", "member", "approver"]),
  async (req: Request, res: Response) => {
    const result = await cancelApprovalRequest(
      req.tenantId!,
      req.params["requestId"]!,
      req.userId!,
    );
    res.json(result);
  },
);

export { router as approvalsRouter };
