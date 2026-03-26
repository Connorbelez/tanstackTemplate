# Chunk 02 Context: Backend Queries & Mutations

## T-004: Eligible Dispersal Entries Query

### File: `convex/payments/payout/queries.ts` (NEW)

Get all dispersal entries eligible for payout for a given lender.
Eligible = status is `pending` AND `payoutEligibleAfter` <= today.

**Dispersal entries schema** (`convex/schema.ts:961`):
```typescript
dispersalEntries: defineTable({
    mortgageId: v.id("mortgages"),
    lenderId: v.id("lenders"),
    lenderAccountId: v.id("ledger_accounts"),
    amount: v.number(),
    dispersalDate: v.string(), // YYYY-MM-DD
    obligationId: v.id("obligations"),
    servicingFeeDeducted: v.number(),
    status: dispersalStatusValidator, // "pending" | "eligible" | "disbursed" | "failed"
    idempotencyKey: v.string(),
    calculationDetails: calculationDetailsValidator,
    mortgageFeeId: v.optional(v.id("mortgageFees")),
    feeCode: v.optional(feeCodeValidator),
    payoutEligibleAfter: v.optional(v.string()), // YYYY-MM-DD
    paymentMethod: v.optional(v.string()),
    createdAt: v.number(),
})
    .index("by_lender", ["lenderId", "dispersalDate"])
    .index("by_mortgage", ["mortgageId", "dispersalDate"])
    .index("by_obligation", ["obligationId"])
    .index("by_status", ["status", "lenderId"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_eligibility", ["status", "payoutEligibleAfter"]),
```

**Implementation guidance:**
- Use `internalQuery` (not a fluent builder — this is called from an action, not exposed to clients)
- Use index `by_status` to filter `status === "pending"` + `lenderId`
- Then `.filter()` for `payoutEligibleAfter <= today` or `payoutEligibleAfter === undefined`
- Args: `{ lenderId: v.id("lenders"), today: v.string() }`

## T-005: Lenders With Payable Balance Query

Same file: `convex/payments/payout/queries.ts`

Get all active lenders. The batch action will check frequency/balance for each.

- Use `internalQuery`
- Query `lenders` table with index `by_status` where `status === "active"`
- Return the full lender documents (we need `payoutFrequency`, `lastPayoutDate`, `minimumPayoutCents`)

## T-006: Mark Entries Disbursed Mutation

### File: `convex/payments/payout/mutations.ts` (NEW)

After payout is posted, mark the dispersal entries as `disbursed` (not `paid` — the existing status validator uses `disbursed`).

**CRITICAL**: The `dispersalStatusValidator` allows: `"pending" | "eligible" | "disbursed" | "failed"`. Use `"disbursed"`, NOT `"paid"`.

- Use `internalMutation`
- Args: `{ entryIds: v.array(v.id("dispersalEntries")), payoutDate: v.string() }`
- For each entry: `ctx.db.patch(id, { status: "disbursed" })`

## T-007: Update Lender Payout Date Mutation

Same file: `convex/payments/payout/mutations.ts`

- Use `internalMutation`
- Args: `{ lenderId: v.id("lenders"), payoutDate: v.string() }`
- `ctx.db.patch(lenderId, { lastPayoutDate: payoutDate })`

## T-008: Admin Immediate Payout

### File: `convex/payments/payout/adminPayout.ts` (NEW)

Admin-triggered immediate payout for a specific lender. Bypasses frequency schedule but still respects hold period.

**Fluent middleware pattern** (from `convex/fluent.ts`):
```typescript
export const adminMutation = convex
    .mutation()
    .use(authMiddleware)
    .use(requireFairLendAdmin);
export const adminAction = authedAction.use(requireFairLendAdminAction);
```

**Use `adminAction`** (not `adminMutation`) because this action needs to:
1. Run `getEligibleDispersalEntries` query
2. Aggregate amounts by mortgage
3. Call `postLenderPayout` mutation for each mortgage
4. Call `markEntriesDisbursed` mutation
5. Call `updateLenderPayoutDate` mutation

Actions can call queries + mutations sequentially. Mutations cannot call other mutations.

**Args:**
```typescript
{
    lenderId: v.id("lenders"),
    mortgageId: v.optional(v.id("mortgages")), // optional: scope to specific mortgage
}
```

**Flow:**
1. Get lender record (verify exists + active)
2. Get eligible dispersal entries (past hold period)
3. If `mortgageId` provided, filter to that mortgage only
4. Group entries by `mortgageId`
5. For each mortgage group:
   a. Sum amounts
   b. Check minimum threshold (use lender's `minimumPayoutCents` ?? global `MINIMUM_PAYOUT_CENTS`)
   c. Call `internal.payments.cashLedger.mutations.postLenderPayout` with idempotency key `admin-payout:{today}:{lenderId}:{mortgageId}`
   d. Call `internal.payments.payout.mutations.markEntriesDisbursed`
6. Call `internal.payments.payout.mutations.updateLenderPayoutDate`
7. Return summary: `{ payoutCount, totalAmountCents, lenderId }`

**Key contract — `postLenderPayout`** (`convex/payments/cashLedger/mutations.ts:20`):
```typescript
export const postLenderPayout = internalMutation({
    args: {
        mortgageId: v.id("mortgages"),
        lenderId: v.id("lenders"),
        amount: v.number(),
        effectiveDate: v.string(),
        idempotencyKey: v.string(),
        source: sourceValidator,
        reason: v.optional(v.string()),
        postingGroupId: v.optional(v.string()),
        dispersalEntryId: v.optional(v.id("dispersalEntries")),
        obligationId: v.optional(v.id("obligations")),
    },
    // Posts LENDER_PAYOUT_SENT: Debit LENDER_PAYABLE, Credit TRUST_CASH
    // Non-negative balance enforced by postCashEntryInternal balance check
});
```

**`sourceValidator`** — from `convex/engine/validators.ts`:
```typescript
// Use: { actorType: "admin", actorId: viewer.userId, channel: "dashboard" } for admin
// Use: { actorType: "system", channel: "cron" } for batch
```

## Integration Points Summary

| Dependency | Import Path | Usage |
|---|---|---|
| `postLenderPayout` | `internal.payments.cashLedger.mutations.postLenderPayout` | Post LENDER_PAYOUT_SENT entry |
| `getEligibleDispersalEntries` | `internal.payments.payout.queries.getEligibleDispersalEntries` | Query eligible entries |
| `markEntriesDisbursed` | `internal.payments.payout.mutations.markEntriesDisbursed` | Update dispersal status |
| `updateLenderPayoutDate` | `internal.payments.payout.mutations.updateLenderPayoutDate` | Track last payout |
| `getLendersWithPayableBalance` | `internal.payments.payout.queries.getLendersWithPayableBalance` | List active lenders |
| `MINIMUM_PAYOUT_CENTS` | `./config` | Global threshold |
| `DEFAULT_PAYOUT_FREQUENCY` | `./config` | Fallback frequency |
| `adminAction` | `../../fluent` | Auth middleware chain |
| `sourceValidator` | `../../engine/validators` | Source attribution typing |
