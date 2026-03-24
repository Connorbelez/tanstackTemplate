# Chunk 2 Context: Check Functions

## Goal
Implement 4 cross-system reconciliation check functions in `convex/payments/cashLedger/transferReconciliation.ts` and integrate them into the existing full reconciliation suite.

## Pattern to Follow

Every check function in this codebase follows the same pattern from `reconciliationSuite.ts`:

```typescript
function buildResult<T>(
    checkName: string,
    items: T[],
    totalAmountCents: number,
    checkedAt: number
): ReconciliationCheckResult<T> {
    return {
        checkName,
        isHealthy: items.length === 0,
        items,
        count: items.length,
        totalAmountCents,
        checkedAt,
    };
}

function ageDays(creationTime: number, now: number): number {
    return Math.floor((now - creationTime) / MS_PER_DAY);
}
```

Each check:
1. Accepts `(ctx: QueryCtx, options?: ReconciliationSuiteOptions)`
2. Returns `Promise<ReconciliationCheckResult<ItemType>>`
3. Uses `options?.nowMs ?? Date.now()` for consistent timestamp
4. Builds items array, computes totalAmountCents, calls `buildResult()`

## Idempotency Key Convention

All keys use `buildIdempotencyKey` from `./types.ts`:

```typescript
import { buildIdempotencyKey } from "./types";

// For inbound confirmed transfers:
buildIdempotencyKey("cash-received", "transfer", transferRequestId)
// → "cash-ledger:cash-received:transfer:{id}"

// For outbound confirmed transfers (lender payout):
buildIdempotencyKey("lender-payout-sent", "transfer", transferRequestId)
// → "cash-ledger:lender-payout-sent:transfer:{id}"

// For reversed transfers:
buildIdempotencyKey("reversal", "transfer", transferRequestId)
// → "cash-ledger:reversal:transfer:{id}"
```

## T-006: checkOrphanedConfirmedTransfers

**File:** `convex/payments/cashLedger/transferReconciliation.ts` (add to the file created in Chunk 1)

**Logic:**
1. Query all `transferRequests` with `status = "confirmed"` using the `by_status` index
2. Filter to only those older than 5 minutes (`confirmedAt < now - ORPHAN_THRESHOLD_MS`) to avoid false positives from in-flight async processing
3. For each confirmed transfer:
   - Determine expected idempotency key based on direction:
     - `inbound` → `buildIdempotencyKey("cash-received", "transfer", transferRequestId)`
     - `outbound` → `buildIdempotencyKey("lender-payout-sent", "transfer", transferRequestId)`
   - Query `cash_ledger_journal_entries` using `by_transfer_request` index for matching `transferRequestId`
   - Check if ANY entry exists with the expected entry type (`CASH_RECEIVED` for inbound, `LENDER_PAYOUT_SENT` for outbound)
   - If no matching entry: add to orphaned items
4. Return `ReconciliationCheckResult<OrphanedConfirmedTransferItem>`

**Important:** Use the `by_transfer_request` index (NOT `by_idempotency`) for the join — it's more efficient and already exists on `cash_ledger_journal_entries`.

```typescript
export async function checkOrphanedConfirmedTransfers(
    ctx: QueryCtx,
    options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<OrphanedConfirmedTransferItem>> {
    const now = options?.nowMs ?? Date.now();
    const threshold = now - ORPHAN_THRESHOLD_MS;

    const confirmedTransfers = await ctx.db
        .query("transferRequests")
        .withIndex("by_status", (q) => q.eq("status", "confirmed"))
        .collect();

    const items: OrphanedConfirmedTransferItem[] = [];
    let totalAmountCents = 0;

    for (const transfer of confirmedTransfers) {
        // Skip transfers confirmed less than 5 minutes ago
        if (transfer.confirmedAt && transfer.confirmedAt > threshold) continue;
        // Skip transfers without required fields
        if (!transfer.amount || !transfer.direction) continue;

        const entries = await ctx.db
            .query("cash_ledger_journal_entries")
            .withIndex("by_transfer_request", (q) =>
                q.eq("transferRequestId", transfer._id)
            )
            .collect();

        const expectedType = transfer.direction === "inbound"
            ? "CASH_RECEIVED"
            : "LENDER_PAYOUT_SENT";

        const hasMatch = entries.some((e) => e.entryType === expectedType);

        if (!hasMatch) {
            const expectedKey = transfer.direction === "inbound"
                ? buildIdempotencyKey("cash-received", "transfer", transfer._id)
                : buildIdempotencyKey("lender-payout-sent", "transfer", transfer._id);

            items.push({
                transferRequestId: transfer._id,
                direction: transfer.direction,
                amount: transfer.amount,
                expectedIdempotencyKey: expectedKey,
                mortgageId: transfer.mortgageId ?? undefined,
                confirmedAt: transfer.confirmedAt ?? transfer._creationTime,
                ageDays: ageDays(transfer.confirmedAt ?? transfer._creationTime, now),
            });
            totalAmountCents += transfer.amount;
        }
    }

    return buildResult("orphanedConfirmedTransfers", items, totalAmountCents, now);
}
```

## T-007: checkOrphanedReversedTransfers

**Similar pattern to T-006 but for reversed transfers.**

