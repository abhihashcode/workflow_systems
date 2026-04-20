import { z } from "zod";

export const createItemSchema = z.object({
  workflow_id: z.string().uuid(),
  title: z.string().min(1).max(500).trim(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const transitionItemSchema = z.object({
  transition_id: z.string().uuid(),
  version: z.number().int().positive(), // for optimistic locking
  idempotency_key: z.string().max(255).optional(),
});
