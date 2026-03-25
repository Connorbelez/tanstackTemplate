# Chunk 1 Context: Hash Chain Module + Pipeline Wiring

## What We're Building
A hash-chained audit trail for every cash ledger posting, following the exact 2-layer pattern already used by the Governed Transition (GT) engine. This integrates the cash ledger's Step 9 (`nudge()`) with the existing `auditTrail` component.

## Architecture: Two-Layer Audit Pattern
- **Layer 1 (atomic):** The cash ledger journal entry IS the atomic record (the `cash_ledger_journal_entries` table insert happens in the same transaction as account balance updates).
- **Layer 2 (durable):** A workflow reads the persisted journal entry and inserts it into the `auditTrail` component via `AuditTrail.insert()` for SHA-256 hash-chaining.

The GT engine uses an intermediate `auditJournal` table for Layer 1. The cash ledger skips this — the journal entry table itself serves as Layer 1 since it already contains all needed audit fields.

## Existing GT Hash Chain Pattern (REFERENCE — follow this exactly)

File: `convex/engine/hashChain.ts`

```typescript
import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { AuditTrail } from "../auditTrailClient";

const auditTrail = new AuditTrail(components.auditTrail);
const workflow = new WorkflowManager(components.workflow);

// 1. buildArgs function — maps domain data to auditTrail.insert() shape
export function buildAuditTrailInsertArgs(entry: {
	actorId: string;
	channel: string;
	effectsScheduled?: string[];
	entityId: string;
	entityType: string;
	eventType: string;
	machineVersion?: string;
	newState: string;
	outcome: string;
	previousState: string;
	reason?: string;
	timestamp: number;
}) {
	return {
		entityId: entry.entityId,
		entityType: entry.entityType,
		eventType: entry.eventType,
		actorId: entry.actorId,
		beforeState: entry.previousState,
		afterState: entry.newState,
		metadata: JSON.stringify({
			outcome: entry.outcome,
			machineVersion: entry.machineVersion,
			effectsScheduled: entry.effectsScheduled,
			channel: entry.channel,
			reason: entry.reason,
		}),
		timestamp: entry.timestamp,
	};
}

// 2. processStep mutation — reads from source table, inserts into auditTrail
export const processHashChainStep = internalMutation({
	args: { journalEntryId: v.id("auditJournal") },
	handler: async (ctx, args) => {
		const entry = await ctx.db.get(args.journalEntryId);
		if (!entry) {
			console.warn(`[GT HashChain] Journal entry not found: ${args.journalEntryId}`);
			return;
		}
		try {
			await auditTrail.insert(ctx, buildAuditTrailInsertArgs(entry));
		} catch (error) {
			console.error(`[GT HashChain] Failed to insert audit trail entry for journal ${args.journalEntryId}:`, error);
			throw error;
		}
	},
});

// 3. Workflow definition — wraps mutation with durable retries
export const hashChainJournalEntry = workflow.define({
	args: { journalEntryId: v.id("auditJournal") },
	handler: runHashChainJournalStep,
});

export async function runHashChainJournalStep(
	step: Pick<MutationCtx, "runMutation">,
	args: { journalEntryId: Id<"auditJournal"> }
) {
	await step.runMutation(internal.engine.hashChain.processHashChainStep, {
		journalEntryId: args.journalEntryId,
	});
}

// 4. Start function — called by pipeline, env var kill switch
export async function startHashChain(
	ctx: Pick<MutationCtx, "runMutation" | "scheduler">,
	journalEntryId: Id<"auditJournal">
) {
	if (typeof process !== "undefined" && process.env.DISABLE_GT_HASHCHAIN === "true") {
		return;
	}
	await workflow.start(ctx, internal.engine.hashChain.hashChainJournalEntry, { journalEntryId }, { startAsync: true });
}
```

## AuditTrail Client API (auditTrailClient.ts)

```typescript
export class AuditTrail {
	constructor(component: AuditTrailComponentApi) { ... }

	async insert(ctx: MutationCtx, event: {
		entityId: string;
		entityType: string;
		eventType: string;
		actorId: string;
		beforeState?: string;
		afterState?: string;
		metadata?: string;
		timestamp: number;
	}): Promise<string> { ... }

	async queryByEntity(ctx: QueryCtx, args: { entityId: string }) { ... }
	async verifyChain(ctx: QueryCtx, args: { entityId: string }) { ... }
	async exportTrail(ctx: QueryCtx, args: { entityId: string }) { ... }
}
```

## AuditTrail Component Hash Chain Logic (components/auditTrail/lib.ts)

