# Chunk Context: transfer-effect-tests

Source: Linear ENG-194, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

From `📋 Implementation Plan: ENG-194 — Implement Transfer Effect Handlers`:

```md
## 1. Goal
Implement the transfer effect handlers registered in the GT effect registry for the transfer lifecycle state machine. These effects are the critical bridge between the Transfer domain and the Cash & Obligations Ledger — when a transfer confirms, fails, or reverses, the corresponding effect posts (or skips) cash journal entries.

## 3. Requirements
### Acceptance Criteria
- [ ] Confirmed inbound transfer produces exactly one `CASH_RECEIVED` journal entry with matching `transferRequestId`
- [ ] Confirmed outbound transfer produces exactly one `LENDER_PAYOUT_SENT` journal entry with matching `transferRequestId`
- [ ] Reversed transfer produces exactly one `REVERSAL` journal entry linked via `causedBy`
### Derived Requirements
- Effects must run via `ctx.scheduler.runAfter(0)` (async, separate mutation) — consistent with GT pattern
- Bridged transfers (Phase M2a — `collectionAttemptId` set) must skip cash posting in `publishTransferConfirmed` because cash was already posted via the collection attempt path (Decision D4)
- Non-bridged transfers without a direction must fail loudly (data integrity violation)
- `publishTransferReversed` must look up the original journal entry by `transferRequestId` and call `postTransferReversal()` with swapped accounts
- Reversal of a non-bridged transfer that has no journal entry must throw (fail closed to prevent ledger drift)

## 4. Architecture & Design
### File Map
| File | Action | Purpose |
| --- | --- | --- |
| `convex/engine/effects/transfer.ts` | **Already exists** | All four effect handlers implemented |
| `convex/engine/effects/registry.ts` | **Already exists** | All four effects registered |
| `convex/payments/cashLedger/integrations.ts` | **Already exists** | `postCashReceiptForTransfer`, `postLenderPayoutForTransfer`, `postTransferReversal` |

### Key Design Decisions
1. **D4 Conditional (Bridged Transfers):** When `collectionAttemptId` is set on the transfer, `publishTransferConfirmed` skips cash posting because the collection attempt path already posted via `postCashReceiptForObligation()`. This is the Phase M2a parallel-record strategy.
2. **Fail Closed on Reversal:** If a non-bridged confirmed transfer has no journal entry, `publishTransferReversed` throws an error rather than silently skipping. This prevents ledger drift.
3. **Provider Ref Patch:** `recordTransferProviderRef` extracts `providerRef` from the event payload and patches the transfer entity. Logs a warning (not throw) if providerRef is missing.
4. **Settlement Timestamp:** `publishTransferConfirmed` prefers `payload.settledAt` (from webhook/reconciliation) over `Date.now()` for the settledAt field.

## 5. Drift Report
### Critical Finding: Code Already Implemented
**The implementation for ENG-194 appears to be fully complete in the codebase**, despite the issue being in "Todo" status.

### Confirmed Alignments
- `convex/engine/effects/transfer.ts` implements all four effects (`recordTransferProviderRef`, `publishTransferConfirmed`, `publishTransferFailed`, `publishTransferReversed`)
- `convex/engine/effects/registry.ts` registers all four effects under the `// Transfer effects (ENG-184)` comment block
- `publishTransferConfirmed` correctly implements the D4 conditional (skips cash posting when `collectionAttemptId` is set)
- Inbound path calls `postCashReceiptForTransfer()`, outbound path calls `postLenderPayoutForTransfer()`
- `publishTransferReversed` looks up original journal entry via `by_transfer_request` index and calls `postTransferReversal()`
- Fail-closed behavior for non-bridged transfers without journal entries
- `publishTransferFailed` patches `failedAt`, `failureReason`, `failureCode`

