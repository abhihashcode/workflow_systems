import { z } from "zod";

export const createTenantSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens")
    .trim(),
});

export const updateMembershipSchema = z.object({
  role: z.enum(["admin", "member", "approver", "viewer"]),
});

export const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "approver", "viewer"]).default("member"),
});