1. Query `transferRequests` with `status = "reversed"` (using `by_status` index)
2. Filter to those older than 5 minutes
3. For each: check if a `REVERSAL` journal entry exists via `by_transfer_request` index
4. Orphaned = reversed transfer with no REVERSAL entry

```typescript
const expectedType = "REVERSAL";
const hasMatch = entries.some((e) => e.entryType === "REVERSAL");
```

## T-008: checkStaleOutboundTransfers

**Logic:**
1. Query `transferRequests` with `status = "confirmed"` AND `direction = "outbound"` (use `by_status_and_direction` index)
2. For each with a `dispersalEntryId`:
   - Load the linked `dispersalEntry` from DB
   - If `dispersalEntry.status === "pending"` → stale
3. Return items with dispersal info

```typescript
export async function checkStaleOutboundTransfers(
    ctx: QueryCtx,
    options?: ReconciliationSuiteOptions
): Promise<ReconciliationCheckResult<StaleOutboundTransferItem>> {
    const now = options?.nowMs ?? Date.now();

    const outboundConfirmed = await ctx.db
        .query("transferRequests")
        .withIndex("by_status_and_direction", (q) =>
            q.eq("status", "confirmed").eq("direction", "outbound")
        )
        .collect();

    const items: StaleOutboundTransferItem[] = [];
    let totalAmountCents = 0;

    for (const transfer of outboundConfirmed) {
        if (!transfer.dispersalEntryId || !transfer.amount) continue;

        const dispersalEntry = await ctx.db.get(transfer.dispersalEntryId);
        if (!dispersalEntry) continue;

        if (dispersalEntry.status === "pending") {
            items.push({
                transferRequestId: transfer._id,
                dispersalEntryId: transfer.dispersalEntryId,
                dispersalStatus: dispersalEntry.status,
                amount: transfer.amount,
                confirmedAt: transfer.confirmedAt ?? transfer._creationTime,
                ageDays: ageDays(transfer.confirmedAt ?? transfer._creationTime, now),
            });
            totalAmountCents += transfer.amount;
        }
    }

    return buildResult("staleOutboundTransfers", items, totalAmountCents, now);
}
```

**Note:** Check if `dispersalEntries` has a `status` field. If the field name differs (e.g., it might be tracked differently), adapt accordingly. Look at the schema definition for `dispersalEntries`.

## T-009: checkTransferAmountMismatches

**Logic:**
1. Query confirmed transfers (both inbound and outbound)
2. For each, find matching journal entries via `by_transfer_request` index
3. Compare `transfer.amount` to `journalEntry.amount` (both in cents)
4. Flag mismatches where `Math.abs(transfer.amount - Number(journalEntry.amount)) > 0`

**Important:** Journal entry `amount` is stored as `v.int64()` (bigint). Use the `safeBigintToNumber()` utility from `accounts.ts` when comparing.

```typescript
import { safeBigintToNumber } from "./accounts";
```

## T-010: Integrate into runFullReconciliationSuite

**File:** `convex/payments/cashLedger/reconciliationSuite.ts`

Add to the existing `runFullReconciliationSuite` function. The function currently runs checks in parallel:

```typescript
// Current pattern (line ~693):
const [checkResults, conservationResults] = await Promise.all([
    Promise.all([
        checkUnappliedCash(ctx, opts),
        checkNegativePayables(ctx, opts),
        // ... 6 more checks
    ]),
    Promise.all([
        checkObligationConservation(ctx, opts),
        checkMortgageMonthConservation(ctx, opts),
    ]),
]);
```

Add a new parallel group for transfer checks:

```typescript
const [checkResults, conservationResults, transferResults] = await Promise.all([
    Promise.all([/* existing 8 checks */]),
    Promise.all([/* existing 2 conservation checks */]),
    Promise.all([
        checkOrphanedConfirmedTransfers(ctx, opts),
        checkOrphanedReversedTransfers(ctx, opts),
        checkStaleOutboundTransfers(ctx, opts),
        checkTransferAmountMismatches(ctx, opts),
    ]),
]);
```

Update `allResults` to include `transferResults`:
```typescript
const allResults = [
    ...checkResults,
    ...conservationResults,
    ...transferResults,
] as ReconciliationCheckResult<unknown>[];
```

Also add `transferResults` to the `FullReconciliationResult` type:
```typescript
export interface FullReconciliationResult {
    checkedAt: number;
    checkResults: ReconciliationCheckResult<unknown>[];
    conservationResults: ReconciliationCheckResult<unknown>[];
    transferResults: ReconciliationCheckResult<unknown>[]; // NEW
    isHealthy: boolean;
    totalGapCount: number;
    unhealthyCheckNames: string[];
}
```

## Existing File References

Read these files before implementing:
- `convex/payments/cashLedger/reconciliationSuite.ts` — buildResult, ageDays, ReconciliationCheckResult<T>, runFullReconciliationSuite
- `convex/payments/cashLedger/types.ts` — buildIdempotencyKey
- `convex/payments/cashLedger/accounts.ts` — safeBigintToNumber
- `convex/schema.ts` — transferRequests schema (as extended in Chunk 1), dispersalEntries schema (check status field name)

## Quality Gate
After all tasks: `bun check`, `bun typecheck`, `bunx convex codegen`
