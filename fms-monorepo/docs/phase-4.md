# Phase 4 — Notifications, PDF export, and production hardening

## Notifications

### Data model and API

- `Notification` stores recipient, message, typed event, related entity, read state, and timestamp.
- Supported types are `APPROVAL_PENDING`, `APPROVED`, `REJECTED`, `DISBURSED`, and `SETTLED`.
- `backend/src/lib/notify.js` provides individual and role-based notification helpers that accept a Prisma transaction client.
- `GET /api/notifications` returns the current user's 30 newest notifications and unread count.
- `PATCH /api/notifications/:id/read` can update only a notification owned by the authenticated user.

### Trigger map

- Cash advance created → active Accounts Heads receive level-1 approval notifications.
- Cash advance level 1 approved → active Finance Heads receive final-approval notifications.
- Cash advance final approval → original requester receives an approved notification.
- Cash advance rejected at either valid level → requester receives a rejected notification.
- Cash advance disbursed → requester receives a disbursement notification.
- Expense created → active Branch Managers in that expense's branch receive level-1 approval notifications.
- Expense level 1 approved → active Accounts Heads receive final-approval notifications.
- Expense final approval → creator receives an approved notification.
- Expense rejected → creator receives a rejected notification.
- Cash advance settled → requester and active Accounts Heads receive settlement notifications.

`frontend/components/NotificationBell.tsx` polls every 30 seconds, shows unread count and recent messages, marks clicked items as read, and navigates to the relevant dashboard section. Email was optional and was not enabled; `EMAIL_NOTIFICATIONS_ENABLED=false` reserves the deployment flag for a later mail transport if genuinely needed.

## PDF export

- `GET /api/reports/branch-summary.pdf` requires ledger-view permission and generates a PDFKit table of active branches, workflow counts, and latest balances.
- `GET /api/cash-advance/:id/receipt.pdf` generates a one-page voucher for a disbursed or settled advance. It includes branch, requester, amount, purpose, status, disbursement date, approver names/roles/dates, approved expense total, and settlement variance.
- PDF responses use `application/pdf` and attachment filenames; no headless browser is required.
- `frontend/components/ReportsModule.tsx` includes Branch Summary PDF alongside CSV exports for Finance Head, Accounts Head, and Auditor.
- Disbursed and settled rows in `CashAdvanceModule.tsx` include a PDF Voucher download.

## Authentication choice

JWTs now live in an `httpOnly` cookie named `fms_session`; the JWT is no longer returned to or stored by browser JavaScript.

- Cookie settings: `httpOnly`, eight-hour expiry, `sameSite=lax`, root path, and environment-controlled `secure`.
- The frontend uses `credentials: include` and no longer attaches Bearer tokens.
- The backend temporarily retains Bearer-token acceptance for non-browser/API compatibility.
- `POST /api/auth/logout` clears the cookie.
- localStorage contains only the non-secret user display profile used by client routing. Backend authorization always relies on the signed cookie.
- This choice targets same-site frontend/API deployment. Production must use HTTPS, `COOKIE_SECURE=true`, exact CORS origin, and compatible same-site domains or a reverse proxy.

## Backend hardening

- Login is limited to 10 requests per IP per 15 minutes using `express-rate-limit`, with standard rate-limit headers and a consistent 429 JSON error.
- `helmet` supplies security headers and Express's identifying header is disabled.
- CORS allows only the configured frontend origin and credentials.
- Morgan provides concise development logs and combined production request logs.
- JSON bodies are capped at 1 MB; receipt uploads remain capped at 5 MB and MIME-restricted.
- `backend/src/lib/env.js` validates database URL, JWT secret length, frontend URL, port, cookie mode, budget mode, and notification flags at startup. Invalid configuration stops the process.
- Central error handling converts validation/upload errors to consistent `{ "error": "..." }` responses, respects known 4xx errors, and does not return stack traces.
- All body-bearing routes use Zod validation; multipart fields are validated after Multer parsing.
- Audit and notification writes are included in the same transactions as important state changes.
- Prisma indexes were added for branch/status/date queries, approval actors, ledger relations, audit filters, active role lookup, and notification inbox access.
- `backend/prisma/migrations/20260902223000_phase_4_notifications_hardening/migration.sql` creates notifications and the performance indexes.

## Frontend resilience

- `frontend/app/error.tsx` is the App Router error boundary with a safe retry screen.
- `frontend/app/loading.tsx` supplies a global route loading screen.
- Cash-advance and expense forms disable and relabel submit buttons while working.
- Cash-advance and expense tables show loading rows; review, settlement, report, notification, and registration actions already expose working/disabled states.

## Deployment files

- `backend/Dockerfile` builds the API with Node 20 Alpine, installs OpenSSL for Prisma, generates the client, and starts with production settings.
- `frontend/Dockerfile` creates a multi-stage Next.js standalone image.
- `docker-compose.yml` wires Postgres, backend, and frontend. Postgres data and uploaded receipts use named volumes. Backend waits for database health, applies migrations, performs idempotent development seeding, and starts on port 4000.
- `backend/.env.production.example` and `frontend/.env.production.example` document deployment-only values.
- `.github/workflows/ci.yml` runs backend install/schema validation/client generation/syntax checks and frontend install/lint/build on pushes and pull requests.

## Run the complete stack

1. Install Docker Desktop and ensure it is running.
2. For shared or public deployments, set `POSTGRES_PASSWORD` and a strong `JWT_SECRET` in the Compose environment; replace the example URLs and enable secure cookies behind HTTPS.
3. From `fms-monorepo`, run `docker compose up --build -d`.
4. Wait for `docker compose ps` to show PostgreSQL healthy and both apps running.
5. Open `http://localhost:3000`. The local Compose seed provides `admin / admin`; other credentials are printed by the backend seed logs.
6. View logs with `docker compose logs -f backend frontend`.
7. Stop services with `docker compose down`. Named volumes preserve database and uploads; add `--volumes` only when intentionally deleting all local FMS data.

## Verification performed

- Phase 4 migration applied and Prisma Client/schema validation passed.
- TypeScript and ESLint passed; local and Docker Next.js standalone production builds passed.
- Docker Compose built and started all three services. PostgreSQL reported healthy, backend applied four migrations and seeded cleanly, `/health` returned `ok`, and frontend `/login` returned HTTP 200.
- Login set an httpOnly session cookie and returned no token field. Malformed login returned HTTP 400 with the consistent error shape.
- Cash creation notified Accounts Head; level 1 notified Finance Head; final approval and disbursement notified the requester.
- Expense creation notified the branch's manager; rejection notified the creator. Mark-read updated only the signed-in user's notification.
- Settlement notified Accounts Head/requester.
- Branch Summary and cash voucher endpoints returned valid `application/pdf` files (2,039-byte voucher in the smoke test).
- Login testing produced 401 responses until the configured limit, followed by 429 responses; the process was reset afterward.
- The Docker-specific Prisma/OpenSSL runtime was tested and corrected; the final backend starts without the earlier engine error.

## Open only if needed later

- Multi-currency accounting and exchange-rate history.
- SSO, 2FA, and enterprise identity-provider integration.
- Native mobile application.
- Horizontal scaling, shared rate-limit/session infrastructure, centralized logs, and object storage.
- Optional SMTP/email notifications, malware scanning, private signed receipts, and PDF branding/templates.
