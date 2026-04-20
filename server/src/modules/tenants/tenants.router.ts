import { Router, Request, Response } from "express";
import { authenticate, requireTenantAccess } from "../../middleware/auth";
import {
  createTenant,
  getTenants,
  getTenant,
  getMembers,
  addMember,
  updateMember,
} from "./tenants.service";
import {
  createTenantSchema,
  addMemberSchema,
  updateMembershipSchema,
} from "./tenant.schema";
import { paginationSchema } from "../../utils/pagination";

const router = Router();

// Create tenant
router.post("/", authenticate, async (req: Request, res: Response) => {
  const { name, slug } = createTenantSchema.parse(req.body);
  const tenant = await createTenant(name, slug, req.userId!);
  res.status(201).json(tenant);
});

// Get my tenants
router.get("/", authenticate, async (req: Request, res: Response) => {
  const pagination = paginationSchema.parse(req.query);
  const result = await getTenants(req.userId!, pagination);
  res.json(result);
});

// Get tenant by id
router.get(
  "/:tenantId",
  authenticate,
  requireTenantAccess(),
  async (req: Request, res: Response) => {
    const tenant = await getTenant(req.tenantId!);
    res.json(tenant);
  },
);

// Get members
router.get(
  "/:tenantId/members",
  authenticate,
  requireTenantAccess(),
  async (req: Request, res: Response) => {
    const pagination = paginationSchema.parse(req.query);
    const result = await getMembers(req.tenantId!, pagination);
    res.json(result);
  },
);

// Add member
router.post(
  "/:tenantId/members",
  authenticate,
  requireTenantAccess(["admin"]),
  async (req: Request, res: Response) => {
    const { email, role } = addMemberSchema.parse(req.body);
    const membership = await addMember(req.tenantId!, email, role, req.userId!);
    res.status(201).json(membership);
  },
);

// Update member role
router.patch(
  "/:tenantId/members/:userId",
  authenticate,
  requireTenantAccess(["admin"]),
  async (req: Request, res: Response) => {
    const { role } = updateMembershipSchema.parse(req.body);
    const membership = await updateMember(
      req.tenantId!,
      req.params["userId"]!,
      role,
      req.userId!,
    );
    res.json(membership);
  },
);

export { router as tenantsRouter };
