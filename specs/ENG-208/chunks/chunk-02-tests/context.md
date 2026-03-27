# Chunk 02 Context: Tests

## Goal
Write comprehensive unit tests for the locking fee collection effect, covering happy path, edge cases, and error conditions.

## Test File Location
`convex/engine/effects/__tests__/dealLockingFee.test.ts`

## Test Pattern
Follow the established pattern from `convex/deals/__tests__/effects.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");
```

**Important limitation:** `convex-test` cannot call internal queries/actions from within internal actions. The `collectLockingFee` effect calls `ctx.runQuery(internal.deals.queries.getInternalDeal)` and `ctx.runMutation(internal.payments.transfers.mutations.createTransferRequestInternal)` — these internal cross-module calls won't work in the test harness.

### Testing strategy
Given the convex-test limitation with internal action cross-module calls, test the **deal machine wiring** and **data validation** aspects:

1. **Deal machine tests** — Verify `DEAL_LOCKED` transition includes `collectLockingFee` in its actions
2. **Schema validation** — Verify `lockingFeeAmount` field is properly optional on deals
3. **Effect handler unit tests** — Import the handler directly and test with mock context where possible

For the integration-level tests (effect → transfer creation → cash ledger), those are tested via integration/e2e tests.

## Test Cases

### T-005 Test Cases

1. **Deal machine includes collectLockingFee action**
   - Fire `DEAL_LOCKED` on deal machine
   - Assert the transition result includes `collectLockingFee` in actions

2. **Schema allows lockingFeeAmount**
   - Insert a deal with `lockingFeeAmount` set
   - Insert a deal without `lockingFeeAmount`
   - Both should succeed

3. **Effect skips when no locking fee configured**
   - Create a deal without `lockingFeeAmount`
   - Call the effect handler
   - Assert no transfer was created (query transferRequests table)

4. **Effect skips when locking fee is 0**
   - Create a deal with `lockingFeeAmount: 0`
   - Call the effect handler
   - Assert no transfer was created

5. **Effect creates inbound transfer with correct fields** (may need to be integration test)
   - Create a deal with `lockingFeeAmount: 5000` (50 dollars)
   - Call the effect
   - Assert transfer created with:
     - `direction: "inbound"`
     - `transferType: "locking_fee_collection"`
     - `amount: 5000`
     - `counterpartyType: "borrower"`
     - `counterpartyId: deal.buyerId`
     - `dealId: deal._id`
     - `obligationId: undefined`

6. **Idempotent execution** (may need to be integration test)
   - Call effect twice for same deal
   - Assert only one transfer created (idempotency key: `locking-fee:{dealId}`)

## Seed Data Pattern
From existing test patterns, seed data requires:
- `users` table entry
- `properties` table entry
- `brokers` table entry
- `mortgages` table entry (status: "funded")
- `borrowers` table entry
- `deals` table entry with `lockingFeeAmount`

## Quality Gate
- `bun run test` passes
- `bun check` passes
- `bun typecheck` passes