### Missing Pieces
- **Tests:** No dedicated test file found at `convex/engine/effects/__tests__/transfer.test.ts`. The acceptance criteria should be verified through integration tests that:
  1. Create an inbound transfer → fire FUNDS_SETTLED → verify CASH_RECEIVED journal entry exists with matching `transferRequestId`
  2. Create an outbound transfer → fire FUNDS_SETTLED → verify LENDER_PAYOUT_SENT journal entry exists
  3. Confirm a transfer → fire TRANSFER_REVERSED → verify REVERSAL journal entry with `causedBy` linkage

## 6. Implementation Steps
### Step 2: Write integration tests for transfer effects
- **File(s):** `convex/engine/effects/__tests__/transfer.test.ts` (Create)
- **Action:** Create integration tests using `convex-test` that verify:
  1. Inbound confirmed transfer → `CASH_RECEIVED` entry with matching `transferRequestId`
  2. Outbound confirmed transfer → `LENDER_PAYOUT_SENT` entry with matching `transferRequestId`
  3. Reversed transfer → `REVERSAL` entry linked via `causedBy`
  4. Bridged transfer (with `collectionAttemptId`) → no duplicate cash entry
  5. Non-bridged transfer without direction → throws data integrity error
  6. `publishTransferFailed` patches failure metadata correctly
- **Validation:** `bun run test` passes for the new test file
- **Depends on:** Step 1

### Step 3: Verify end-to-end via existing test suites
- **File(s):** Run `bun run test` across all cash ledger and transfer test files
- **Action:** Ensure no regressions in existing tests
- **Validation:** All tests pass
- **Depends on:** Step 2

