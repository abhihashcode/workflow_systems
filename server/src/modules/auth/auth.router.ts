import { Router, Request, Response } from "express";
import { register, login, getMe } from "./auth.service";
import { registerSchema, loginSchema } from "./auth.schema";
import { authenticate } from "../../middleware/auth";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  const result = await register(data);
  res.status(201).json(result);
});

router.post("/login", async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);
  const result = await login(data);
  res.json(result);
});

router.get("/me", authenticate, async (req: Request, res: Response) => {
  const user = await getMe(req.userId!);
  res.json(user);
});

export { router as authRouter };
