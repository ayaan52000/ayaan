import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import branchRoutes from "./routes/branches.routes.js";
import cashAdvanceRoutes from "./routes/cash-advance.routes.js";
import categoriesRoutes from "./routes/categories.routes.js";
import expensesRoutes from "./routes/expenses.routes.js";
import ledgerRoutes from "./routes/ledger.routes.js";
import reconciliationRoutes from "./routes/reconciliation.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000" }));
app.use(express.json());
app.use("/uploads", express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../uploads")));
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/cash-advance", cashAdvanceRoutes);
app.use("/api/cash-advance", reconciliationRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/reports", reportsRoutes);
app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.statusCode ?? (error.name === "ZodError" || error.name === "MulterError" ? 400 : 500);
  res.status(status).json({ error: status < 500 ? error.message : "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`FMS API listening on http://localhost:${port}`));
