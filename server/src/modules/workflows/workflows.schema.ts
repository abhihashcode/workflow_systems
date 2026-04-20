import { z } from "zod";

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().optional(),
  states: z
    .array(
      z.object({
        name: z.string().min(1).max(100).trim(),
        description: z.string().optional(),
        is_initial: z.boolean().default(false),
        is_terminal: z.boolean().default(false),
        position_order: z.number().int().default(0),
      }),
    )
    .min(2),
  transitions: z
    .array(
      z.object({
        from_state: z.string(),
        to_state: z.string(),
        name: z.string().optional(),
        requires_approval: z.boolean().default(false),
        approval_strategy: z
          .enum(["none", "single", "all", "quorum"])
          .default("none"),
        quorum_count: z.number().int().positive().optional(),
        allowed_roles: z
          .array(z.enum(["admin", "member", "approver", "viewer"]))
          .optional(),
      }),
    )
    .min(1),
});

export const addStateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().optional(),
  is_initial: z.boolean().default(false),
  is_terminal: z.boolean().default(false),
  position_order: z.number().int().default(0),
});

export const addTransitionSchema = z.object({
  from_state_id: z.string().uuid(),
  to_state_id: z.string().uuid(),
  name: z.string().optional(),
  requires_approval: z.boolean().default(false),
  approval_strategy: z
    .enum(["none", "single", "all", "quorum"])
    .default("none"),
  quorum_count: z.number().int().positive().optional(),
  allowed_roles: z
    .array(z.enum(["admin", "member", "approver", "viewer"]))
    .optional(),
});
