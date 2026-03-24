# Chunk 2 Context: Audit Trail Tests

## What We're Testing
The hash-chained audit trail integration created in Chunk 1. Every cash ledger posting should generate a tamper-evident audit record via the `auditTrail` component. We verify record creation, balance state capture, hash chain integrity, rejection auditing, and idempotency.

## Test Framework & Patterns

This project uses `convex-test` for Convex function testing. All existing cash ledger tests follow the same pattern.

### Shared Test Utilities (testUtils.ts)
```typescript
import { convexTest } from "convex-test";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { getOrCreateCashAccount } from "../accounts";
import { type PostCashEntryInput, postCashEntryInternal } from "../postEntry";
import type { CashAccountFamily, ControlSubaccount } from "../types";

export const SYSTEM_SOURCE = {
	channel: "scheduler" as const,
	actorId: "system",
	actorType: "system" as const,
};

export const ADMIN_SOURCE = {
	channel: "admin_dashboard" as const,
	actorId: "admin-user-123",
	actorType: "admin" as const,
};

export function createHarness(modules: Record<string, () => Promise<unknown>>) {
	return convexTest(schema, modules);
}
export type TestHarness = ReturnType<typeof convexTest>;

// seedMinimalEntities — creates borrower, lenders, mortgage, ownership accounts
export async function seedMinimalEntities(t: TestHarness) { ... }

// createTestAccount — creates cash_ledger_account with optional initial balances
export async function createTestAccount(t: TestHarness, spec: CreateTestAccountSpec) { ... }

// postTestEntry — convenience wrapper around postCashEntryInternal
export async function postTestEntry(t: TestHarness, args: PostCashEntryInput) {
	return t.run(async (ctx) => {
		return postCashEntryInternal(ctx, args);
	});
}
```

### Typical Test Structure
```typescript
import { describe, expect, it } from "vitest";
import { createHarness, createTestAccount, postTestEntry, SYSTEM_SOURCE } from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");

describe("feature under test", () => {
	it("should do something", async () => {
		const t = createHarness(modules);
		// seed data
		const debitAccount = await createTestAccount(t, { family: "TRUST_CASH", initialDebitBalance: 100_000n });
		const creditAccount = await createTestAccount(t, { family: "BORROWER_RECEIVABLE" });
		// act
		const result = await postTestEntry(t, {
			entryType: "CASH_RECEIVED",
			effectiveDate: "2026-03-01",
			amount: 50_000,
			debitAccountId: debitAccount._id,
			creditAccountId: creditAccount._id,
			idempotencyKey: "cash-ledger:test:1",
			source: SYSTEM_SOURCE,
		});
		// assert
		expect(result.entry.entryType).toBe("CASH_RECEIVED");
	});
});
```

## AuditTrail Component API for Testing

The `AuditTrail` client (`convex/auditTrailClient.ts`) provides:

```typescript
class AuditTrail {
	// Insert audit event + outbox entry atomically
	async insert(ctx: MutationCtx, event: {
		entityId: string;
		entityType: string;
		eventType: string;
		actorId: string;
		beforeState?: string;
		afterState?: string;
		metadata?: string;
		timestamp: number;
	}): Promise<string>;

	// Query all audit events for an entity, ordered ascending
	async queryByEntity(ctx: QueryCtx, args: { entityId: string }): Promise<AuditEvent[]>;

	// Verify hash chain integrity for an entity
	async verifyChain(ctx: QueryCtx, args: { entityId: string }): Promise<{
		valid: boolean;
		eventCount: number;
		// ... or { valid: false, brokenAt: number, error: string }
	}>;
}
```

### IMPORTANT: AuditTrail is a component — accessing it in tests

The `AuditTrail` class requires a component reference (`components.auditTrail`). In convex-test, components may not be fully available. There are two approaches:

**Approach A: Test via the workflow mutation directly**
Instead of testing the full workflow pipeline (which requires the workflow component), test the `processCashLedgerHashChainStep` mutation directly by calling it via `t.mutation()`.

**Approach B: Test indirectly via the audit_events table**
Since `convex-test` runs in the same database context, you can query the `audit_events` table from the auditTrail component directly after a posting. However, component tables may not be accessible from the host test harness.

**Recommended approach:** Since the workflow runs asynchronously (`startAsync: true`), the audit record won't exist immediately after `postCashEntryInternal` returns. For tests:
1. Call `postCashEntryInternal` to create the entry
2. Call `processCashLedgerHashChainStep` directly (synchronous, bypasses workflow) to create the audit record
3. Query the audit trail via `AuditTrail.queryByEntity()` or `AuditTrail.verifyChain()`

