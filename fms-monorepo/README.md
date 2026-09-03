# FMS Monorepo

Finance / Petty Cash Management System with an Express + Prisma API, PostgreSQL, and a Next.js App Router frontend. The frontend accesses financial data only through the authenticated backend API.

## Local development with Docker

The base `docker-compose.yml` is development-only. It applies migrations and creates environment-controlled demo users.

```powershell
docker compose --env-file .env.development up --build -d
docker compose ps
```

Open `http://localhost:3000`. Development credentials come from `DEV_SEED_FINANCE_PASSWORD` and `DEV_SEED_USER_PASSWORD` in `.env.development`; the Finance Head email is `finance.head@fms.local`. Do not reuse these values outside local development.

Stop the stack with `docker compose down`. Named volumes preserve data and uploads.

## Local development without Docker

1. Start PostgreSQL and make it match `backend/.env.development`.
2. Load `backend/.env.development` into the process environment.
3. In `backend`, run `npm install`, `npx prisma migrate dev`, `npm run seed:dev`, and `npm run dev`.
4. In `frontend`, copy `.env.development` to `.env.local`, run `npm install`, then `npm run dev`.

## Production deployment

Production uses the standalone `docker-compose.prod.yml`; do not combine it with the development Compose file.

1. Point the public DNS A/AAAA record for the FMS domain to the server.
2. Allow inbound TCP 80/443 and UDP 443. Do not publicly expose PostgreSQL or port 4000.
3. Copy `.env.production.example` to the ignored `.env.production` file.
4. Replace every placeholder. Generate `JWT_SECRET` with a cryptographically secure generator (at least 48 characters), use a unique database password, URL-encode it in `DATABASE_URL`, and set the real `FMS_DOMAIN` and `PROD_ADMIN_EMAIL`.
5. Validate the rendered configuration:

   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
   ```

6. Build and start:

   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml up --build -d
   ```

7. On the first successful boot only, capture the randomly generated Finance Head password from restricted backend logs:

   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml logs backend
   ```

   Store it in a password manager. Later seed runs skip the existing account without printing or replacing its password.

8. Open `https://<FMS_DOMAIN>`. Caddy obtains and renews public HTTPS certificates automatically.
9. Verify login, secure cookie flags, health, uploads, approvals, ledger, audit, CSV/PDF exports, backups, and restore procedures.

Backend startup fails fast in production if `JWT_SECRET` is short/default/low-diversity, `COOKIE_SECURE` is not `true`, or `FRONTEND_URL` is not HTTPS.

## Security and configuration

- Browser sessions use an eight-hour `httpOnly`, `Secure` (production), `SameSite=Strict` cookie.
- Development seed refuses to run unless `NODE_ENV=development` and its two password variables contain at least 12 characters.
- Production seed refuses to run outside `NODE_ENV=production` and creates only one Finance Head account.
- `BUDGET_ENFORCEMENT` supports `warn`, `block`, or `off`; production defaults to `block`.
- Local receipts are stored under `backend/uploads/`; production Compose persists them in a named volume.

See `docs/phase-6.md` for verification details and the full deployment checklist.

## Current scope limitations

Email delivery, private object storage/signed receipt URLs, malware scanning, opening-fund/deposit workflows, database-managed approval chains, SSO/2FA, multi-currency, mobile applications, and horizontal scaling are not included.
