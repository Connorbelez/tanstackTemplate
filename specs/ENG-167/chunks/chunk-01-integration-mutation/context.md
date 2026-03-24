# Chunk 1 Context: Admin Write-Off Integration + Mutation + Tests

## Linear Issue: ENG-167 — Admin Write-Off Workflow

### Summary
Admin mutation to write off uncollectible obligation balances, recognizing bad debt explicitly.

### Acceptance Criteria
- WRITE_OFF account tracks cumulative bad debt
- BORROWER_RECEIVABLE reduced by write-off amount
- Partial write-offs leave remaining balance collectible
- Source attribution and reason recorded
- Audit trail created

---

## Design Decision: No GT State Change

Write-offs differ from waivers conceptually:
- **Waiver** = FairLend forgives debt → obligation lifecycle ends (GT `waived` state)
- **Write-off** = FairLend recognizes bad debt → obligation may still collect recovery payments

The spec says: "If cash later collected on written-off obligation, CORRECTION entry reverses part of write-off." This means the obligation stays in its current GT state — it remains active for potential recovery.

**No obligation state machine changes required.**

---

## What Already Exists

### Cash Ledger Types (`convex/payments/cashLedger/types.ts`)

```typescript
// OBLIGATION_WRITTEN_OFF is already in CASH_ENTRY_TYPES
// Family map already defined:
OBLIGATION_WRITTEN_OFF: {
  debit: ["WRITE_OFF"],
  credit: ["BORROWER_RECEIVABLE"],
}

// WRITE_OFF is already in CASH_ACCOUNT_FAMILIES
// WRITE_OFF is NOT in CREDIT_NORMAL_FAMILIES (it's debit-normal: balance = cumDebits - cumCredits)
// BORROWER_RECEIVABLE is in NEGATIVE_BALANCE_EXEMPT_FAMILIES (can go negative)

// buildIdempotencyKey helper exists for standardized keys
```

### Posting Pipeline (`convex/payments/cashLedger/postEntry.ts`)

The 9-step `postCashEntryInternal` pipeline is fully operational:
1. VALIDATE_INPUT — amount positive safe integer, debit ≠ credit
2. IDEMPOTENCY — check by_idempotency index
3. RESOLVE_ACCOUNTS — load debit/credit accounts
4. FAMILY_CHECK — validate entry type vs account families via CASH_ENTRY_TYPE_FAMILY_MAP
5. BALANCE_CHECK — credit account sufficient (BORROWER_RECEIVABLE exempt)
6. CONSTRAINT_CHECK — entry-type-specific rules
7. SEQUENCE — monotonic sequence number
8. PERSIST — atomic update accounts + insert journal entry
9. NUDGE — no-op for now

### Account Utilities (`convex/payments/cashLedger/accounts.ts`)

```typescript
// Key functions to use:
findCashAccount(db, spec)        // Returns account or null
requireCashAccount(db, spec, label)  // Throws if not found
getOrCreateCashAccount(ctx, spec)    // Creates if missing
getCashAccountBalance(account)       // Returns bigint balance (debit-normal or credit-normal)
```

### Auth Middleware (`convex/fluent.ts`)

```typescript
// Use adminMutation for the public mutation:
export const adminMutation = convex
  .mutation()
  .use(authMiddleware)
  .use(requireFairLendAdmin);

// The Viewer interface provides:
interface Viewer {
  authId: string;
  // ... other fields
}

// ctx.viewer.authId is the actor ID for audit/source
```

### Audit Log (`convex/auditLog.ts`)

```typescript
import { auditLog } from "../../auditLog";

// Usage pattern (from integrations.ts postToSuspense):
await auditLog.log(ctx, {
  action: "cashLedger.suspense_routed",
  actorId: args.source.actorId ?? "system",
  resourceType: "mortgage",
  resourceId: args.mortgageId,
  severity: "warning",
  metadata: { ... },
});
```

### Existing Integration Functions (`convex/payments/cashLedger/integrations.ts`)

