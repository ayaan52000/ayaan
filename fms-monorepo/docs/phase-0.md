# Phase 0 — Project skeleton

## What was built

- `backend/prisma/schema.prisma` defines users, branches, categories, cash advances, expenses, generic approval steps, ledger entries, and audit logs, plus the required role and status enums.
- `backend/src/lib/prisma.js` provides one reusable Prisma client.
- `backend/src/lib/permissions.js` maps the initial actions to allowed roles.
- `backend/src/middleware/auth.js` validates Bearer JWTs and provides permission middleware.
- `backend/src/routes/auth.routes.js` validates login data, checks the bcrypt password, and issues an eight-hour JWT.
- `backend/src/routes/branches.routes.js` lists active branches and demonstrates a protected, validated create route.
- `backend/src/server.js` configures JSON parsing, restricted CORS, routes, error handling, and the health endpoint.
- `frontend/lib/api.ts` centralizes authenticated backend requests and login session storage.
- `frontend/components/RoleGuard.tsx` redirects unauthenticated or wrong-role users.
- `frontend/components/Dashboard.tsx` provides the responsive dark navy and purple dashboard shell shared by all six roles. Values and charts are static Phase 0 presentation data.
- `frontend/app/login/page.tsx` signs users in and routes them to their role dashboard.
- Six role pages, an unauthorized page, global visual styling, environment examples, and package configuration were added.

## Endpoints and pages

- `GET /health` — returns `{ "status": "ok" }`.
- `POST /api/auth/login` — accepts `{ "email", "password" }`.
- `GET /api/branches` — requires a valid Bearer token.
- `POST /api/branches` — requires a valid token, an allowed role, and `{ "name", "code" }`.
- Frontend pages: `/login`, `/unauthorized`, `/finance-head`, `/accounts-head`, `/branch-manager`, `/data-entry`, `/program-officer`, and `/auditor`.

## How to test

Configure the two environment files and database as described in `README.md`. Run the Prisma migration, start the backend on port 4000 and frontend on port 3000. Confirm `/health`, confirm `/api/branches` returns 401 without a token, then create a bcrypt-backed user through Prisma Studio. Login through `/login`; verify the correct role dashboard opens and another role URL redirects to `/unauthorized`.

## Explicitly deferred

Seed and registration scripts, working cash advance and expense routes, approval state changes, ledger balance calculations, real dashboard queries, and reports belong to later phases.
