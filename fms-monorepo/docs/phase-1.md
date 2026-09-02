# Phase 1 — Seed data and cash advance workflow

## What was built

### Database and seed data

- `docker-compose.yml` runs a project-scoped PostgreSQL 16 database named `fms_db` on port 5433.
- `backend/prisma/schema.prisma` now supports expense-category budget caps, the `REQUESTED` cash-advance status, disbursement timestamps, approval levels, `DISBURSEMENT` ledger entries, and ledger running balances.
- `backend/prisma/migrations/20260902195257_phase_1_cash_advance/migration.sql` creates the complete database schema and was successfully applied locally.
- `backend/prisma/seed.js` idempotently creates Main Branch and North Branch, four expense categories, and one user for each of the six roles. Passwords are bcrypt hashes; development credentials are printed after seeding.
- `backend/package.json` registers the Prisma seed command. Run it with `npx prisma db seed`.

### Backend routes and permissions

- `backend/src/routes/cash-advance.routes.js` implements create, scoped list, detail, approve, reject, and disburse endpoints.
- Branch Manager and Program Officer requests are forced to their assigned branch. Branch-scoped roles can only read advances from their own branch.
- Approval is single-level: either Finance Head or Accounts Head can approve or reject a requested advance.
- Disbursement requires ledger-write permission and only accepts an approved request. Its status update and ledger creation run in one serializable Prisma transaction.
- Each disbursement calculates `runningBalance` as the previous branch ledger balance minus the advance amount. The first disbursement starts from zero.
- `backend/src/routes/auth.routes.js` adds Finance-Head-only registration with role-aware branch validation and duplicate-email handling.
- `backend/src/lib/permissions.js` adds `CREATE_USER`; `backend/src/server.js` mounts `/api/cash-advance`.

### Frontend workflow

- `frontend/components/CashAdvanceModule.tsx` shows a real request form to Branch Manager and Program Officer, scoped history to branch users, and a review table to Finance Head and Accounts Head.
- Reviewers can approve/reject requested entries and disburse approved entries. Results and API errors appear inline and the table refreshes after every action.
- `frontend/components/Dashboard.tsx` embeds the workflow and adds navigation to cash advances and user registration.
- `frontend/app/register/page.tsx` provides a Finance-Head-guarded registration form with live branches and conditional branch selection.
- `frontend/app/login/page.tsx` accepts either an email or the development alias `admin`. `admin / admin` authenticates through the real backend as the seeded Finance Head.

## Endpoints

- `POST /api/auth/register` — Finance Head only; accepts `name`, `email`, `password`, `role`, and optional/required `branchId` according to the role.
- `POST /api/cash-advance` — Branch Manager or Program Officer; accepts `branchId`, positive `amount`, and `purpose`.
- `GET /api/cash-advance` — all authenticated roles; branch-scoped for local roles and organization-wide for Finance Head, Accounts Head, and Auditor.
- `GET /api/cash-advance/:id` — returns an accessible request with branch, requester, and approval steps.
- `PATCH /api/cash-advance/:id/approve` — Finance Head or Accounts Head; optional `comment`.
- `PATCH /api/cash-advance/:id/reject` — Finance Head or Accounts Head; optional `comment`.
- `PATCH /api/cash-advance/:id/disburse` — Finance Head or Accounts Head; changes an approved request to disbursed and creates its ledger entry atomically.
- New frontend page: `/register`.

## Manual end-to-end test

1. From the repository root, run `docker compose up -d`.
2. In `backend`, run `npx prisma migrate dev`, then `npx prisma db seed`, then `npm run dev`.
3. In `frontend`, run `npm run dev`.
4. Login as `branch.manager@fms.local` / `Password123!`. Submit an amount and purpose in Cash Advances; it appears as `REQUESTED`.
5. Sign out and login as `admin` / `admin` (or `finance.head@fms.local` / `admin`). Approve the request; it changes to `APPROVED` and records one approval step.
6. Click Disburse; it changes to `DISBURSED`, records `disbursedAt`, and creates a ledger entry.
7. Login as `program.officer@fms.local` / `Password123!`. This North Branch user cannot see the Main Branch request.
8. As Finance Head, open `/register` to create another user. Branch roles require a branch; organization-wide roles reject branch assignment.

## Verification performed

- Prisma migration applied successfully and the seed command created the requested records.
- TypeScript and ESLint completed with no errors.
- Next.js production build completed successfully, including `/register` and all role pages.
- Automated API smoke flow produced `REQUESTED → APPROVED → DISBURSED`, one approval step, a `DISBURSEMENT` ledger entry for 2500, and running balance `-2500`.
- The North Branch response to the Main Branch request was an empty array.

## Still out of scope

Multi-level approval and escalation, expense entry, receipt uploads, opening-fund/deposit workflows, ledger balance display, and reports remain for later phases.
