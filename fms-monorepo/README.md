# FMS Monorepo

Phase 0 skeleton for a Finance / Petty Cash Management system. It contains two separate applications: an Express + Prisma API and a Next.js App Router frontend. The frontend communicates with the database only through the backend HTTP API.

## Run locally

1. Run `docker compose up -d` to start PostgreSQL `fms_db` on port `5433` (or provide an equivalent local database).
2. Copy `backend/.env.example` to `backend/.env` and set secure values if it does not exist.
3. Copy `frontend/.env.example` to `frontend/.env.local`.
4. Run `npm install` inside both `backend` and `frontend`.
5. In `backend`, run `npx prisma migrate dev`, `npx prisma db seed`, then `npm run dev`.
6. In `frontend`, run `npm run dev` and open `http://localhost:3000`.

Development login: `admin` / `admin` (Finance Head). Other seeded accounts and passwords are printed by `npx prisma db seed`.

## Phase 0 scope

Included through Phase 3: core schema, JWT login, protected registration, seed data, branch-scoped cash advances and expenses, two-level approvals, transactional disbursement and settlement, local receipt uploads, configurable category-budget enforcement, per-branch ledgers, scoped CSV reports, audit logging/viewing, role guards, and responsive workflow dashboards.

Receipt files are stored under `backend/uploads/` for local development and served from `http://localhost:4000/uploads/...`.

Budget policy is configured with `BUDGET_ENFORCEMENT=warn`, `block`, or `off` in `backend/.env`; `warn` is the default.

Not included: cloud receipt storage, opening-fund/deposit workflows, database-managed approval-chain configuration, PDF reports, notifications, and advanced analytics.
