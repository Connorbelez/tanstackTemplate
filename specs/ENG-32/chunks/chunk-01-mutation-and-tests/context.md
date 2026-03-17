# Context: ENG-32 — postCorrection Convenience Mutation

## Issue Description

Implement `postCorrection` as an `adminMutation` in `convex/ledger/mutations.ts`. Creates offset entries to correct posting errors without modifying originals (immutable journal).

## Acceptance Criteria (verbatim)

- [ ] Posts CORRECTION entry with reversed debit/credit from original error
- [ ] Requires `causedBy`: v.id("journalEntries") — must reference an existing entry
- [ ] Requires `reason`: v.string() — non-empty explanation
- [ ] Requires source.actor = "admin" (enforced by adminMutation middleware)
- [ ] Original entry remains unmodified in journal (immutability preserved)
- [ ] New correction entry links back via causedBy
- [ ] Auth: adminMutation (admin role required)
- [ ] Tests: happy path correction, missing causedBy rejected, empty reason rejected, original unchanged after correction

## Architecture: What Already Exists

### postEntry Pipeline (convex/ledger/postEntry.ts)

The `postEntry` function is the ONLY write path for all ledger mutations. It already has **full CORRECTION support**:

**Type check (Step 4, lines 267-292):**
```typescript
if (args.entryType === "CORRECTION") {
    if (args.source.type !== "user") {
        throw new ConvexError({ code: "CORRECTION_REQUIRES_ADMIN", message: "CORRECTION requires source.type = 'user'" });
    }
    if (!args.source.actor) {
        throw new ConvexError({ code: "CORRECTION_REQUIRES_ADMIN", message: "CORRECTION requires source.actor (admin identity)" });
    }
    if (!args.causedBy) {
        throw new ConvexError({ code: "CORRECTION_REQUIRES_CAUSED_BY", message: "CORRECTION requires causedBy reference to existing entry" });
    }
    if (!args.reason) {
        throw new ConvexError({ code: "CORRECTION_REQUIRES_REASON", message: "CORRECTION requires a reason" });
    }
}
```

**Constraint check (Step 6, lines 434-448):**
```typescript
function constraintCorrection(ctx: ConstraintContext): void {
    if (ctx.debitAccount.type === "POSITION") {
        const debitAfter = getPostedBalance(ctx.debitAccount) + ctx.amountBigInt;
        checkMinPosition(debitAfter, "Corrected debit position");
    }
    if (ctx.creditAccount.type === "POSITION") {
        const creditAfter = getPostedBalance(ctx.creditAccount) - ctx.amountBigInt;
        checkMinPosition(creditAfter, "Corrected credit position");
    }
}
```

**Type map (convex/ledger/types.ts line 63):**
```typescript
CORRECTION: { debit: ALL_ACCOUNT_TYPES, credit: ALL_ACCOUNT_TYPES },
```

### PostEntryInput Interface (convex/ledger/postEntry.ts)

```typescript
export interface PostEntryInput {
    amount: number;
    causedBy?: Id<"ledger_journal_entries">;
    creditAccountId: Id<"ledger_accounts">;
    debitAccountId: Id<"ledger_accounts">;
    effectiveDate: string;
    entryType: EntryType;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    mortgageId: string;
    reason?: string;
    reservationId?: Id<"ledger_reservations">;
    source: EventSource;
}
```

### Validator (convex/ledger/validators.ts lines 108-121)

Already defined:
```typescript
export const postCorrectionArgsValidator = {
    mortgageId: v.string(),
    debitAccountId: v.id("ledger_accounts"),
    creditAccountId: v.id("ledger_accounts"),
    amount: v.number(),
    effectiveDate: v.string(),
    idempotencyKey: v.string(),
    source: eventSourceValidator,
    causedBy: v.id("ledger_journal_entries"),
    reason: v.string(),
    metadata: v.optional(v.any()),
};
```

### Auth Chains (convex/fluent.ts)

```typescript
// Admin mutations require admin role in WorkOS JWT
export const adminMutation = convex
    .mutation()
    .use(authMiddleware)
    .use(requireFairLendAdmin);

// Ledger mutations require ledger:correct permission (less restrictive)
export const ledgerMutation = authedMutation.use(
    requirePermission("ledger:correct")
);
```

**Use `adminMutation` for postCorrection** (not `ledgerMutation`) per AC.

### Existing Mutation Pattern (convex/ledger/mutations.ts)

The existing convenience mutations follow this pattern:
```typescript
import { ledgerMutation } from "../fluent";
import { postEntry } from "./postEntry";
import { someArgsValidator } from "./validators";

export const someConvenience = ledgerMutation
    .input(someArgsValidator)
    .handler(async (ctx, args) => {
        // 1. Idempotency check
        // 2. Precondition checks (account lookups, validations)
        // 3. Call postEntry with entryType and resolved accounts
        return postEntry(ctx, { ... });
    })
    .public();
```

Already imported at top of mutations.ts:
- `ConvexError` from "convex/values"
- `postEntry` from "./postEntry"
- Various validators from "./validators"

**Note:** `adminMutation` is NOT yet imported — you need to add it.
**Note:** `postCorrectionArgsValidator` is NOT yet imported — you need to add it.

### Constants (convex/ledger/constants.ts)

```typescript
export const TOTAL_SUPPLY = 10_000n;
export const MIN_FRACTION = 1_000n;
```

### Existing Test Pattern (convex/ledger/__tests__/postEntry.test.ts)

