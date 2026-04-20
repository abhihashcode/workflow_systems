import { Router, Request, Response } from "express";
import { authenticate, requireTenantAccess } from "../../middleware/auth";
import {
  createWorkflow,
  getWorkflows,
  getWorkflow,
  addState,
  addTransition,
} from "./workflows.service";
import {
  createWorkflowSchema,
  addStateSchema,
  addTransitionSchema,
} from "./workflows.schema";
import { paginationSchema } from "../../utils/pagination";

const router = Router({ mergeParams: true });

router.post(
  "/",
  authenticate,
  requireTenantAccess(["admin"]),
  async (req: Request, res: Response) => {
    const data = createWorkflowSchema.parse(req.body);
    const result = await createWorkflow(req.tenantId!, req.userId!, data);
    res.status(201).json(result);
  },
);

router.get(
  "/",
  authenticate,
  requireTenantAccess(),
  async (req: Request, res: Response) => {
    const pagination = paginationSchema.parse(req.query);
    const result = await getWorkflows(req.tenantId!, pagination);
    res.json(result);
  },
);

router.get(
  "/:workflowId",
  authenticate,
  requireTenantAccess(),
  async (req: Request, res: Response) => {
    const result = await getWorkflow(req.tenantId!, req.params["workflowId"]!);
    res.json(result);
  },
);

router.post(
  "/:workflowId/states",
  authenticate,
  requireTenantAccess(["admin"]),
  async (req: Request, res: Response) => {
    const data = addStateSchema.parse(req.body);
    const state = await addState(
      req.tenantId!,
      req.params["workflowId"]!,
      req.userId!,
      data,
    );
    res.status(201).json(state);
  },
);

router.post(
  "/:workflowId/transitions",
  authenticate,
  requireTenantAccess(["admin"]),
  async (req: Request, res: Response) => {
    const data = addTransitionSchema.parse(req.body);
    const transition = await addTransition(
      req.tenantId!,
      req.params["workflowId"]!,
      req.userId!,
      data,
    );
    res.status(201).json(transition);
  },
);

export { router as workflowsRouter };
