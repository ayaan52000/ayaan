# Phase 6 — Production hardening

## What changed

### Credential and seed isolation

- `backend/prisma/seed.js` is now development-only. It exits unless `NODE_ENV=development`, requires `DEV_SEED_FINANCE_PASSWORD` and `DEV_SEED_USER_PASSWORD` (minimum 12 characters), and contains no `admin/admin` password.
- The login page no longer pre-fills or displays demo credentials, and the backend no longer maps the `admin` alias to an email.
- `backend/prisma/seed.production.js` is a separate production bootstrap. It requires `NODE_ENV=production` and `PROD_ADMIN_EMAIL`, creates only a `FINANCE_HEAD`, generates a cryptographically random password, and prints it only when the account is first created.
- A repeated production seed finds the account and exits without changing or revealing its password. A unique email constraint also handles concurrent bootstrap attempts safely.
- Existing roles and Prisma models are unchanged; no migration was added.

### Secrets and startup validation

- Backend environment validation still requires a valid `DATABASE_URL` and a JWT secret of at least 32 characters in every environment.
- Production additionally requires a JWT secret of at least 48 characters, rejects known placeholders and low-diversity values, requires `COOKIE_SECURE=true`, and requires an HTTPS `FRONTEND_URL`.
- Invalid production configuration terminates the process before the HTTP server starts.
- JWT signing and verification both use the already validated environment object.

### Cookie security

- Login and logout use matching cookie attributes.
- The session cookie remains `httpOnly`, is controlled by `COOKIE_SECURE`, has an eight-hour lifetime, and now uses `SameSite=Strict`.
- Production validation guarantees that `Secure` cannot accidentally be disabled.

### Environment separation

- Root `.env.development` configures the development Compose stack.
- Root `.env.production.example` documents all production Compose values and is copied to the ignored `.env.production` file during deployment.
- Backend now has `.env.example`, `.env.development`, and `.env.production.example` variants.
- Frontend has `.env.development` and `.env.production.example` variants.
- The base `docker-compose.yml` explicitly runs in development mode and invokes only the development seed.
- Secrets-bearing `.env.production` and `.env.local` files are ignored by Git.

### HTTPS production stack

- `docker-compose.prod.yml` is a standalone production definition. PostgreSQL, backend, and frontend are internal-only; only Caddy publishes ports 80 and 443.
- Caddy routes `/api/*`, `/uploads/*`, and `/health` to Express and all other paths to Next.js.
- `deploy/Caddyfile` enables automatic certificate issuance/renewal, compression, a 6 MB request limit, HSTS, `nosniff`, and a strict referrer policy.
- The production backend applies existing migrations, runs the idempotent production bootstrap, and then starts the API.
- Named volumes persist PostgreSQL data, uploads, and Caddy certificate state.

## How to test

### Static and build checks

```sh
cd backend
npm ci
npx prisma format --check
npx prisma validate
npm run prisma:generate
node --check src/server.js
node --check prisma/seed.js
node --check prisma/seed.production.js

cd ../frontend
npm ci
npm run lint
npm run build
```

### Fail-fast environment tests

Start the backend with `NODE_ENV=production` and each invalid setting in isolation:

- a known/default JWT secret;
- a JWT secret shorter than 48 characters;
- a low-diversity repeated secret;
- `COOKIE_SECURE=false`;
- an HTTP `FRONTEND_URL`.

Each case must exit before printing the API listening message. A random 48+ character JWT secret, `COOKIE_SECURE=true`, and an HTTPS frontend URL must pass validation.

### Seed tests

1. Run the development seed with `NODE_ENV=production`; it must refuse without writing data.
2. Run it in development without either seed password; it must refuse.
3. Run it with both 12+ character development passwords; all six existing roles must be present.
4. Against an empty test database, run `npm run seed:production` with production mode and a valid email. Exactly one Finance Head must be created and one random password printed.
5. Run it again. It must report that bootstrap was skipped, without printing a password or modifying the stored hash.

### Cookie and proxy tests

1. Log in over the production HTTPS URL.
2. Inspect `Set-Cookie`: it must include `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, and the expected expiry.
3. Confirm HTTP redirects to HTTPS and the certificate is valid.
4. Confirm the browser can call `/api/*`, load `/uploads/*`, and download CSV/PDF files through the public domain.
5. Confirm ports 3000, 4000, and 5432 are not publicly reachable.

### Compose validation

```sh
docker compose --env-file .env.development config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
```

The production command must fail if a required variable is absent.

## Production deployment checklist

- [ ] DNS points the FMS domain to the deployment host.
- [ ] TCP 80/443 and UDP 443 are allowed; database/backend/frontend ports are not public.
- [ ] `.env.production` was created outside version control with restrictive filesystem permissions.
- [ ] PostgreSQL password is unique and its `DATABASE_URL` representation is URL-encoded.
- [ ] JWT secret is cryptographically random, unique to FMS, and at least 48 characters.
- [ ] `FMS_DOMAIN`, `PROD_ADMIN_EMAIL`, and `PROD_ADMIN_NAME` are correct.
- [ ] `COOKIE_SECURE=true` is enforced by the production definition.
- [ ] Budget enforcement mode was deliberately selected.
- [ ] Compose configuration validation passes.
- [ ] Database and upload backup schedules exist and a restore has been tested.
- [ ] The first Finance Head password was captured through restricted logs and stored in a password manager.
- [ ] Access to container logs is restricted because first-boot logs contain the bootstrap password.
- [ ] HTTPS certificate, redirect, HSTS, secure cookie, login/logout, and role authorization were verified.
- [ ] Cash advance, expense, approval, disbursement, reconciliation, ledger, notifications, audit, CSV, PDF, and receipt flows passed smoke tests.
- [ ] Monitoring, log retention, disk capacity, patching, and incident response ownership are defined.

## Compatibility notes

- No Prisma schema or migration changed.
- All six role enum values and permission mappings remain intact.
- Existing financial workflows and API route shapes remain intact.
- Historical phase documents describe behavior at those phases; this document and the current README supersede their old demo-login and cookie-setting notes.
