# FMS Monorepo

Phase 0 skeleton for a Finance / Petty Cash Management system. It contains two separate applications: an Express + Prisma API and a Next.js App Router frontend. The frontend communicates with the database only through the backend HTTP API.

## Run locally

1. Run `docker compose up --build -d` to start the complete production-style frontend, backend, and PostgreSQL stack. Migrations and idempotent development seed data run automatically.
2. Copy `backend/.env.example` to `backend/.env` and set secure values if it does not exist.
3. Copy `frontend/.env.example` to `frontend/.env.local`.
4. Run `npm install` inside both `backend` and `frontend`.
5. In `backend`, run `npx prisma migrate dev`, `npx prisma db seed`, then `npm run dev`.
6. In `frontend`, run `npm run dev` and open `http://localhost:3000`.

Development login: `admin` / `admin` (Finance Head). Other seeded accounts and passwords are printed by `npx prisma db seed`.

## Phase 0 scope

Included through Phase 5: secure workflows and deployment from Phases 0–4 plus shared animated controls, separate role-aware dashboard section routes, inline ledger details, three persistent color themes, and animated cash-flow/ledger charts.

Receipt files are stored under `backend/uploads/` for local development and served from `http://localhost:4000/uploads/...`.

Budget policy is configured with `BUDGET_ENFORCEMENT=warn`, `block`, or `off` in `backend/.env`; `warn` is the default.

For a real deployment, copy both `.env.production.example` files, use strong unique secrets, HTTPS, `COOKIE_SECURE=true`, and deployment-specific public URLs. The development `admin / admin` credential must not be retained in a public production deployment.

Not included: email delivery (in-app notifications are complete), cloud receipt storage, opening-fund/deposit workflows, database-managed approval chains, SSO/2FA, mobile apps, horizontal scaling, and advanced analytics.
