# Phase 7 — Secure file storage

## What changed

### Private storage abstraction

- `backend/src/lib/storage.js` provides one interface for `local` and `s3` storage.
- `s3` uses `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, so AWS S3, Cloudflare R2, and compatible services are supported.
- Production startup requires `STORAGE_PROVIDER=s3`; `local` remains available for development without a cloud account.
- S3/R2 buckets must remain private. No object ACL or public receipt URL is stored in the database.

### Memory-only upload pipeline

```text
Browser multipart upload
  -> Multer memoryStorage (5 MB hard limit)
  -> declared MIME check
  -> extension + magic-byte/content check
  -> malware-scan integration stub
  -> local private storage or S3 PutObject
  -> Expense database transaction
```

- Multer no longer writes incoming files to temporary disk.
- Allowed formats remain JPG/JPEG, PNG, WebP, and PDF.
- `file-type` inspects file signatures. Declared MIME, extension, and detected content type must agree.
- Keys follow `{branchId}/{expenseId}/{uuid}-{sanitizedOriginalName}`.
- A UUID expense ID is allocated before upload so the final organized key is known in advance.
- If the database transaction fails after storage succeeds, the uploaded object is deleted to prevent an orphan.
- `scanReceiptForMalware` is an explicit no-op integration point for future ClamAV or a managed scanner; it does not claim to scan files today.

### Authorized receipt access

- `GET /api/expenses/:id/receipt-url` requires a valid session.
- Branch Manager, Program Officer, and Data Entry Operator are restricted to their assigned branch. Organization-level roles retain their existing global scope.
- S3/R2 returns a presigned `GetObject` URL with a 15-minute expiry.
- Local development returns a backend URL protected by an HMAC signature and expiry; the local download also requires the authenticated session and repeats branch authorization.
- API expense responses expose only `hasReceipt`, not `receiptKey`.
- Expense CSV exports contain the protected receipt-access endpoint rather than a storage key/public URL.
- The old public Express `/uploads` static route was removed, and Caddy no longer proxies `/uploads`.

### Database migration

- Prisma `Expense.receiptUrl` was renamed to `receiptKey`.
- Migration `20260903233000_phase_7_secure_receipt_storage` renames the PostgreSQL column and preserves existing values.
- No financial models, relationships, role enums, or approval rules changed.

## Environment variables

| Variable | Local development | AWS S3 | Cloudflare R2 |
|---|---|---|---|
| `STORAGE_PROVIDER` | `local` | `s3` | `s3` |
| `STORAGE_BUCKET` | empty | private bucket name | private bucket name |
| `STORAGE_ACCESS_KEY` | empty | IAM access key | R2 access key ID |
| `STORAGE_SECRET_KEY` | empty | IAM secret | R2 secret access key |
| `STORAGE_REGION` | `us-east-1` | actual AWS region | `auto` |
| `STORAGE_ENDPOINT` | empty | empty | `https://ACCOUNT_ID.r2.cloudflarestorage.com` |

Use an IAM/R2 credential limited to the single receipt bucket and only the required object read/write/delete operations. Never commit `.env.production`.

## Fresh deployment

1. Create a private bucket with public access blocked.
2. Configure the six storage variables in `.env.production`.
3. Validate Compose: `docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet`.
4. Start normally: `docker compose --env-file .env.production -f docker-compose.prod.yml up --build -d`.
5. Upload a test receipt, retrieve it through the receipt button, and confirm the signed URL expires.

## Existing-data migration

Back up PostgreSQL and the complete legacy uploads volume/directory before starting.

1. Stop application writes or place the application in maintenance mode.
2. Configure and test the target private S3/R2 bucket.
3. Build the new backend image.
4. Apply the Prisma migration, which renames the column without deleting values:

   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy
   ```

5. Ensure the legacy volume is mounted at `/app/uploads`, then run:

   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend npm run receipts:migrate
   ```

   Outside Docker, set `LEGACY_UPLOAD_DIR` when files are not in `backend/uploads`.

6. The script selects only keys beginning with `/uploads/`, validates each old file, uploads it under the new key structure, and conditionally updates its database row.
7. Re-running is safe: already migrated rows no longer match `/uploads/` and are skipped.
8. Start the application and verify receipt access across branches and roles.
9. Retain old files through the backup/verification window. The script deliberately never deletes them.

If migration stops on a missing or invalid file, correct that file from backup and rerun. Do not discard the database or legacy volume.

## Test plan

### Upload safety

1. Upload valid JPG, JPEG, PNG, WebP, and PDF files below 5 MB; each should succeed.
2. Upload a file over 5 MB; Multer must return HTTP 400.
3. Rename an executable/text file to `.jpg`; magic-byte validation must reject it.
4. Send a PNG as `image/jpeg` or with a `.pdf` extension; mismatch validation must reject it.
5. Use names containing paths/special characters; the stored key must contain only a sanitized basename.
6. Force a database failure after upload in a test environment and confirm object cleanup.

### Authorization and signed URLs

1. Request `/api/expenses/:id/receipt-url` without authentication; expect 401.
2. Request another branch's receipt as a branch-scoped user; expect 404 without revealing whether it exists.
3. Request an in-scope receipt; expect `{ url, expiresIn: 900 }`.
4. Open the signed URL before expiry; expect the correct content and private/no-store behavior for local mode.
5. Modify the local signature or expiry; expect 403. Test an expired S3/R2 URL; the provider must reject it.
6. Confirm list APIs and CSV exports do not expose the bucket key.

### Provider and configuration checks

1. Run local development with `STORAGE_PROVIDER=local` and no cloud credentials.
2. Start with `STORAGE_PROVIDER=s3` while omitting each required bucket credential; startup must fail fast.
3. Production with `STORAGE_PROVIDER=local` must fail fast.
4. Test AWS S3 with an empty endpoint and its real region.
5. Test R2 with region `auto` and the account-specific S3 endpoint.

### Regression checks

- Prisma format/validate and migration status.
- Backend syntax and storage unit tests.
- Run the reusable local smoke test with `npm run test:storage`.
- Frontend ESLint, TypeScript, and production build.
- Cash advance, expense creation/approval, reconciliation, ledger, notifications, audit, CSV, and PDF smoke tests.

## Operational checklist

- [ ] Bucket public access is blocked.
- [ ] Storage credential follows least privilege and has a rotation owner.
- [ ] Bucket encryption, versioning/lifecycle, retention, and backups match organizational policy.
- [ ] CORS on the bucket is not needed for server-generated `GetObject` links unless the frontend later fetches objects via JavaScript.
- [ ] Legacy database and file backups were taken and restore-tested.
- [ ] Legacy migration completed and receipt counts were reconciled.
- [ ] Signed URL expiry and branch isolation were verified.
- [ ] Malware scanning is integrated before treating uploads as actively scanned.
