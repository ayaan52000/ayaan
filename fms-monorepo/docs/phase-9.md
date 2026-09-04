# Phase 9 — Email notifications

Email is an addition to the existing in-app notification system. FMS supports Resend and SendGrid through the provider-neutral `backend/src/lib/email.js`; Resend is the recommended default because its HTTP API is small and free-tier friendly. No provider SDK is required.

## Environment

```env
EMAIL_NOTIFICATIONS_ENABLED=true
EMAIL_PROVIDER=resend # resend, sendgrid, console, or disabled
EMAIL_API_KEY=re_xxx
EMAIL_FROM_ADDRESS=notifications@your-verified-domain.org
EMAIL_FROM_NAME=Your NGO Finance
EMAIL_RATE_LIMIT_PER_HOUR=20
```

The API key is required only for `resend` and `sendgrid`. The sender address/domain must be verified with the selected provider. Set `EMAIL_PROVIDER=console` and enable notifications locally to print complete messages without making network requests.

## Templates and delivery

Templates live in `backend/src/emails/`: cash advance request, decision and disbursement; expense submission and decision; and the Phase 8 fund-utilization warning. They share a lightweight, inline-CSS layout.

Email dispatch is attached to the existing `createNotification` and `notifyRole` helpers. In-app rows are still created normally. Provider work runs via `setImmediate`, catches/logs failures, and cannot roll back approval, expense, disbursement, or fund transactions. There is no retry queue in this phase.

Each process keeps a rolling one-hour, per-user delivery window. The default limit is 20 emails per user per hour. This is deliberately simple and resets on process restart; a shared Redis limiter/digest queue is future scope for multi-instance deployments.

## Preferences and health

Every user defaults to `emailNotificationsEnabled=true`. Users can change it from their role's **Settings** page. The endpoints are `GET/PATCH /api/auth/preferences`. Preference changes are audited. `GET /health` reports the provider, enabled state, and whether its configuration is present; it does not make a paid/test delivery.

## Test

1. Apply migrations and regenerate Prisma Client.
2. Set `EMAIL_NOTIFICATIONS_ENABLED=true` and `EMAIL_PROVIDER=console`, then restart the API.
3. Trigger each existing request/approve/reject/disburse flow and inspect backend output for `[email:console]`.
4. Toggle email off in Settings and verify the bell notification still appears but no console email is printed.
5. Set a low `EMAIL_RATE_LIMIT_PER_HOUR`, restart, and confirm excess messages log a rate-limit notice.
6. Configure a verified Resend or SendGrid sender, replace console mode, and send to test accounts.
7. Confirm `/health` exposes only configuration status and never the API key.