For rejection tests, the audit record IS created synchronously (direct `auditTrail.insert()`, not via workflow).

## Hash Chain Module API (from Chunk 1)

After Chunk 1 is complete, these exports exist in `convex/payments/cashLedger/hashChain.ts`:

```typescript
// Builds audit trail insert args from a cash ledger entry + balance snapshots
export function buildCashLedgerAuditArgs(
	entry: Doc<"cash_ledger_journal_entries">,
	balanceBefore: { debit: bigint; credit: bigint },
	balanceAfter: { debit: bigint; credit: bigint }
): { entityId: string; entityType: string; eventType: string; actorId: string; beforeState: string; afterState: string; metadata: string; timestamp: number };

// Internal mutation — reads entry, inserts into auditTrail component
export const processCashLedgerHashChainStep: InternalMutation;  // args: { entryId, balanceBefore, balanceAfter }

// Durable workflow wrapping the step
export const cashLedgerHashChainWorkflow: WorkflowDefinition;

// Start function called by nudge()
export async function startCashLedgerHashChain(ctx, args): Promise<void>;
```

## Test Specifications

### T-008: Test harness setup
- Create file with proper imports
- Use `import.meta.glob("/convex/**/*.ts")` for module loading
- Import `AuditTrail` from `../../../auditTrailClient` and instantiate with `components.auditTrail`
- Helper to create accounts + post entries in a single `t.run()` block

### T-009: Successful posting creates audit record
1. Create debit (TRUST_CASH) and credit (BORROWER_RECEIVABLE) accounts with balances
2. Post a CASH_RECEIVED entry via `postTestEntry`
3. In a separate `t.run()`, call `processCashLedgerHashChainStep` directly with the entry ID and balance snapshots
4. Query audit trail via `AuditTrail.queryByEntity(ctx, { entityId: entry._id })`
5. Assert: audit record exists with `entityType === "cashLedgerEntry"` and `eventType === "CASH_RECEIVED"`

### T-010: Balance state transitions in beforeState/afterState
1. Create accounts with known initial balances (e.g., TRUST_CASH: debit=100_000n, BORROWER_RECEIVABLE: debit=50_000n)
2. Post entry for 25_000 cents
3. Trigger hash chain step
4. Query audit record, parse `beforeState` and `afterState` JSON
5. Assert: `beforeState` contains pre-posting debit/credit balances, `afterState` contains post-posting balances + amount

### T-011: Hash chain integrity
1. Create accounts
2. Post 3 entries sequentially (different idempotency keys)
3. Trigger hash chain step for each
4. Call `AuditTrail.verifyChain(ctx, { entityId: entry1._id })`
5. Assert: `valid === true` for each entry's chain
6. **Note:** Since entityId = entry._id, each entry has its own 1-event chain. All should verify independently.

### T-012: Rejected posting creates audit record
1. Attempt to post an entry that will fail validation (e.g., amount = 0, or debit === credit)
2. Catch the ConvexError
3. Query audit trail for `entityId: "rejected:{idempotencyKey}"`
4. Assert: audit record exists with `eventType` ending in `:REJECTED`
5. Assert: `afterState` contains the rejection reason

### T-013: Correction chain auditable
1. Post an initial OBLIGATION_ACCRUED entry
2. Post a CORRECTION entry with `causedBy` referencing the original entry, `source.actorType = "admin"`, `source.actorId` set, and `reason` provided
3. Trigger hash chain step for both
4. Query audit records for both entries
5. Assert: both have audit records; correction's metadata includes `causedBy` reference

### T-014: Idempotent posting — no duplicate audit
1. Post an entry with idempotency key "cash-ledger:test:idem-1"
2. Trigger hash chain step
3. Post again with the same idempotency key (should return existing entry)
4. Query audit trail for that entity
5. Assert: only ONE audit record exists (idempotent return doesn't re-trigger nudge)

## Key Constraints
- Tests run with `vitest` — use `describe`, `it`, `expect`
- The `convex-test` harness creates an in-memory Convex backend
- Component mutations must be invoked via `t.mutation()` with the internal function reference
- BigInt values in workflow args are serialized as strings — tests must match this convention
- All test files must use `import.meta.glob("/convex/**/*.ts")` for module discovery
