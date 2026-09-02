# Phase 2 — Expenses, multi-level approval, and ledger dashboard

## What was built

### Schema and storage

- `backend/prisma/schema.prisma` links an expense to an optional cash advance, stores its `receiptUrl`, and adds unique entity/level constraints so the same approval level cannot be recorded twice.
- `backend/prisma/migrations/20260902203000_phase_2_expenses_approvals_ledger/migration.sql` adds the Phase 2 fields, constraints, and foreign key without resetting existing Phase 1 data.
- `multer` handles local multipart uploads. Files are limited to 5 MB, restricted to JPG, PNG, WebP, or PDF MIME types, renamed with random UUIDs and safe MIME-derived extensions, and saved under `backend/uploads/`.
- `backend/src/server.js` serves stored receipts at `/uploads` and mounts categories, expenses, and ledger routes.

### Configurable approval chains

- `backend/src/lib/approvalChains.js` defines the Phase 2 chains:
  - Cash Advance: Accounts Head at level 1, then Finance Head at level 2.
  - Expense: Branch Manager at level 1, then Accounts Head at level 2.
- The helper determines the next required level and role from existing approved steps. A wrong-role attempt returns 403.
- A parent remains `REQUESTED` (cash advance) or `PENDING` (expense) after level 1. It becomes `APPROVED` only after the final configured level.
- A rejection by the currently required role immediately adds a rejected step, marks the parent `REJECTED`, and ends the chain.
- Unique database constraints protect each entity from duplicate approval levels.

### Expense API

- `backend/src/routes/categories.routes.js` lists active categories for authenticated users.
- `backend/src/routes/expenses.routes.js` creates multipart expenses, validates non-file fields with Zod, verifies category and branch, and optionally links only to a disbursed advance in the creator's branch.
- Expense lists use the same scope rules as cash advances: local roles see their branch; Finance Head, Accounts Head, and Auditor see all branches.
- Expense approvals follow the configured Branch Manager → Accounts Head chain.
- Every approved step calculates that branch/category's approved monthly spending. An over-cap approval remains valid but returns a human-readable `warning`.
- Failed validations remove an uploaded file to avoid leaving an orphan receipt.

### Ledger API

- `backend/src/routes/ledger.routes.js` is protected by `VIEW_LEDGER`.
- `GET /api/ledger/summary` returns all active branches with their latest running balance and activity time.
- `GET /api/ledger/:branchId` returns the branch, its current balance, and chronologically ordered entries with creator and linked record information.

### Frontend

- `frontend/lib/api.ts` now detects `FormData` and lets the browser set the correct multipart boundary while retaining JWT authorization.
- `frontend/components/ExpenseModule.tsx` gives Data Entry Operators an amount, category, optional disbursed-advance, description, and receipt form. It also provides role-aware expense review tables to Branch Managers and Accounts Heads and read views to Finance Head/Auditor.
- `frontend/components/CashAdvanceModule.tsx` now displays the next required role and only renders decision buttons for the correct current approver.
- `frontend/components/LedgerDashboard.tsx` gives Finance Head, Accounts Head, and Auditor selectable branch balance cards plus full ledger history.
- `frontend/components/Dashboard.tsx` integrates expense and ledger sections with sidebar anchors. Styling remains responsive and consistent with the dark-purple FMS UI.

## New and changed endpoints

- `GET /api/categories` — authenticated active-category list.
- `POST /api/expenses` — `multipart/form-data` containing `amount`, `description`, `categoryId`, optional `cashAdvanceId`, and required `receipt`.
- `GET /api/expenses` — role-scoped expense list with category, creator, branch, linked advance, and approval steps.
- `PATCH /api/expenses/:id/approve` — required next expense approver; returns `{ expense, warning, nextRequiredRole }`.
- `PATCH /api/expenses/:id/reject` — required next expense approver; immediately rejects.
- `GET /api/ledger/summary` — all current branch balances for ledger-view roles.
- `GET /api/ledger/:branchId` — one branch's ordered entries and latest balance.
- Cash-advance approval/rejection endpoints now return `{ cashAdvance, nextRequiredRole }` and enforce the two-level chain.
- `GET /uploads/:filename` serves local receipt files.

## Manual test flow

1. Run `docker compose up -d`. Start the backend and frontend with `npm run dev` in their respective folders.
2. Login as `branch.manager@fms.local` / `Password123!` and submit a cash advance.
3. Login as `accounts.head@fms.local` / `Password123!`. Approve level 1; the request remains `REQUESTED` and shows Finance Head as next.
4. Login as `admin` / `admin`. Approve level 2; it becomes `APPROVED`. Disburse it; it becomes `DISBURSED` and creates a ledger entry.
5. Login as `data.entry@fms.local` / `Password123!`. In Expense Management, choose a category, optionally choose the disbursed advance, attach a JPG/PNG/WebP/PDF receipt, and submit.
6. Login as the Branch Manager and approve expense level 1. It remains `PENDING` with Accounts Head next.
7. Login as Accounts Head and approve level 2. It becomes `APPROVED`. If branch/category monthly totals exceed `budgetCap`, the UI shows the API warning without blocking approval.
8. Login as Finance Head, Accounts Head, or Auditor and inspect Live Ledger. Select a branch card to see ordered entries and running balances.
9. Try Finance Head before Accounts Head on a new cash advance, or Accounts Head before Branch Manager on a new expense; each attempt must return 403.

## Verification performed

- The Phase 2 migration applied without resetting existing data; Prisma schema validation passed.
- Backend JavaScript syntax checks passed.
- TypeScript, ESLint, and the Next.js production build passed with no errors.
- Cash-advance test: Finance Head at level 1 returned 403; Accounts Head level 1 kept `REQUESTED`; Finance Head level 2 set `APPROVED`; disbursement set `DISBURSED`.
- Expense test: multipart receipt upload created `PENDING`; Accounts Head at level 1 returned 403; Branch Manager level 1 kept `PENDING`; Accounts Head level 2 set `APPROVED`.
- A Travel expense of 60,000 returned the expected warning against its 50,000 monthly cap.
- Ledger detail returned two disbursements and a current Main Branch running balance of -62,500 in the test database.

## Still missing

- Cloud/S3 receipt storage and signed/private receipt access.
- Approval-chain administration in the database or UI; chains are configurable in code for now.
- Opening balances, funding/deposits, cash-advance settlement, unused-cash return, and expense-driven reconciliation.
- Reports, exports, notifications, and audit-log views.