Pattern to follow (from `postObligationAccrued`):
1. Load obligation from db
2. Find/create relevant cash accounts
3. Call `postCashEntryInternal` with proper args
4. Use `normalizeSource` for source normalization
5. Use `buildIdempotencyKey` for key generation
6. Use `unixMsToBusinessDate` for date conversion

Note: `normalizeSource` and `unixMsToBusinessDate` are module-private functions in `integrations.ts`. Your new function goes in the same file so you can use them directly.

### Existing Mutation (`convex/payments/cashLedger/mutations.ts`)

Currently only has `postLenderPayout` as an `internalMutation`. The write-off mutation will be the first `adminMutation` (public, auth-gated) in this file.

```typescript
// postLenderPayout pattern:
export const postLenderPayout = internalMutation({
  args: { ... },
  handler: async (ctx, args) => {
    // 1. Validate amount
    // 2. requireCashAccount for both sides
    // 3. postCashEntryInternal
    // 4. Return result
  },
});
```

### Collection Plan Entries Schema

```typescript
// collectionPlanEntries table:
{
  obligationIds: v.array(v.id("obligations")),  // NOTE: array of obligation IDs
  amount: v.number(),
  method: v.string(),
  scheduledDate: v.number(),
  status: v.union("planned", "executing", "completed", "cancelled", "rescheduled"),
  // ...
}
// Index: none directly by obligationId (it's an array field)

// collectionAttempts table:
{
  status: v.string(),
  planEntryId: v.id("collectionPlanEntries"),
  method: v.string(),
  amount: v.number(),
  // ...
}
// Index: by_plan_entry, by_status
```

### Test Utilities (`convex/payments/cashLedger/__tests__/testUtils.ts`)

```typescript
// Available test helpers:
createHarness(modules)           // Create convex-test harness
seedMinimalEntities(t)           // Seeds broker, borrower, lenders, property, mortgage
createTestAccount(t, spec)       // Creates cash_ledger_account with optional initial balances
createSettledObligation(t, args) // Creates settled obligation with balanced receivable
postTestEntry(t, args)           // Wrapper for postCashEntryInternal

// Constants:
SYSTEM_SOURCE   // { channel: "scheduler", actorId: "system", actorType: "system" }
ADMIN_SOURCE    // { channel: "admin_dashboard", actorId: "admin-user-123", actorType: "admin" }
ADMIN_IDENTITY  // { name: "Admin", email: "admin@fairlend.test", tokenIdentifier: "test-admin", subject: "test-admin" }
```

---

## Implementation Details

### T-001: `postObligationWriteOff` in integrations.ts

Add after the existing `postSettlementAllocation` function:

```typescript
export async function postObligationWriteOff(
  ctx: MutationCtx,
  args: {
    obligationId: Id<"obligations">;
    amount: number;
    reason: string;
    source: CommandSource;
  }
) {
  const obligation = await ctx.db.get(args.obligationId);
  if (!obligation) {
    throw new ConvexError(`Obligation not found: ${args.obligationId}`);
  }

  // Validate: write-off amount ≤ outstanding receivable balance
  const receivableAccount = await requireCashAccount(
    ctx.db,
    {
      family: "BORROWER_RECEIVABLE",
      mortgageId: obligation.mortgageId,
      obligationId: obligation._id,
    },
    "postObligationWriteOff"
  );
  const outstandingBalance = getCashAccountBalance(receivableAccount);
  if (BigInt(args.amount) > outstandingBalance) {
    throw new ConvexError(
      `Write-off amount ${args.amount} exceeds outstanding balance ${outstandingBalance}`
    );
  }

  const writeOffAccount = await getOrCreateCashAccount(ctx, {
    family: "WRITE_OFF",
    mortgageId: obligation.mortgageId,
    obligationId: obligation._id,
  });

  return postCashEntryInternal(ctx, {
    entryType: "OBLIGATION_WRITTEN_OFF",
    effectiveDate: unixMsToBusinessDate(Date.now()),
    amount: args.amount,
    debitAccountId: writeOffAccount._id,
    creditAccountId: receivableAccount._id,
    idempotencyKey: buildIdempotencyKey(
      "write-off",
      args.obligationId,
      String(Date.now()),
      crypto.randomUUID()
    ),
    mortgageId: obligation.mortgageId,
    obligationId: obligation._id,
    borrowerId: obligation.borrowerId,
    source: normalizeSource(args.source),
    reason: args.reason,
  });
}
```

