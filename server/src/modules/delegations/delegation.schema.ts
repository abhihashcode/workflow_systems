import { z } from "zod";

export const createDelegationSchema = z.object({
  delegate_email: z.string().email(),
  valid_until: z.string().datetime().optional(), // ISO string; null = indefinite
  reason: z.string().max(500).optional(),
});

export const revokeDelegationSchema = z.object({
  delegation_id: z.string().uuid(),
});