```typescript
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

const LEDGER_TEST_IDENTITY = {
    subject: "test-ledger-user",
    issuer: "https://api.workos.com",
    org_id: FAIRLEND_STAFF_ORG_ID,
    organization_name: "FairLend Staff",
    role: "admin",
    roles: JSON.stringify(["admin"]),
    permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
    user_email: "ledger-test@fairlend.ca",
    user_first_name: "Ledger",
    user_last_name: "Tester",
};

const SYS_SOURCE = { type: "system" as const, channel: "test" };
const ADMIN_SOURCE = { type: "user" as const, actor: "admin-1", channel: "admin" };

function createTestHarness() {
    return convexTest(schema, modules);
}

function asLedgerUser(t: ReturnType<typeof createTestHarness>) {
    return t.withIdentity(LEDGER_TEST_IDENTITY);
}

function getConvexErrorCode(e: unknown): string {
    expect(e).toBeInstanceOf(ConvexError);
    if (!(e instanceof ConvexError)) throw new Error("Expected ConvexError");
    const data = e.data;
    if (typeof data === "string") {
        const parsed = JSON.parse(data) as { code?: string };
        return parsed.code ?? "";
    }
    if (typeof data === "object" && data !== null) {
        return (data as { code?: string }).code ?? "";
    }
    return "";
}
```

### FAIRLEND_STAFF_ORG_ID (convex/constants.ts)

```typescript
export const FAIRLEND_STAFF_ORG_ID = "org_01KKF56VABM4NYFFSR039RTJBM";
```

### Schema: ledger_journal_entries (convex/schema.ts lines 857-898)

```typescript
ledger_journal_entries: defineTable({
    sequenceNumber: v.int64(),
    entryType: v.union(
        v.literal("MORTGAGE_MINTED"),
        v.literal("SHARES_ISSUED"),
        v.literal("SHARES_TRANSFERRED"),
        v.literal("SHARES_REDEEMED"),
        v.literal("MORTGAGE_BURNED"),
        v.literal("SHARES_RESERVED"),
        v.literal("SHARES_COMMITTED"),
        v.literal("SHARES_VOIDED"),
        v.literal("CORRECTION")
    ),
    reservationId: v.optional(v.id("ledger_reservations")),
    mortgageId: v.string(),
    effectiveDate: v.string(),
    timestamp: v.number(),
    debitAccountId: v.id("ledger_accounts"),
    creditAccountId: v.id("ledger_accounts"),
    amount: v.number(),
    idempotencyKey: v.string(),
    causedBy: v.optional(v.id("ledger_journal_entries")),
    source: v.object({
        type: v.union(v.literal("user"), v.literal("system"), v.literal("webhook"), v.literal("cron")),
        actor: v.optional(v.string()),
        channel: v.optional(v.string()),
    }),
    reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
})

### Schema: ledger_accounts (convex/schema.ts lines 837-855)

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
```

## How to Set Up Test Scenarios

For each test, you need to create a mint + issue flow to get accounts and journal entries to reference:

1. **Mint a mortgage:** Call `api.ledger.mutations.mintMortgage` with `{ mortgageId: "mortgage-test-1", effectiveDate: "2026-01-01", idempotencyKey: "mint-1", source: { type: "system", channel: "test" } }` — this creates WORLD + TREASURY accounts and a MORTGAGE_MINTED journal entry.

2. **Issue shares:** Call `api.ledger.mutations.issueShares` with `{ mortgageId: "mortgage-test-1", lenderId: "lender-1", amount: 3000, effectiveDate: "2026-01-01", idempotencyKey: "issue-1", source: { type: "system", channel: "test" } }` — this creates a POSITION account and a SHARES_ISSUED journal entry.

3. **Post correction:** Call `api.ledger.mutations.postCorrection` with the CORRECTION args including `causedBy` pointing to the journal entry from step 2.

**Key:** The `mintMortgage` returns `{ treasuryAccountId, journalEntry }`. The `issueShares` returns `{ positionAccountId, journalEntry }`. Use these return values to get account IDs and journal entry IDs for the correction call.

**Convention (D-7):** debitAccountId = account RECEIVING units, creditAccountId = account GIVING units.
So to reverse a SHARES_ISSUED (which debited POSITION, credited TREASURY):
- Correction debitAccountId = TREASURY (receiving units back)
- Correction creditAccountId = POSITION (giving units back)

## Key Design Decisions

1. **Uses `adminMutation` (not `ledgerMutation`)** — corrections are admin-only per AC
2. **Validates `causedBy` exists** — postEntry doesn't check this; it's the convenience layer's value-add
3. **Validates `reason` is non-empty** — trims whitespace, throws clear error
4. **Idempotency at convenience layer** — fast short-circuit before expensive DB lookups
5. **Does NOT auto-reverse** — caller specifies debit/credit direction explicitly

## Important: Non-Admin Identity for Auth Test

For T-PC-12 (auth gate test), use an identity WITHOUT admin role:
```typescript
const NON_ADMIN_IDENTITY = {
    subject: "test-non-admin",
    issuer: "https://api.workos.com",
    org_id: FAIRLEND_STAFF_ORG_ID,
    organization_name: "FairLend Staff",
    role: "member",
    roles: JSON.stringify(["member"]),
    permissions: JSON.stringify(["ledger:view"]),
    user_email: "member@fairlend.ca",
    user_first_name: "Member",
    user_last_name: "User",
};
```

The `adminMutation` middleware will reject this identity before the handler runs. The error may not be a ConvexError — it could be a plain Error from the auth middleware. Test for any thrown error, not specifically ConvexError code.