**Key decisions:**
- `requireCashAccount` (not `findCashAccount`) for BORROWER_RECEIVABLE — a write-off requires an existing receivable
- `getOrCreateCashAccount` for WRITE_OFF — may not exist yet for this obligation
- Idempotency key includes timestamp plus `crypto.randomUUID()` so partial write-offs never collide within the same millisecond (pipeline dedupes identical keys)
- `getCashAccountBalance` returns the debit-normal balance for BORROWER_RECEIVABLE — positive means money is owed
- Need to import `requireCashAccount` and `getCashAccountBalance` from `./accounts` (add to existing imports)

### T-002: `writeOffObligationBalance` admin mutation in mutations.ts

This is a PUBLIC mutation (not internal) gated by `adminMutation` middleware chain.

```typescript
import { adminMutation } from "../../fluent";
import { auditLog } from "../../auditLog";
import type { CommandSource } from "../../engine/types";

export const writeOffObligationBalance = adminMutation
  .input({
    obligationId: v.id("obligations"),
    amount: v.number(),
    reason: v.string(),
  })
  .handler(async (ctx, args) => {
    // 1. Validate amount
    if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
      throw new ConvexError(
        "Write-off amount must be a positive safe integer"
      );
    }

    // 2. Load obligation
    const obligation = await ctx.db.get(args.obligationId);
    if (!obligation) {
      throw new ConvexError(`Obligation not found: ${args.obligationId}`);
    }

    // 3. Reject settled/waived obligations
    if (obligation.status === "settled" || obligation.status === "waived") {
      throw new ConvexError(
        `Cannot write off obligation in "${obligation.status}" status`
      );
    }

    // 4. Check for active collection attempts (warning only)
    const activeAttempts = await findActiveCollectionAttempts(
      ctx,
      args.obligationId
    );
    const hasActiveCollectionWarning = activeAttempts.length > 0;

    // 5. Build source
    const source: CommandSource = {
      actorType: "admin",
      actorId: ctx.viewer.authId,
      channel: "admin_dashboard",
    };

    // 6. Post cash ledger entry
    const result = await postObligationWriteOff(ctx, {
      obligationId: args.obligationId,
      amount: args.amount,
      reason: args.reason,
      source,
    });

    // 7. Audit log (namespaced action; matches e.g. cashLedger.suspense_routed)
    await auditLog.log(ctx, {
      action: "cashLedger.obligation_written_off",
      actorId: ctx.viewer.authId,
      resourceType: "obligation",
      resourceId: args.obligationId,
      severity: "warning",
      metadata: {
        amount: args.amount,
        reason: args.reason,
        entryId: result.entry._id,
        hasActiveCollectionWarning,
        activeAttemptCount: activeAttempts.length,
      },
    });

    return {
      entry: result.entry,
      writtenOffAmount: args.amount,
      hasActiveCollectionWarning,
    };
  })
  .public();
```

**Note on fluent-convex `.public()`:** The `adminMutation` chain from `fluent.ts` requires `.public()` at the end to expose the mutation. Without it, the mutation won't be callable.

### T-003: `findActiveCollectionAttempts` helper

Place this in `mutations.ts` as a module-private helper (not exported). It queries for non-terminal collection attempts linked to the obligation.

