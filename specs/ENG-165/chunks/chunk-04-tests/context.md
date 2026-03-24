# Chunk 4 Context: Tests

## Goal
Write comprehensive tests for all 4 cross-system reconciliation checks and the self-healing cron, following existing test patterns.

## Test File Location
`convex/payments/cashLedger/__tests__/transferReconciliation.test.ts`

## Test Harness Pattern

All cash ledger tests use `convex-test` with a shared harness:

```typescript
import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import {
    createHarness,
    createTestAccount,
    postTestEntry,
    seedMinimalEntities,
    SYSTEM_SOURCE,
    type TestHarness,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");
```

### createHarness
Creates a `convex-test` instance with the full schema. Sets `DISABLE_CASH_LEDGER_HASHCHAIN=true` to avoid needing workflow components.

### seedMinimalEntities
Seeds broker, borrower, 2 lenders, property, mortgage, and ownership ledger accounts. Returns `{ borrowerId, lenderAId, lenderBId, mortgageId }`.

### createTestAccount
Creates a cash_ledger_account by family with optional scope fields and initial balances.

### postTestEntry
Convenience wrapper around `postCashEntryInternal` for tests.

## T-016: Test Utilities

Add helpers to `testUtils.ts` for creating transfer test data:

```typescript
export async function createConfirmedTransfer(
    t: TestHarness,
    args: {
        direction: "inbound" | "outbound";
        amount: number;
        mortgageId?: Id<"mortgages">;
        obligationId?: Id<"obligations">;
        lenderId?: Id<"lenders">;
        borrowerId?: Id<"borrowers">;
        dispersalEntryId?: Id<"dispersalEntries">;
        confirmedAt?: number;
    }
): Promise<Id<"transferRequests">> {
    return t.run(async (ctx) => {
        return ctx.db.insert("transferRequests", {
            status: "confirmed",
            direction: args.direction,
            amount: args.amount,
            currency: "CAD",
            mortgageId: args.mortgageId,
            obligationId: args.obligationId,
            lenderId: args.lenderId,
            borrowerId: args.borrowerId,
            dispersalEntryId: args.dispersalEntryId,
            confirmedAt: args.confirmedAt ?? Date.now() - 10 * 60_000, // 10 min ago (past threshold)
            createdAt: Date.now(),
        });
    });
}

export async function createReversedTransfer(
    t: TestHarness,
    args: {
        direction: "inbound" | "outbound";
        amount: number;
        mortgageId?: Id<"mortgages">;
        reversedAt?: number;
    }
): Promise<Id<"transferRequests">> {
    return t.run(async (ctx) => {
        return ctx.db.insert("transferRequests", {
            status: "reversed",
            direction: args.direction,
            amount: args.amount,
            currency: "CAD",
            mortgageId: args.mortgageId,
            reversedAt: args.reversedAt ?? Date.now() - 10 * 60_000,
            createdAt: Date.now(),
        });
    });
}
```

## T-017: Test checkOrphanedConfirmedTransfers

```typescript
describe("checkOrphanedConfirmedTransfers", () => {
    it("returns healthy when confirmed transfer has matching journal entry", async () => {
        const t = createHarness(modules);
        const { mortgageId, borrowerId } = await seedMinimalEntities(t);

        // Create confirmed inbound transfer
        const transferId = await createConfirmedTransfer(t, {
            direction: "inbound",
            amount: 50000,
            mortgageId,
            borrowerId,
        });

        // Create matching CASH_RECEIVED journal entry with transferRequestId
        const receivableAccount = await createTestAccount(t, {
            family: "BORROWER_RECEIVABLE",
            mortgageId,
            borrowerId,
        });
        const trustAccount = await createTestAccount(t, {
            family: "TRUST_CASH",
            mortgageId,
        });
        await postTestEntry(t, {
            entryType: "CASH_RECEIVED",
            effectiveDate: "2026-03-01",
            amount: 50000,
            debitAccountId: trustAccount._id,
            creditAccountId: receivableAccount._id,
            idempotencyKey: `cash-ledger:cash-received:transfer:${transferId}`,
            transferRequestId: transferId,
            mortgageId,
            source: SYSTEM_SOURCE,
        });

        const result = await t.run(async (ctx) => {
            return checkOrphanedConfirmedTransfers(ctx);
        });

        expect(result.isHealthy).toBe(true);
        expect(result.count).toBe(0);
    });

    it("detects orphaned confirmed transfer (no journal entry)", async () => {
        const t = createHarness(modules);
        const { mortgageId, borrowerId } = await seedMinimalEntities(t);

        // Create confirmed transfer with NO matching journal entry
        await createConfirmedTransfer(t, {
            direction: "inbound",
            amount: 50000,
            mortgageId,
            borrowerId,
        });

        const result = await t.run(async (ctx) => {
            return checkOrphanedConfirmedTransfers(ctx);
        });

        expect(result.isHealthy).toBe(false);
        expect(result.count).toBe(1);
        expect(result.items[0].amount).toBe(50000);
    });

    it("skips recently confirmed transfers (within 5-minute threshold)", async () => {
        const t = createHarness(modules);
        const { mortgageId } = await seedMinimalEntities(t);

        // Create transfer confirmed just now (within threshold)
        await createConfirmedTransfer(t, {
            direction: "inbound",
            amount: 50000,
            mortgageId,
            confirmedAt: Date.now(), // just now
        });

        const result = await t.run(async (ctx) => {
            return checkOrphanedConfirmedTransfers(ctx);
        });

        expect(result.isHealthy).toBe(true); // Not flagged yet
    });
});
```

