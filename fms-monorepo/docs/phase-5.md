# Phase 5 — UI/UX polish

Phase 5 is frontend-only. No backend routes, database models, permissions, or business rules were changed.

## Shared animated Button

`frontend/components/ui/Button.tsx` is the single wrapper around the native HTML button. It forwards normal button attributes and refs while applying the shared `fms-button` behavior.

Every existing raw button was converted:

- Login submit and global error retry.
- Registration submit.
- Dashboard search control, sign out, summary-card actions, and placeholder review controls. Sidebar navigation uses Next.js links.
- Cash-advance submit, approve, reject, disburse, reconciliation preview/cancel/confirm, and PDF voucher download.
- Expense submit, approve, and reject.
- Ledger branch selection and inline detail toggles.
- Report CSV/PDF downloads.
- Audit Previous/Next pagination.
- Notification bell and notification rows.
- Theme trigger and all three theme choices.

Only `Button.tsx` now renders a native `<button>`. A repository search for raw buttons in other TSX files returns none.

### Interaction feedback

- Buttons transition down to `scale(.965)` while pressed and brighten slightly.
- A CSS radial opacity pulse expands during the active state.
- The interaction lasts roughly 130–140 ms and needs no animation dependency.
- Keyboard focus uses the active theme's secondary color.
- Disabled controls keep their prior states and do not animate.
- `prefers-reduced-motion` disables transform feedback for users requesting reduced motion.

## Sidebar routing and inline details

The corrected Phase 5 behavior uses normal Next.js `<Link>` routing. Each sidebar item opens its own page while the shared role-guarded dashboard shell remains consistent.

Routes follow `/{role}/{section}`, for example `/finance-head/expenses`, `/accounts-head/approvals`, and `/auditor/audit`.

Sidebar destinations are Overview, Cash Advances, Expenses, Approvals, Ledger, Branches, Reports, and (for authorized roles) Audit Log. The current destination is highlighted. Notifications route directly to the related Expenses or Cash Advances page.

- Overview → the role's root dashboard.
- Cash Advances → `/{role}/cash-advances`.
- Expenses → `/{role}/expenses`.
- Approvals → `/{role}/approvals`.
- Ledger → `/{role}/ledger`.
- Branches → `/{role}/branches`.
- Reports → `/{role}/reports`.
- Audit Log → `/{role}/audit` for Finance Head and Auditor.

Ledger row details still expand/collapse inline because they are row-level details, not top-level navigation.

Separate routes intentionally remain separate:

- `/login` is the authentication boundary.
- Six role dashboards and their section routes remain role-guarded.
- `/register` remains a Finance-Head-only task screen with its own form and guard.
- `/unauthorized` and the global error screen remain system states.

## Theme system

The shared header contains a swatch menu with three distinct themes:

- **Ocean** — deep blue with bright blue/teal accents.
- **Sunset** — warm brown-black with orange/gold accents.
- **Slate** — neutral graphite with cool grey accents.

Each theme is a CSS custom-property set scoped by `html[data-theme="..."]`. Components consume tokens such as `--bg`, `--panel`, `--card`, `--line`, `--text`, `--muted`, `--accent`, `--accent-2`, and `--accent-rgb`. These tokens drive dashboard backgrounds, auroras, cards, active navigation, controls, charts, status elements, and focus indicators.

`ThemeSwitcher.tsx` writes the selected ID to `localStorage.fms_theme` and updates the root `data-theme`. `app/layout.tsx` runs a small inline bootstrap in `<head>` before the body paints, so a valid saved choice is applied immediately and the default theme does not flash first.

### Adding a fourth theme

1. Add its ID and label to the `themes` array in `ThemeSwitcher.tsx`.
2. Accept the ID in the pre-paint validation inside `app/layout.tsx`.
3. Add `[data-theme="new-id"]` tokens and a `.theme-swatch.new-id` preview in `app/globals.css`.

No individual component should need modification when it already uses the shared tokens.

## Chart animations

- The main Cash Flow Overview Income and Expenses areas explicitly use `isAnimationActive`, `animationDuration={800}`, and `animationEasing="ease-out"`.
- `LedgerDashboard.tsx` now includes a real running-balance area chart for the selected branch, based on existing ledger API entries.
- The ledger area uses the same explicit 800 ms ease-out animation.
- Selecting another branch replaces the chart data and lets Recharts animate the new series naturally.
- Chart strokes, fills, grids, axes, and tooltips use theme variables.

## Files added

- `frontend/components/ui/Button.tsx`
- `frontend/components/ThemeSwitcher.tsx`

## Files updated

- `frontend/app/layout.tsx` — pre-paint theme bootstrap.
- `frontend/app/globals.css` — three palettes, button feedback, responsive theme menu, ledger chart, inline detail, and reduced-motion behavior.
- `frontend/components/Dashboard.tsx` — route-aware sidebar links, shared buttons, switcher, and animated overview chart.
- `frontend/app/[role]/[section]/page.tsx` — guarded pages for role-specific sidebar destinations.
- `frontend/components/LedgerDashboard.tsx` — animated balance chart, inline details, and shared buttons.
- `frontend/components/BranchesModule.tsx` — dedicated branch directory with assignment and authorized balance summaries.
- `CashAdvanceModule.tsx`, `ExpenseModule.tsx`, `ReportsModule.tsx`, `AuditLogViewer.tsx`, `NotificationBell.tsx`, login, registration, and error screen — shared Button retrofit.
- `README.md` — Phase 5 capability summary.

## Verification

- TypeScript completed with zero errors.
- ESLint completed with zero warnings or errors.
- Next.js standalone production build completed successfully, including the role/section route.
- A source audit confirmed no raw native button remains outside the shared Button implementation.
- No backend file, schema, migration, API, or business workflow was changed in Phase 5.
