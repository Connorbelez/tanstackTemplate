# Chunk 01 Context: System Bootstrap Mutation

## Linear Issue: ENG-41

**Title:** Implement system bootstrap mutation — initialize WORLD account and sequence counter

### Acceptance Criteria (verbatim)
- [ ] Creates WORLD account if not exists (idempotent)
- [ ] Creates sequenceCounter if not exists (idempotent)
- [ ] Safe to call multiple times — no duplicates
- [ ] Auth: adminMutation
- [ ] Runs as part of deployment/seed flow
- [ ] Tests: fresh bootstrap, idempotent re-run

### Technical Notes
- Must be called before any ledger operations. mintAndIssue depends on WORLD account existing.
- Consider integrating into the existing seed mutation flow from Project 2.

---

## Confirmed Design Decisions

1. **Keep `mintMortgage`'s lazy WORLD init** as defense-in-depth (don't remove it)
2. **Keep standalone `initializeSequenceCounter` public mutation** for backward compatibility
3. **Bootstrap runs before everything** in seed flow

---

## Task T-001: Extract `initializeSequenceCounterInternal`

**File:** `convex/ledger/sequenceCounter.ts`

**Current code (full file):**
```typescript
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { ledgerMutation } from "../fluent";

const COUNTER_NAME = "ledger_sequence" as const;

/**
 * Bootstrap mutation: creates the singleton counter document with value 0.
 * Idempotent — safe to call multiple times.
 */
export const initializeSequenceCounter = ledgerMutation
	.handler(async (ctx) => {
		const existing = await ctx.db
			.query("ledger_sequence_counters")
			.withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
			.first();

		if (existing) {
			return existing._id;
		}

		return ctx.db.insert("ledger_sequence_counters", {
			name: COUNTER_NAME,
			value: 0n,
		});
	})
	.public();

/**
 * Internal helper: reads singleton, increments, patches, returns new value.
 * Must be called within a mutation context (writes to the counter doc).
 * Throws ConvexError if the counter has not been initialized.
 */
export async function getNextSequenceNumber(ctx: MutationCtx): Promise<bigint> {
	const counter = await ctx.db
		.query("ledger_sequence_counters")
		.withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
		.first();

	if (!counter) {
		throw new ConvexError({
			code: "SEQUENCE_COUNTER_NOT_INITIALIZED",
			message:
				"Ledger sequence counter not initialized. Run initializeSequenceCounter first.",
		});
	}

	const nextValue = counter.value + 1n;
	await ctx.db.patch(counter._id, { value: nextValue });
	return nextValue;
}
```

**What to do:**
1. Extract the handler body into a plain async function `initializeSequenceCounterInternal(ctx: MutationCtx)`
2. Have it return `Id<"ledger_sequence_counters">`
3. Update the existing `initializeSequenceCounter` public mutation to delegate to the new function
4. Export `initializeSequenceCounterInternal` so bootstrap.ts can import it
5. Add the `Id` import from `../_generated/dataModel`

**Pattern to follow — `initializeWorldAccount` in accounts.ts:**
```typescript
/** Creates the WORLD singleton idempotently. Returns existing if already created. */
export async function initializeWorldAccount(ctx: MutationCtx) {
	const existing = await ctx.db
		.query("ledger_accounts")
		.withIndex("by_type_and_mortgage", (q) =>
			q.eq("type", "WORLD").eq("mortgageId", undefined)
		)
		.first();
	if (existing) {
		return existing;
	}

	const id = await ctx.db.insert("ledger_accounts", {
		type: "WORLD",
		cumulativeDebits: 0n,
		cumulativeCredits: 0n,
		pendingDebits: 0n,
		pendingCredits: 0n,
		createdAt: Date.now(),
	});
	const account = await ctx.db.get(id);
	if (!account) {
		throw new Error("Failed to create WORLD account");
	}
	return account;
}
```

---

## Task T-002: Create `convex/ledger/bootstrap.ts`

**File:** `convex/ledger/bootstrap.ts` (new file)

**Requirements:**
- Import `adminMutation` from `../fluent`
- Import `initializeWorldAccount` from `./accounts`
- Import `initializeSequenceCounterInternal` from `./sequenceCounter`
- Use `adminMutation` middleware chain (authMiddleware → requireFairLendAdmin)
- `.input({})` — no arguments
- Call both init functions in sequence
- Return `{ worldAccountId, sequenceCounterId }`

**Auth chain — `adminMutation` from fluent.ts:**
```typescript
export const adminMutation = convex
	.mutation()
	.use(authMiddleware)
	.use(requireFairLendAdmin);
```
This requires: authenticated user with `admin` role in `FAIRLEND_STAFF_ORG_ID` ("org_01KKF56VABM4NYFFSR039RTJBM").

