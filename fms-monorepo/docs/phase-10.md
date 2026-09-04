# Phase 10 — Configurable approval chains

Approval routing is stored in `ApprovalRule` and managed by Finance Heads. The existing two-level behavior remains both seeded in the database and present as a code fallback, so an empty rule table does not stop operations.

## Schema

`ApprovalRule` contains `entityType`, positive sequential `level`, `approverRole`, optional `branchId`, optional expense `categoryId`, `isActive`, and timestamps. Cash advance rules cannot carry a category. A partial unique database index prevents two active rules at the same level and scope. Deletes are soft deletes.

## Resolution

`getApprovalChain(entityType, branchId, categoryId)` selects one complete scope, ordered by level:

1. Matching branch and category (expenses only)
2. Matching branch
3. Matching category (expenses only)
4. Global rules (`branchId` and `categoryId` null)
5. Built-in legacy defaults if no database scope matches

Scopes are not mixed. Active levels must be exactly `1..N`; mutations that introduce a duplicate or gap are rejected. Approval endpoints resolve the chain on the backend, compare the authenticated user's role with the next level, and reject wrong-role, cross-branch, repeated, or out-of-sequence attempts.

New cash advances and expenses store a nullable JSON approval-chain snapshot when submitted. Rule changes therefore apply to new workflows and cannot reroute an item mid-approval. Pre-Phase-10 rows with existing `ApprovalStep` records continue on the legacy chain; old rows with no approvals resolve current rules when their first decision occurs and then save a snapshot.

Legacy defaults are Cash Advance: Accounts Head → Finance Head, and Expense: Branch Manager → Accounts Head.

## API

- `GET /api/approval-rules?entityType=&branchId=&active=`
- `POST /api/approval-rules`
- `PATCH /api/approval-rules/:id`
- `DELETE /api/approval-rules/:id` (sets `isActive=false`)

All endpoints require Finance Head permission. Create, edit, and deactivate actions generate audit records.

## Example: three levels for branch X

Open `/finance-head/approval-rules`. Create three `CASH_ADVANCE` rules with Branch X selected, using levels 1, 2, and 3 in order—for example Branch Manager, Accounts Head, Finance Head. A new Branch X request will then require those roles sequentially. Other branches continue using the global two-level chain.

Because every saved state must be valid, add levels from 1 upward and deactivate them from the highest level downward. The level inputs in the table support reordering, but swaps should be performed through a temporary valid sequence or by deactivating and rebuilding the scope.

## Test

1. Apply migrations, regenerate Prisma Client, and run either seed script.
2. Confirm global cash-advance and expense defaults appear in the admin page.
3. Build the Branch X three-level chain above and submit a Branch X cash advance.
4. Attempt level 1 as Accounts Head; expect `403` naming the required Branch Manager role.
5. Approve as Branch Manager, then attempt Finance Head before Accounts Head; expect `403`.
6. Complete Accounts Head then Finance Head approval and confirm status becomes `APPROVED` only after level 3.
7. Confirm another branch still follows the original two-level chain.
8. Try creating a duplicate level or skipping from level 1 to 3; expect `409`.
9. Deactivate a highest-level rule and verify an `APPROVAL_RULE_DEACTIVATED` audit entry.