## 8. Validation Checklist
- [ ] All acceptance criteria from Linear issue met
- [ ] `bun check` passes
- [ ] `bun typecheck` passes
- [ ] `bunx convex codegen` passes
- [ ] No `any` types introduced
- [ ] Integration tests verify all three journal entry scenarios
- [ ] D4 conditional tested (bridged transfers don't double-post)
- [ ] Fail-closed reversal tested (non-bridged without journal entry throws)
- [ ] All existing cash ledger tests pass unchanged
```

## Architecture Context

From `Unified Payment Rails`:

```md
## Effects (Resolved by GT Effect Registry)
- **`recordProviderRef`** — stores provider reference on the transfer record
- **`publishTransferConfirmed`** — publishes event consumed by Cash & Obligations Ledger (→ CASH_RECEIVED or LENDER_PAYOUT_SENT journal entry), updates upstream collection attempt or dispersal entry status
- **`publishTransferFailed`** — publishes failure event for Collection Plan rules engine (retry/reschedule/escalation)
- **`publishTransferReversed`** — publishes reversal event consumed by Cash & Obligations Ledger (→ REVERSAL journal entry), notifies admin
```

```md
## ADDITION: Cash Ledger Integration Contract
The Cash & Obligations Ledger is the **sole downstream consumer** of transfer lifecycle events. Payment Rails publishes events; the Cash Ledger journals the money meaning. Payment Rails does NOT post to any ledger directly.

### Integration Functions (owned by Cash Ledger)
All live in `convex/payments/cashLedger/integrations.ts` and call the existing `postCashEntryInternal()` 9-step validated pipeline:

| **Transfer Event** | **Cash Ledger Function** | **Entry Type** |
| --- | --- | --- |
| Inbound transfer confirmed (obligation-backed) | `postCashReceiptForTransfer()` | `CASH_RECEIVED` |
| Inbound transfer confirmed (fee/deposit) | `postCashReceiptForTransfer()` with `UNAPPLIED_CASH` credit | `CASH_RECEIVED` |
| Outbound transfer confirmed | `postLenderPayoutForTransfer()` | `LENDER_PAYOUT_SENT` |
| Transfer reversed | `postTransferReversal()` | `REVERSAL` |

### Effect Call Chain
transferRequest.confirmed (FUNDS_SETTLED)
  → publishTransferConfirmed effect (in effect registry)
    → calls postCashReceiptForTransfer() or postLenderPayoutForTransfer()
      → calls postCashEntryInternal() (validated 9-step pipeline)
        → CASH_RECEIVED or LENDER_PAYOUT_SENT journal entry created

### Schema Cross-Reference
`cash_ledger_journal_entries` has a `transferRequestId` field (added in v2 alignment) with a `by_transfer_request` index. This enables reconciliation joins between the two tables.
```

```md
## ADDITION: Transfer Type → Cash Entry Type Mapping
| **Transfer Type** | **Direction** | **Cash Entry Type** | **Debit** | **Credit** |
| --- | --- | --- | --- | --- |
| `borrower_interest_collection` | inbound | `CASH_RECEIVED` | `TRUST_CASH` | `BORROWER_RECEIVABLE` |
| `borrower_principal_collection` | inbound | `CASH_RECEIVED` | `TRUST_CASH` | `BORROWER_RECEIVABLE` |
| `borrower_late_fee_collection` | inbound | `CASH_RECEIVED` | `TRUST_CASH` | `BORROWER_RECEIVABLE` |
| `borrower_arrears_cure` | inbound | `CASH_RECEIVED` | `TRUST_CASH` | `BORROWER_RECEIVABLE` |
| `locking_fee_collection` | inbound | `CASH_RECEIVED` | `TRUST_CASH` | `UNAPPLIED_CASH` |
| `commitment_deposit_collection` | inbound | `CASH_RECEIVED` | `TRUST_CASH` | `UNAPPLIED_CASH` |
| `deal_principal_transfer` | inbound | `CASH_RECEIVED` | `TRUST_CASH` | `CASH_CLEARING` |
| `lender_dispersal_payout` | outbound | `LENDER_PAYOUT_SENT` | `LENDER_PAYABLE` | `TRUST_CASH` |
| `lender_principal_return` | outbound | `LENDER_PAYOUT_SENT` | `LENDER_PAYABLE` | `TRUST_CASH` |
| `deal_seller_payout` | outbound | `LENDER_PAYOUT_SENT` | `LENDER_PAYABLE` | `TRUST_CASH` |
```

## Integration Points

From `📋 Implementation Plan: ENG-199 — Implement Cash Ledger Bridge Effects`:

```md
## Integration Contract
All functions live in `convex/payments/cashLedger/integrations.ts` and call the existing `postCashEntryInternal()` 9-step validated pipeline.

Transfer confirmed (FUNDS_SETTLED event)
  → publishTransferConfirmed effect (GT effect registry)
    → if inbound + not bridged: postCashReceiptForTransfer()
    → if outbound + not bridged: postLenderPayoutForTransfer()
    → if bridged (collectionAttemptId set): skip (cash via collection attempt path)
      → postCashEntryInternal() (validated 9-step pipeline)
        → CASH_RECEIVED or LENDER_PAYOUT_SENT journal entry

Transfer reversed (TRANSFER_REVERSED event)
  → publishTransferReversed effect (GT effect registry)
    → looks up original journal entry by_transfer_request index
    → postTransferReversal() with swapped debit/credit accounts
      → postCashEntryInternal()
        → REVERSAL journal entry with causedBy link
```

```md
## Key Design Decisions (Verified in Code)
## D4 Conditional: Bridged Transfers
The `publishTransferConfirmed` effect handler checks `transfer.collectionAttemptId`. When set, cash was already posted via the collection attempt path (Phase M2a parallel records). Only `settledAt` is patched on the transfer — no duplicate cash posting.

## Fail-Closed Reversal
The `publishTransferReversed` effect handler:
- If journal entry exists → post reversal
- If bridged (collectionAttemptId) and no journal entry → skip (handled by collection attempt reversal)
- If **non-bridged** and no journal entry → **throws** to prevent silent ledger drift
This is the correct fail-closed behavior for a financial system.
```

From `📋 Implementation Plan: ENG-192 — Register transfer as GovernedEntityType with Transition Engine`:

```md
# Transfer Effect Handlers (Verified)
File: `convex/engine/effects/transfer.ts`

| Effect | Behavior |
| --- | --- |
| `recordTransferProviderRef` | Patches `providerRef` onto the transfer entity from event payload |
| `publishTransferConfirmed` | Patches `settledAt`. For non-bridged inbound: calls `postCashReceiptForTransfer()`. For outbound: calls `postLenderPayoutForTransfer()`. Bridged transfers (with `collectionAttemptId`) skip cash posting. |
| `publishTransferFailed` | Patches `failedAt`, `failureReason`, `failureCode` from event payload |
| `publishTransferReversed` | Patches `reversedAt`, `reversalRef`. Looks up original journal entry and calls `postTransferReversal()`. Bridged transfers skip reversal. Non-bridged without journal entry throws (fail closed). |
```

## Local Code Evidence

`convex/engine/effects/transfer.ts`:

```ts
export const publishTransferConfirmed = internalMutation({
	args: transferEffectValidator,
	handler: async (ctx, args) => {
		const transfer = await loadTransfer(ctx, args, "publishTransferConfirmed");

		const settledAt =
			typeof args.payload?.settledAt === "number"
				? args.payload.settledAt
				: Date.now();

		await ctx.db.patch(args.entityId, { settledAt });

		if (transfer.collectionAttemptId) {
			console.info(
				`[publishTransferConfirmed] Bridged transfer ${args.entityId} — cash posted via collection attempt path. Skipping.`
			);
		} else if (transfer.direction === "inbound") {
			await postCashReceiptForTransfer(ctx, {
				transferRequestId: args.entityId,
				source: args.source,
			});
		} else if (transfer.direction === "outbound") {
			await postLenderPayoutForTransfer(ctx, {
				transferRequestId: args.entityId,
				source: args.source,
			});
		} else {
			throw new Error(
				`[publishTransferConfirmed] Transfer ${args.entityId} has no direction set. ` +
					"Cannot post cash entry — this is a data integrity violation."
			);
		}
	},
});

export const publishTransferReversed = internalMutation({
	args: transferEffectValidator,
	handler: async (ctx, args) => {
		const transfer = await loadTransfer(ctx, args, "publishTransferReversed");

		const reversalRef =
			typeof args.payload?.reversalRef === "string"
				? args.payload.reversalRef
				: undefined;
		const reason =
			typeof args.payload?.reason === "string"
				? args.payload.reason
				: "transfer_reversed";

		await ctx.db.patch(args.entityId, {
			reversedAt: Date.now(),
			reversalRef,
		});

		const originalEntry = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_transfer_request", (q) =>
				q.eq("transferRequestId", args.entityId)
			)
			.first();

		if (originalEntry) {
			const effectiveDate = new Date().toISOString().slice(0, 10);
			const amount =
				transfer.amount ?? safeBigintToNumber(originalEntry.amount);

			await postTransferReversal(ctx, {
				transferRequestId: args.entityId,
				originalEntryId: originalEntry._id,
				amount,
				effectiveDate,
				source: args.source,
				reason,
			});
		} else if (transfer.collectionAttemptId) {
			console.info(
				`[publishTransferReversed] No journal entry for bridged transfer ${args.entityId}. Cash reversal skipped (handled by collection attempt path).`
			);
		} else {
			throw new Error(
				`[publishTransferReversed] No journal entry found for NON-bridged transfer ${args.entityId}. ` +
					"Cash reversal cannot be posted — failing closed to prevent ledger drift. " +
					"Investigate and reconcile manually or enqueue a healing action."
			);
		}
	},
});
```

`convex/engine/effects/__tests__/transfer.test.ts`:

```ts
/**
 * Transfer effect tests — verifies registry presence and documents
 * the expected branching logic in transfer effects.
 *
 * The effects are internalMutations requiring the full Convex runtime.
 * These tests verify:
 * 1. All transfer effects are registered in the effect registry
 * 2. The D4 conditional logic (bridged vs non-bridged) is documented
 * 3. Payload extraction fallback behavior is tested via pure helpers
 */