## T-018: Test checkOrphanedReversedTransfers

Similar structure to T-017 but with:
- `status: "reversed"` transfers
- Matching `REVERSAL` journal entries
- Test healthy (REVERSAL exists) and orphaned (no REVERSAL) cases

## T-019: Test checkStaleOutboundTransfers

```typescript
describe("checkStaleOutboundTransfers", () => {
    it("detects confirmed outbound transfer with pending dispersalEntry", async () => {
        // 1. Create a dispersalEntry with status: "pending"
        // 2. Create confirmed outbound transfer linked to it
        // 3. Verify check detects it as stale
    });

    it("returns healthy when dispersalEntry is completed", async () => {
        // 1. Create a dispersalEntry with status: "completed"
        // 2. Create confirmed outbound transfer linked to it
        // 3. Verify check is healthy
    });
});
```

**Note:** Check the `dispersalEntries` schema to understand the `status` field values.

## T-020: Test checkTransferAmountMismatches

```typescript
describe("checkTransferAmountMismatches", () => {
    it("returns healthy when amounts match", async () => {
        // Transfer amount: 50000, journal amount: 50000
        // Expect healthy
    });

    it("detects amount mismatch", async () => {
        // Transfer amount: 50000, journal amount: 49500
        // Expect mismatch with differenceCents: 500
    });
});
```

## T-021: Test Self-Healing Retry and Escalation

Test the `retriggerTransferConfirmation` mutation:

```typescript
describe("retriggerTransferConfirmation", () => {
    it("retries on first attempt (creates healing record)", async () => {
        // Call retrigger — expect action: "retriggered", attemptCount: 1
        // Verify transferHealingAttempts record created with status: "retrying"
    });

    it("escalates to SUSPENSE after 3 failed retries", async () => {
        // Pre-create healingAttempt with attemptCount: 3, status: "retrying"
        // Call retrigger — expect action: "escalated"
        // Verify SUSPENSE_ESCALATED journal entry created
        // Verify healingAttempt updated to status: "escalated"
    });

    it("skips already-escalated transfers", async () => {
        // Pre-create healingAttempt with status: "escalated"
        // Call retrigger — expect action: "skipped"
    });
});
```

## T-022: Final Quality Gate

Run:
1. `bun check` — lint + format
2. `bun typecheck` — TypeScript compilation
3. `bunx convex codegen` — Convex code generation
4. `bun run test convex/payments/cashLedger/__tests__/transferReconciliation.test.ts` — tests pass

## Existing Test References
- `convex/payments/cashLedger/__tests__/reconciliationSuite.test.ts` — pattern for reconciliation check tests
- `convex/payments/cashLedger/__tests__/testUtils.ts` — shared harness, seed, account creation
- `convex/dispersal/__tests__/` — self-healing test patterns (if they exist)

## Key Testing Rules
- Always use `createHarness(modules)` with `import.meta.glob("/convex/**/*.ts")`
- Use `seedMinimalEntities(t)` for base test data
- Use `SYSTEM_SOURCE` for source attribution in test entries
- Journal entry amounts are bigint (`v.int64`) — pass as `number` to `postTestEntry` (it handles conversion)
- Set `confirmedAt` / `reversedAt` to 10+ minutes ago to exceed the 5-minute orphan threshold

## Quality Gate Commands
```bash
bun check
bun typecheck
bunx convex codegen
bun run test convex/payments/cashLedger/__tests__/transferReconciliation.test.ts
```