---

## Task T-003: Wire into seed flow

**File:** `convex/seed/seedAll.ts`

**Current code (full file):**
```typescript
import type { FunctionReference } from "convex/server";
import { api } from "../_generated/api";
import { adminAction } from "../fluent";

// These references resolve after `convex codegen` picks up the new seed files.
// Until then, cast through the api object to avoid TS errors.
const seedApi = api.seed as Record<
	string,
	Record<string, FunctionReference<"mutation", "public">>
>;

export const seedAll = adminAction
	.input({})
	.handler(async (ctx) => {
		const brokers = await ctx.runMutation(api.seed.seedBroker.seedBroker, {});
		const borrowers = await ctx.runMutation(
			api.seed.seedBorrower.seedBorrower,
			{}
		);
		// ... rest of seeding ...
		return { /* results */ };
	})
	.public();
```

**What to do:**
1. Add `const ledgerBootstrap = await ctx.runMutation(api.ledger.bootstrap.bootstrapLedger, {})` as the **first** call in the handler, before broker seeding
2. Add `ledgerBootstrap` to the return value
3. Add to the `summary.created` object: `ledgerBootstrap: "initialized"`

**Important:** `seedAll` is an `adminAction` using `ctx.runMutation()`. The auth context propagates from the action to the mutation since both use `adminMutation`/`adminAction` chains which verify FairLend admin status.

---

## Task T-004: Write tests

**File:** `convex/ledger/__tests__/bootstrap.test.ts` (new file)

**Test identity pattern from existing tests (sequenceCounter.test.ts):**
```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

const ADMIN_IDENTITY = {
	subject: "test-bootstrap-admin",
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
	user_email: "admin@fairlend.ca",
	user_first_name: "Bootstrap",
	user_last_name: "Admin",
};

function createTestHarness() {
	return convexTest(schema, modules);
}

function asAdmin(t: ReturnType<typeof createTestHarness>) {
	return t.withIdentity(ADMIN_IDENTITY);
}
```

**Test cases to implement:**

1. **Fresh bootstrap creates both singletons** — call bootstrapLedger, verify WORLD account exists with type="WORLD", all balance fields 0n, no mortgageId. Verify sequence counter exists with name="ledger_sequence", value=0n.

2. **Idempotent re-run returns same IDs** — call bootstrapLedger twice, verify same IDs returned. Verify only 1 WORLD account and 1 sequence counter exist (no duplicates).

3. **Non-admin user is rejected** — use identity without admin role, expect rejection (ConvexError about forbidden/admin).

4. **Ledger operations succeed after bootstrap** — bootstrap, then mint a mortgage, verify journal entry has sequenceNumber=1n (proves both WORLD and counter were initialized).

**FAIRLEND_STAFF_ORG_ID constant:**
```typescript
// convex/constants.ts
export const FAIRLEND_STAFF_ORG_ID = "org_01KKF56VABM4NYFFSR039RTJBM";
```

---

## Task T-005: Quality Checks

Run in this order:
```bash
bun check          # Lint + format (auto-fixes first)
bun typecheck      # TypeScript compilation
bunx convex codegen # Convex type generation
bun run test       # Run all tests
```

Fix any errors before marking complete.

---

## Schema Reference

### ledger_accounts table
```typescript
ledger_accounts: defineTable({
    type: v.union(v.literal("WORLD"), v.literal("TREASURY"), v.literal("POSITION")),
    mortgageId: v.optional(v.string()),
    lenderId: v.optional(v.string()),
    cumulativeDebits: v.int64(),
    cumulativeCredits: v.int64(),
    pendingDebits: v.int64(),
    pendingCredits: v.int64(),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
})
    .index("by_mortgage", ["mortgageId"])
    .index("by_lender", ["lenderId"])
    .index("by_mortgage_and_lender", ["mortgageId", "lenderId"])
    .index("by_type_and_mortgage", ["type", "mortgageId"]),
```

### ledger_sequence_counters table
```typescript
ledger_sequence_counters: defineTable({
    name: v.literal("ledger_sequence"),
    value: v.int64(),
}).index("by_name", ["name"]),
```

---

## Imports Reference

```typescript
// From convex/fluent.ts
export const adminMutation = convex.mutation().use(authMiddleware).use(requireFairLendAdmin);
export const ledgerMutation = authedMutation.use(requirePermission("ledger:correct"));

// From convex/ledger/accounts.ts
export async function initializeWorldAccount(ctx: MutationCtx) { ... }

// From convex/_generated/dataModel
import type { Id } from "../_generated/dataModel";
```
