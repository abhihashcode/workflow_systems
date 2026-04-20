import { z } from "zod";

export const resolveApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(2000).optional(),
});
