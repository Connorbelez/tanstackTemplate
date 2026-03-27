# Chunk 1 Context: RBAC Foundation

## Source Context (Linear ENG-201)
- Scope: add RBAC permissions and complete transfer mutations/queries.
- Required new permissions:
  - `payment:manage`
  - `payment:view`
  - `payment:view_own`
  - `payment:retry`
  - `payment:cancel`
  - `payment:webhook_process`
- Acceptance criteria relevant to this chunk:
  - All mutations enforce `requirePermission(...)` via existing auth pattern.

## Source Context (Notion Implementation Plan ENG-201)
- Drift report states current code still uses admin role gates (`adminMutation`/`adminAction`) instead of payment permission gates.
- Implementation guidance:
  - Add new builders in `convex/fluent.ts`:
    - `paymentQuery = authedQuery.use(requirePermission("payment:view"))`
    - `paymentMutation = authedMutation.use(requirePermission("payment:manage"))`
    - `paymentRetryMutation = authedMutation.use(requirePermission("payment:retry"))`
    - `paymentCancelMutation = authedMutation.use(requirePermission("payment:cancel"))`
    - `paymentAction = authedAction.use(requirePermission("payment:manage"))`
  - Migrate:
    - `createTransferRequest`: `adminMutation` -> `paymentMutation`
    - `initiateTransfer`: `adminAction` -> `paymentAction`

## Codebase Reality
- `convex/fluent.ts` already exposes domain chains (deal/ledger/cashLedger) using `requirePermission`.
- `convex/payments/transfers/mutations.ts` currently imports `adminAction` and `adminMutation`.

## Implementation Constraints
- WorkOS permission registration is external/manual; code cannot perform this.
- Keep source attribution behavior intact (`buildSource(ctx.viewer, "admin_dashboard")`) while changing only authorization gates in this chunk.