```typescript
async function findActiveCollectionAttempts(
  ctx: MutationCtx,
  obligationId: Id<"obligations">
) {
  // Find collection plan entries that include this obligation
  // NOTE: obligationIds is an array field — no index by single obligationId
  // We scan by status to find active plan entries
  const planEntries = await ctx.db
    .query("collectionPlanEntries")
    .collect();

  const matchingPlanEntries = planEntries.filter(
    (pe) =>
      pe.obligationIds.includes(obligationId) &&
      (pe.status === "planned" || pe.status === "executing")
  );

  const activeAttempts = [];
  for (const pe of matchingPlanEntries) {
    const attempts = await ctx.db
      .query("collectionAttempts")
      .withIndex("by_plan_entry", (q) => q.eq("planEntryId", pe._id))
      .collect();
    for (const attempt of attempts) {
      // Terminal statuses for collection attempts
      if (
        attempt.status !== "confirmed" &&
        attempt.status !== "permanent_fail" &&
        attempt.status !== "cancelled"
      ) {
        activeAttempts.push(attempt);
      }
    }
  }
  return activeAttempts;
}
```

**Design note:** `collectionPlanEntries.obligationIds` is an array, so there's no indexed lookup by single obligation. This full-table scan is acceptable for admin-only operations (low frequency). If performance becomes an issue, add a denormalized index table.

### T-004: Test Cases for `writeOff.test.ts`

Test file: `convex/payments/cashLedger/__tests__/writeOff.test.ts`

Use the existing test harness pattern. Key test cases:

1. **Full write-off** — Write off entire outstanding balance → OBLIGATION_WRITTEN_OFF posted, WRITE_OFF debit-normal balance increases, BORROWER_RECEIVABLE balance decreases to 0
2. **Partial write-off** — Write off portion → remaining BORROWER_RECEIVABLE balance still positive
3. **Multiple partial write-offs** — Two partial write-offs accumulate correctly on both accounts
4. **Exceeds balance** — Amount > outstanding receivable → ConvexError
5. **Already settled obligation** — Obligation in `settled` state → ConvexError
6. **Already waived obligation** — Obligation in `waived` state → ConvexError
7. **Zero/negative amount** — → ConvexError (positive safe integer required)
8. **No GT state change** — After write-off, obligation status unchanged (still `due`/`overdue`)
9. **Active collection warning** — Write-off with active collection attempt returns `hasActiveCollectionWarning: true` but still succeeds
10. **Audit trail** — Mutation logs `cashLedger.obligation_written_off` with actorId, amount, reason, `entryId`, and collection-warning fields
11. **Source attribution** — Journal entry has `actorType: "admin"`, proper actorId and `admin_dashboard` channel
12. **Idempotency** — Keys are unique per post (timestamp + UUID); pipeline still dedupes exact key retries

**Test setup pattern:**
```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../../schema";
import {
  ADMIN_SOURCE,
  createHarness,
  seedMinimalEntities,
} from "./testUtils";

// For the integration function tests (direct, no auth):
// Use t.run() with postObligationWriteOff directly

// For the admin mutation tests (auth-gated):
// Use t.mutation(api.payments.cashLedger.mutations.writeOffObligationBalance, args)
// with t.withIdentity(ADMIN_IDENTITY) for authenticated context
```

### T-005: Quality Gate

Run these commands and fix any issues:
```bash
bun check
bun typecheck
bunx convex codegen
```

---

## Constraints

- All monetary amounts are safe integers in cents (REQ-248)
- Entries are append-only (REQ-242)
- Admin auth required via `adminMutation` chain (from `convex/fluent.ts`)
- `reason` field is mandatory on the mutation
- Source must include `actorType: 'admin'`
- WRITE_OFF is debit-normal (balance = cumDebits - cumCredits)
- No GT state machine transition — obligation stays in current state
- Follow existing patterns in `integrations.ts` and `mutations.ts`

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `convex/payments/cashLedger/integrations.ts` | Add `postObligationWriteOff` function |
| `convex/payments/cashLedger/mutations.ts` | Add `writeOffObligationBalance` admin mutation + `findActiveCollectionAttempts` helper |
| `convex/payments/cashLedger/__tests__/writeOff.test.ts` | Create — all test cases |