describe("transfer effects registry", () => {
	it("recordTransferProviderRef is registered", () => {
		expect(effectRegistry.recordTransferProviderRef).toBeDefined();
	});

	it("publishTransferConfirmed is registered", () => {
		expect(effectRegistry.publishTransferConfirmed).toBeDefined();
	});

	it("publishTransferFailed is registered", () => {
		expect(effectRegistry.publishTransferFailed).toBeDefined();
	});

	it("publishTransferReversed is registered", () => {
		expect(effectRegistry.publishTransferReversed).toBeDefined();
	});
});
```

`convex/payments/cashLedger/__tests__/reversalCascade.test.ts`:

```ts
describe("T-013: postTransferReversal single-entry", () => {
	it("creates a REVERSAL entry with swapped accounts and correct linkage", async () => {
		const t = createHarness(modules);
		auditLogTest.register(t, "auditLog");
		const state = await setupFullSettlementState(t);

		const transferRequestId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("transferRequests", {
				status: "reversed",
				direction: "inbound",
				transferType: "borrower_interest_collection",
				amount: TOTAL_AMOUNT,
				currency: "CAD",
				counterpartyType: "borrower",
				counterpartyId: "test-borrower",
				providerCode: "manual",
				idempotencyKey: `test-reversal-linkage-${now}`,
				source: SYSTEM_SOURCE,
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
				borrowerId: state.borrowerId,
				reversedAt: now,
				createdAt: now,
				lastTransitionAt: now,
			});
		});

		const transferBackedEntry = await t.run(async (ctx) => {
			const trustCash = await getOrCreateCashAccount(ctx, {
				family: "TRUST_CASH",
				mortgageId: state.mortgageId,
			});
			const borrowerReceivable = await findCashAccount(ctx.db, {
				family: "BORROWER_RECEIVABLE",
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
			});

			return postCashEntryInternal(ctx, {
				entryType: "CASH_RECEIVED",
				effectiveDate: "2026-03-01",
				amount: TOTAL_AMOUNT,
				debitAccountId: trustCash._id,
				creditAccountId: borrowerReceivable._id,
				idempotencyKey: buildIdempotencyKey(
					"cash-received",
					"transfer",
					transferRequestId as string
				),
				mortgageId: state.mortgageId,
				obligationId: state.obligationId,
				transferRequestId,
				borrowerId: state.borrowerId,
				source: SYSTEM_SOURCE,
			});
		});

		const result = await t.run(async (ctx) => {
			return postTransferReversal(ctx, {
				transferRequestId,
				originalEntryId: transferBackedEntry.entry._id,
				amount: TOTAL_AMOUNT,
				effectiveDate: "2026-03-10",
				source: SYSTEM_SOURCE,
				reason: "Transfer reversal test",
			});
		});

		expect(result.entry.entryType).toBe("REVERSAL");
		expect(result.entry.causedBy).toBe(transferBackedEntry.entry._id);
		expect(result.entry.transferRequestId).toBe(transferRequestId);
	});
});
```

## Constraints & Rules

- Use the real effect internal mutations, not helper-only pure functions.
- Preserve the current D4 behavior: bridged transfers with `collectionAttemptId` do not duplicate cash posting.
- Preserve fail-closed reversal behavior for non-bridged transfers without a transfer-backed journal entry.
- Keep the test setup aligned with existing `cashLedger` harness patterns and `SYSTEM_SOURCE`.
- `bun check`, `bun typecheck`, and `bunx convex codegen` must pass before the issue is considered complete.
- Do not introduce `any`.