The `insert` mutation:
1. Sanitizes PII from beforeState/afterState/metadata
2. Gets previous hash from last event for the same entityId
3. Computes SHA-256 hash of `{ prevHash, eventType, entityId, actorId, timestamp, afterState }`
4. Inserts `audit_events` record with hash chain fields
5. Creates `audit_outbox` entry in same transaction

`verifyChain` recomputes all hashes and verifies chain integrity.

**IMPORTANT: entityId is the hash chain key.** All events for the same entityId are chained together. Using `entry._id` (Convex document ID) means each entry has its own independent chain. This is correct per the implementation plan.

## Current Cash Ledger Pipeline (postEntry.ts)

The pipeline has 9 steps. The key points for this task:

### Current `nudge()` — Step 9 (no-op):
```typescript
async function nudge(_ctx: MutationCtx): Promise<void> {
	void _ctx;
}
```

### Current `persistEntry()` — returns entry + projected balances:
```typescript
async function persistEntry(
	ctx: MutationCtx,
	args: PostCashEntryInput,
	debitAccount: Doc<"cash_ledger_accounts">,
	creditAccount: Doc<"cash_ledger_accounts">
) {
	const amount = BigInt(args.amount);
	const sequenceNumber = await getNextCashSequenceNumber(ctx);
	const timestamp = Date.now();

	// Updates account balances
	await Promise.all([
		ctx.db.patch(debitAccount._id, {
			cumulativeDebits: debitAccount.cumulativeDebits + amount,
		}),
		ctx.db.patch(creditAccount._id, {
			cumulativeCredits: creditAccount.cumulativeCredits + amount,
		}),
	]);

	// Inserts journal entry
	const entryId = await ctx.db.insert("cash_ledger_journal_entries", { ... });
	const entry = await ctx.db.get(entryId);

	const projectedDebit = projectCashAccountBalance(debitAccount, "debit", amount);
	const projectedCredit = projectCashAccountBalance(creditAccount, "credit", amount);

	return { entry, projectedDebitBalance: projectedDebit, projectedCreditBalance: projectedCredit };
}
```

### Current `postCashEntryInternal()` flow:
```typescript
export async function postCashEntryInternal(ctx: MutationCtx, args: PostCashEntryInput) {
	validateInput(args);           // Step 1
	const existing = await checkIdempotency(ctx, args.idempotencyKey);  // Step 2
	if (existing) return { entry: existing, projectedDebitBalance: 0n, projectedCreditBalance: 0n };
	const { debitAccount, creditAccount } = await resolveAccounts(ctx, args);  // Step 3
	familyCheck(args, debitAccount, creditAccount);    // Step 4
	balanceCheck(args, debitAccount, creditAccount);    // Step 5
	constraintCheck(args);                              // Step 6
	const result = await persistEntry(ctx, args, debitAccount, creditAccount);  // Step 7+8
	await nudge(ctx);                                   // Step 9
	return result;
}
```

## PostCashEntryInput Interface
```typescript
export interface PostCashEntryInput {
	amount: number;
	attemptId?: Id<"collectionAttempts">;
	borrowerId?: Id<"borrowers">;
	causedBy?: Id<"cash_ledger_journal_entries">;
	creditAccountId: Id<"cash_ledger_accounts">;
	dealId?: Id<"deals">;
	debitAccountId: Id<"cash_ledger_accounts">;
	dispersalEntryId?: Id<"dispersalEntries">;
	effectiveDate: string;
	entryType: CashEntryType;
	idempotencyKey: string;
	lenderId?: Id<"lenders">;
	metadata?: Record<string, unknown>;
	mortgageId?: Id<"mortgages">;
	obligationId?: Id<"obligations">;
	postingGroupId?: string;
	reason?: string;
	source: CommandSource;
	transferRequestId?: Id<"transferRequests">;
}
```

## Account Balance Functions (accounts.ts)
```typescript
export function getCashAccountBalance(account): bigint {
	return isCreditNormalFamily(account.family)
		? account.cumulativeCredits - account.cumulativeDebits
		: account.cumulativeDebits - account.cumulativeCredits;
}

export function projectCashAccountBalance(account, side, amount) {
	let signedDelta = amount;
	if (side === "debit" && isCreditNormalFamily(account.family)) signedDelta = -amount;
	else if (side === "credit" && !isCreditNormalFamily(account.family)) signedDelta = -amount;
	return getCashAccountBalance(account) + signedDelta;
}
```

## Implementation Plan Specifics

