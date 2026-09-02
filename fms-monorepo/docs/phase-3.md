# Phase 3 — Reconciliation, reports, audit viewer, and budget enforcement

## What was built

### Cash-advance reconciliation

- `backend/src/routes/reconciliation.routes.js` adds a reconciliation preview and atomic settlement.
- A cash advance can be settled only from `DISBURSED`. Every linked expense must already be `APPROVED` or `REJECTED`; any `PENDING` expense returns 409.
- Settlement compares the disbursed amount with approved linked expenses.
- Positive variance creates a `REFUND` ledger entry and increases the running balance.
- Negative variance creates an `ADJUSTMENT` entry for the shortfall and decreases the running balance.
- Zero variance requires no new ledger entry. The advance still becomes `SETTLED`.
- Ledger creation, status transition, and audit logging run in one serializable Prisma transaction.
- `backend/prisma/migrations/20260902213000_phase_3_reconciliation/migration.sql` adds `REFUND` and `ADJUSTMENT` ledger types without altering existing records.

### Audit logging

- `backend/src/lib/audit.js` provides `logAction(userId, action, entityType, entityId, metadata, client)` and accepts a transaction client for atomic logging.
- Audit records are now written for user registration, branch creation, cash-advance create/approve/reject/disburse/settle, and expense create/approve/reject.
- Metadata records useful context without passwords or JWTs: approval level, amounts, branch/category identifiers, warnings, ledger entry identifiers, and status context.
- `backend/src/routes/audit.routes.js` provides a paginated audit feed with entity, actor, and date-range filtering.
- `VIEW_AUDIT_LOG` is restricted to Auditor and Finance Head.

### Reports

- `backend/src/routes/reports.routes.js` generates CSV directly without a heavy CSV dependency.
- CSV values are quoted and escaped, UTF-8 BOM is included for spreadsheet compatibility, and responses use attachment headers.
- Local branch roles automatically receive data only for their assigned branch. Organization-level roles can receive all branches or specify `branchId`.
- Optional `from` and `to` query parameters filter by creation date.
- `VIEW_REPORTS` allows every authenticated role to export the reports appropriate to its scope.

### Budget enforcement

- `backend/src/lib/budgetPolicy.js` reads `BUDGET_ENFORCEMENT` with supported values `warn`, `block`, and `off`; invalid/missing configuration safely defaults to `warn`.
- On the final expense approval level, the service calculates the projected approved total for that branch, category, and UTC calendar month.
- `warn` approves and returns a warning, matching Phase 2 behavior.
- `block` returns 409 before creating the final approval step or changing the expense status.
- `off` skips budget-cap evaluation.
- `backend/.env.example` documents the setting.

### Frontend

- `frontend/components/CashAdvanceModule.tsx` adds Accounts Head reconciliation controls. It fetches and displays disbursed amount, approved expenses, variance, and pending-expense state before confirmation.
- `frontend/components/ReportsModule.tsx` provides date filters and authenticated downloads for cash-advance, expense, and ledger CSV files to every role.
- `frontend/components/AuditLogViewer.tsx` gives Auditor and Finance Head a paginated, entity-filtered activity timeline.
- `frontend/components/Dashboard.tsx` integrates Reports and Audit navigation while preserving the existing responsive dashboard.
- `frontend/app/globals.css` styles settlement summaries, report cards, audit rows, pagination, and mobile layouts.

## Endpoints

- `GET /api/cash-advance/:id/reconciliation-summary` — authenticated, role-scoped preview containing disbursed amount, approved-expense total, variance, pending flag, linked expenses, and related ledger entries.
- `PATCH /api/cash-advance/:id/settle` — `WRITE_LEDGER`; reconciles and settles atomically.
- `GET /api/audit?entityType=&userId=&from=&to=&limit=&offset=` — Finance Head/Auditor only; maximum page size 100.
- `GET /api/reports/cash-advances.csv?from=&to=&branchId=` — scoped cash-advance export.
- `GET /api/reports/expenses.csv?from=&to=&branchId=` — scoped expense export.
- `GET /api/reports/ledger.csv?from=&to=&branchId=` — scoped ledger export.

## Manual reconciliation test

1. Start PostgreSQL with `docker compose up -d`, then start backend and frontend.
2. Complete Cash Advance request → Accounts Head approval → Finance Head approval → disbursement.
3. Submit linked expenses as Data Entry Operator, then complete Branch Manager → Accounts Head review for each expense. Rejected expenses are allowed and excluded from the approved total.
4. Login as Accounts Head. Click **Reconcile** on the disbursed advance.
5. Review disbursed amount, approved expenses, and variance. Confirmation stays disabled while a linked expense is pending.
6. Confirm settlement. Verify status `SETTLED`; positive variance creates `REFUND`, negative variance creates `ADJUSTMENT`, and zero variance creates neither.
7. Inspect Live Ledger to verify the resulting running balance.

## Manual budget-policy test

1. Set `BUDGET_ENFORCEMENT=block` in `backend/.env` and restart the backend.
2. Create an expense whose final approval would push its branch/category monthly total beyond `budgetCap`.
3. Complete Branch Manager level 1, then attempt Accounts Head level 2. The API returns 409 and the expense remains `PENDING` without a level-2 step.
4. Change the setting to `warn`, restart, and retry. Approval succeeds and the response/UI displays the warning.
5. Use `off` to approve without cap evaluation.

## Manual audit and report test

1. Perform several mutations, then login as Auditor or Finance Head and open the Audit Log section.
2. Filter by CashAdvance, Expense, User, or Branch and use Previous/Next pagination.
3. A Branch Manager requesting `/api/audit` receives 403.
4. In Reports Center, select an optional date range and download each CSV.
5. Open the CSV in a spreadsheet. A branch-scoped user sees only their branch; Finance/Accounts/Auditor can export organization-wide data.

## Verification performed

- Prisma migration, client generation, and schema validation passed.
- Backend syntax checks, frontend TypeScript, ESLint, and Next.js production build passed.
- Reconciliation preview returned variance 2,500 with no pending expenses.
- Settlement changed the advance to `SETTLED`, created a `REFUND` for 2,500, and changed Main Branch running balance from -62,500 to -60,000.
- The settlement audit entry was returned by the CashAdvance entity filter.
- Auditor CSV export returned HTTP 200 with `text/csv`; Branch Manager report export returned 200 while audit access returned 403.
- Budget configuration resolved `block` correctly; existing `warn` behavior remains verified by the Phase 2 over-cap flow.

## Still missing

- Private/cloud receipt storage, malware scanning, and signed receipt URLs.
- Database/UI-managed approval chains and per-category policy overrides.
- Opening balances and funding/deposit workflows.
- PDF reports, scheduled reports, charts backed by report APIs, notifications, and advanced reconciliation analytics.
