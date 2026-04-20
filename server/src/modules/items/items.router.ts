import { Router, Request, Response } from "express";
import { authenticate, requireTenantAccess } from "../../middleware/auth";
import {
  createItem,
  getItems,
  getItem,
  requestTransition,
} from "./items.service";
import { createItemSchema, transitionItemSchema } from "./item.schema";
import { paginationSchema } from "../../utils/pagination";

const router = Router({ mergeParams: true });

/**
 * Sanitizes a query param value.
 * Returns undefined if the value is missing, an empty string, or the literal
 * string "undefined" / "null" (which URLSearchParams can produce on the
 * client when a JS undefined value is serialized without filtering).
 */
function sanitizeParam(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "undefined" || trimmed === "null")
    return undefined;
  return trimmed;
}

router.post(
  "/",
  authenticate,
  requireTenantAccess(["admin", "member", "approver"]),
  async (req: Request, res: Response) => {
    const data = createItemSchema.parse(req.body);
    const item = await createItem(req.tenantId!, req.userId!, data);
    res.status(201).json(item);
  },
);

router.get(
  "/",
  authenticate,
  requireTenantAccess(),
  async (req: Request, res: Response) => {
    const pagination = paginationSchema.parse(req.query);
    const filters = {
      workflowId: sanitizeParam(req.query["workflow_id"]),
      stateId: sanitizeParam(req.query["state_id"]),
      search: sanitizeParam(req.query["search"]),
    };
    const result = await getItems(req.tenantId!, filters, pagination);
    res.json(result);
  },
);

router.get(
  "/:itemId",
  authenticate,
  requireTenantAccess(),
  async (req: Request, res: Response) => {
    const result = await getItem(req.tenantId!, req.params["itemId"]!);
    res.json(result);
  },
);

router.post(
  "/:itemId/transitions",
  authenticate,
  requireTenantAccess(["admin", "member", "approver"]),
  async (req: Request, res: Response) => {
    const { transition_id, version, idempotency_key } =
      transitionItemSchema.parse(req.body);
    const result = await requestTransition(
      req.tenantId!,
      req.params["itemId"]!,
      req.userId!,
      req.tenantRole!,
      transition_id,
      version,
      idempotency_key,
    );
    res.json(result);
  },
);

export { router as itemsRouter };