### T-001: buildCashLedgerAuditArgs
Maps a cash ledger journal entry + balance snapshots to `AuditTrail.insert()` args:
- `entityId`: `entry._id` as string (per-entry chain)
- `entityType`: `"cashLedgerEntry"` (literal string)
- `eventType`: `entry.entryType` (e.g., "OBLIGATION_ACCRUED", "CASH_RECEIVED")
- `actorId`: `entry.source.actorId ?? "system"`
- `beforeState`: JSON with debit/credit account balances BEFORE posting (BigInt → string)
- `afterState`: JSON with debit/credit account balances AFTER posting + amount + account IDs
- `metadata`: JSON with effectiveDate, causedBy, postingGroupId, reason, channel, mortgageId, obligationId
- `timestamp`: `entry.timestamp`

### T-002: processCashLedgerHashChainStep
- internalMutation with args: `{ entryId: v.id("cash_ledger_journal_entries"), balanceBefore: v.object({ debit: v.string(), credit: v.string() }), balanceAfter: v.object({ debit: v.string(), credit: v.string() }) }`
- Reads entry from DB, builds audit args, calls `auditTrail.insert()`
- BigInt serialization: pass as strings in workflow args, convert back via `BigInt()`
- Log + re-throw on failure (workflow handles retry)

### T-003: cashLedgerHashChainWorkflow
- `workflow.define()` with same args as step mutation
- Handler calls `step.runMutation(internal.payments.cashLedger.hashChain.processCashLedgerHashChainStep, args)`

### T-004: startCashLedgerHashChain
- Accepts `{ entryId, balanceBefore: { debit: bigint, credit: bigint }, balanceAfter: { debit: bigint, credit: bigint } }`
- Env var kill switch: `DISABLE_CASH_LEDGER_HASHCHAIN`
- Converts BigInt to string for workflow args
- Calls `workflow.start()` with `{ startAsync: true }`

### T-005: Wire nudge()
Change `nudge()` signature to accept the posting result and trigger audit:
```typescript
async function nudge(
	ctx: MutationCtx,
	args: {
		entry: Doc<"cash_ledger_journal_entries">;
		debitBalanceBefore: bigint;
		creditBalanceBefore: bigint;
		projectedDebitBalance: bigint;
		projectedCreditBalance: bigint;
	}
): Promise<void> {
	await startCashLedgerHashChain(ctx, {
		entryId: args.entry._id,
		balanceBefore: { debit: args.debitBalanceBefore, credit: args.creditBalanceBefore },
		balanceAfter: { debit: args.projectedDebitBalance, credit: args.projectedCreditBalance },
	});
}
```

### T-006: Modify persistEntry()
Capture balances BEFORE patching accounts:
```typescript
const debitBalanceBefore = getCashAccountBalance(debitAccount);
const creditBalanceBefore = getCashAccountBalance(creditAccount);
```
Return these in the result object alongside existing fields:
```typescript
return {
	entry,
	projectedDebitBalance: projectedDebit,
	projectedCreditBalance: projectedCredit,
	debitBalanceBefore,
	creditBalanceBefore,
};
```

### T-007: Rejection auditing
Wrap the validation/persist steps in try/catch inside `postCashEntryInternal()`:
- On error, call `auditTrail.insert()` directly (not via workflow — must be in same transaction)
- `entityId`: `rejected:${args.idempotencyKey}` (no Convex doc ID exists for rejected entries)
- `entityType`: `"cashLedgerEntry"`
- `eventType`: `${args.entryType}:REJECTED`
- `afterState`: JSON with entryType, amount, rejection reason
- `metadata`: JSON with effectiveDate, channel
- Re-throw original error after auditing
- If the audit insert itself fails, log warning and still re-throw the original error (don't mask it)

## Key Constraints
- **BigInt serialization:** `AuditTrail.insert()` accepts strings. Workflow args cannot contain BigInt. Always serialize via `.toString()`.
- **Workflow component:** Use `@convex-dev/workflow` WorkflowManager with `components.workflow` — already registered in convex.config.ts.
- **AuditTrail component:** Use the custom `AuditTrail` class from `../../auditTrailClient` with `components.auditTrail` — NOT the `auditLog` npm package.
- **Two different audit systems exist:**
  - `convex/auditTrailClient.ts` → `components.auditTrail` → hash-chained (USE THIS ONE)
  - `convex/auditLog.ts` → `components.auditLog` → general logging (NOT this one for hash chains)
- **Import paths:** Module is at `convex/payments/cashLedger/hashChain.ts`, so imports use `../../_generated/api`, `../../auditTrailClient`, etc.
- **Env var kill switch:** Follow GT pattern exactly — `DISABLE_CASH_LEDGER_HASHCHAIN` (not `DISABLE_GT_HASHCHAIN`).
