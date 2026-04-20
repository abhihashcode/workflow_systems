import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { queryOne } from "../../db";
import { config } from "../../config";
import { ConflictError, UnauthorizedError } from "../../utils/errors";
import { User } from "../../types";
import { createAuditLog } from "../audit/audit.service";
import { registerSchema, loginSchema } from "./auth.schema";

export async function register(
  data: z.infer<typeof registerSchema>,
): Promise<{ user: Omit<User, "password_hash">; token: string }> {
  const existing = await queryOne<User>(
    "SELECT id FROM users WHERE email = $1",
    [data.email],
  );
  if (existing) {
    throw new ConflictError("Email already in use");
  }

  const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);

  const user = await queryOne<User>(
    `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3)
     RETURNING id, email, full_name, created_at, updated_at`,
    [data.email, passwordHash, data.full_name],
  );

  if (!user) throw new Error("Failed to create user");

  await createAuditLog({
    actorId: user.id,
    action: "user.registered",
    entityType: "user",
    entityId: user.id,
  });

  const token = signToken(user.id, user.email);
  return { user, token };
}

export async function login(
  data: z.infer<typeof loginSchema>,
): Promise<{ user: Omit<User, "password_hash">; token: string }> {
  const user = await queryOne<User & { password_hash: string }>(
    "SELECT id, email, full_name, password_hash, created_at, updated_at FROM users WHERE email = $1",
    [data.email],
  );

  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const valid = await bcrypt.compare(data.password, user.password_hash);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  await createAuditLog({
    actorId: user.id,
    action: "user.logged_in",
    entityType: "user",
    entityId: user.id,
  });

  const { password_hash: _pw, ...userWithoutPassword } = user;
  const token = signToken(user.id, user.email);
  return { user: userWithoutPassword, token };
}

export async function getMe(
  userId: string,
): Promise<Omit<User, "password_hash">> {
  const user = await queryOne<User>(
    "SELECT id, email, full_name, created_at, updated_at FROM users WHERE id = $1",
    [userId],
  );
  if (!user) throw new UnauthorizedError();
  return user;
}

function signToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}
