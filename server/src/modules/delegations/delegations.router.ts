import { Router, Request, Response } from "express";
import { authenticate, requireTenantAccess } from "../../middleware/auth";
import {
  createDelegation,
  revokeDelegation,
  getDelegations,
  getAllDelegations,
} from "./delegations.service";
import { createDelegationSchema } from "./delegation.schema";
import { paginationSchema } from "../../utils/pagination";

const router = Router({ mergeParams: true });

// List all delegations for the current user (both as delegator and delegate)
router.get(
  "/",
  authenticate,
  requireTenantAccess(),
  async (req: Request, res: Response) => {
    const pagination = paginationSchema.parse(req.query);

    // Admins can see all delegations; others see only their own
    if (req.tenantRole === "admin") {
      const result = await getAllDelegations(req.tenantId!, pagination);
      return res.json(result);
    }

    const result = await getDelegations(req.tenantId!, req.userId!, pagination);
    return res.json(result);
  },
);

// Create a delegation (approver/admin delegates to another tenant member)
router.post(
  "/",
  authenticate,
  requireTenantAccess(["admin", "approver"]),
  async (req: Request, res: Response) => {
    const data = createDelegationSchema.parse(req.body);
    const delegation = await createDelegation(req.tenantId!, req.userId!, data);
    return res.status(201).json(delegation);
  },
);

// Revoke an active delegation
router.delete(
  "/:delegationId",
  authenticate,
  requireTenantAccess(["admin", "approver", "member"]),
  async (req: Request, res: Response) => {
    const delegation = await revokeDelegation(
      req.tenantId!,
      req.params["delegationId"]!,
      req.userId!,
    );
    return res.json(delegation);
  },
);

export { router as delegationsRouter };
