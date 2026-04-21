import "express-async-errors";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./utils/logger";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.router";
import { tenantsRouter } from "./modules/tenants/tenants.router";
import { workflowsRouter } from "./modules/workflows/workflows.router";
import { itemsRouter } from "./modules/items/items.router";
import { approvalsRouter } from "./modules/approvals/approvals.router";
import { auditRouter } from "./modules/audit/audit.router";
import { delegationsRouter } from "./modules/delegations/delegations.router";
import type { Response } from "express";

type PinoResponse = Response & { responseTime: number };

const app = express();

// Middleware
app.use(
  cors({
    origin: process.env["FRONTEND_URL"] ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));

app.use(
  pinoHttp({
    logger,
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "debug";
    },
    customSuccessMessage(req, res) {
      return `${req.method} ${req.url} → ${res.statusCode}`;
    },
    customErrorMessage(req, res, err) {
      return `${req.method} ${req.url} → ${res.statusCode} — ${err.message}`;
    },
    serializers: {
      req(req) {
        return { method: req.method, url: req.url };
      },
      res(res) {
        return { status: res.statusCode };
      },
    },
    customProps(_req, res) {
      return { responseTime: `${(res as PinoResponse).responseTime}ms` };
    },
  }),
);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/tenants", tenantsRouter);
app.use("/api/tenants/:tenantId/workflows", workflowsRouter);
app.use("/api/tenants/:tenantId/items", itemsRouter);
app.use("/api/tenants/:tenantId/approvals", approvalsRouter);
app.use("/api/tenants/:tenantId/delegations", delegationsRouter);  // NEW
app.use("/api/tenants/:tenantId/audit", auditRouter);

// Error handler
app.use(errorHandler);

export { app };
