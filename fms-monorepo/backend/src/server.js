import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import branchRoutes from "./routes/branches.routes.js";
import cashAdvanceRoutes from "./routes/cash-advance.routes.js";
import categoriesRoutes from "./routes/categories.routes.js";
import expensesRoutes from "./routes/expenses.routes.js";
import ledgerRoutes from "./routes/ledger.routes.js";
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
app.use("/api/categories", categoriesRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode ?? 500).json({ error: error.statusCode ? error.message : "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`FMS API listening on http://localhost:${port}`));
