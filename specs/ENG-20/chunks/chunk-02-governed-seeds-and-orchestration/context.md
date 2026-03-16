# Chunk 2 Context: Governed Entity Seeds, Orchestration & Verification

Source: Linear ENG-20, Notion implementation plan, SPEC 1.2, ENG-12, ENG-13, and current repo inspection.

## Goal

Seed the governed entities and the orchestrator in a way that preserves GT audit invariants: final `status` must match the latest successful journal entry, reruns must not duplicate data, and the full dataset must be produced in dependency order.

## Implementation Plan Excerpt

```md
### Step 5: Implement seedMortgage
- `adminMutation` that creates 5 mortgages
- For each mortgage:
  1. Create `properties` record (Ontario address, varied property types: residential, condo, multi_unit)
  2. Create `mortgages` record in `active` status with `machineContext: { missedPayments: 0, lastPaymentAt: 0 }`
  3. Create `mortgageBorrowers` join record
- Requires `borrowerIds` and `brokerIds` arguments
- Idempotency: check `properties` by `streetAddress` + `postalCode`
- Varied terms: different rates (6.5%-12%), terms (12-36 months), payment amounts, property types
- Canadian mortgage terms: IAD, first payment date, maturity date
- Each gets creation journal entry (mortgage is governed — use `getMachineVersion`)

### Step 6: Implement seedObligation
- `adminMutation` that creates 15-20 obligations across the 5 mortgages (3-4 per mortgage)
- Requires `mortgageIds` and mortgage-to-borrower mapping
- Mixed states:
  - Some `upcoming` (future due dates) — initial state, only creation journal entry
  - Some `due` (past due date, within grace period) — synthetic trail: `upcoming → due` via `DUE_DATE_REACHED`
  - Some `overdue` (past grace period) — synthetic trail: `upcoming → due → overdue` via `DUE_DATE_REACHED`, `GRACE_PERIOD_EXPIRED`
  - Some `settled` (paid) — synthetic trail: `upcoming → due → settled` via `DUE_DATE_REACHED`, `PAYMENT_APPLIED`
- Idempotency: check by `mortgageId` + `paymentNumber` index
- Settled obligations: populate `settledAmount`, `settledDate`, `settledAt`
- Each obligation gets synthetic journal trail via `writeSyntheticJournalTrail`

### Step 7: Implement seedOnboardingRequest
- `adminMutation` that creates 3 onboarding requests
- For each: create `users` record first, then `onboardingRequests` record
- Request 1: `pending_review` — only creation journal entry
- Request 2: `approved` — synthetic trail: `pending_review → approved` via `APPROVE`
- Request 3: `rejected` — synthetic trail: `pending_review → rejected` via `REJECT`, includes `rejectionReason`
- Idempotency: check by `userId` + `requestedRole` + `status`
- Varied `requestedRole`: broker, lender, underwriter
- Approved request: set `reviewedBy`, `reviewedAt`
- Rejected request: set `reviewedBy`, `reviewedAt`, `rejectionReason`

### Step 8: Implement seedAll orchestrator
- `adminAction` (not mutation) that orchestrates `ctx.runMutation()` calls in dependency order
- Order: seedBroker → seedBorrower → seedLender → seedMortgage → seedObligation → seedOnboardingRequest
- Pass IDs from earlier seeds as arguments to later ones
- Non-atomicity is safe because all seed functions are idempotent
- Return summary: counts of each entity created
```

```md
### Acceptance Criteria (verbatim from Linear)
- [ ] `seedAll` orchestrates in correct dependency order
- [ ] Idempotent — running twice does not create duplicates (checks natural keys)
- [ ] Realistic Canadian data: Ontario addresses, FSRA license numbers, Canadian mortgage terms
- [ ] Mortgages seeded as `active` with varied terms (different rates, terms, property types)
- [ ] Obligations in mix of states: upcoming, due, overdue, settled
- [ ] Entities in non-initial states get synthetic audit journal entries tracing full state path
- [ ] Each seeded entity gets a creation audit journal entry with `source: { channel: "admin_dashboard", actorType: "system" }`
- [ ] Onboarding requests: 1 pending_review, 1 approved, 1 rejected
- [ ] `bun check` and `bun typecheck` pass
```

## Current Repo Facts

```ts
// convex/schema.ts
onboardingRequests: defineTable({
  userId: v.id("users"),
  requestedRole: v.union(
    v.literal("broker"),
    v.literal("lender"),
    v.literal("lawyer"),
    v.literal("admin"),
    v.literal("jr_underwriter"),
    v.literal("underwriter"),
    v.literal("sr_underwriter")
  ),
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  activeRoleAssignmentJournalId: v.optional(v.string()),
  processedRoleAssignmentJournalIds: v.optional(v.array(v.string())),
  referralSource: v.union(v.literal("self_signup"), v.literal("broker_invite")),
  invitedByBrokerId: v.optional(v.string()),
  targetOrganizationId: v.optional(v.string()),
  reviewedBy: v.optional(v.string()),
  reviewedAt: v.optional(v.number()),
  rejectionReason: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_status", ["status"])
  .index("by_user_and_status", ["userId", "status"]),

properties: defineTable({
  streetAddress: v.string(),
  unit: v.optional(v.string()),
  city: v.string(),
  province: v.string(),
  postalCode: v.string(),
  propertyType: v.union(
    v.literal("residential"),
    v.literal("commercial"),
    v.literal("multi_unit"),
    v.literal("condo")
  ),
  createdAt: v.number(),
})
  .index("by_pin", ["pin"])
  .index("by_postal_code", ["postalCode"]),

mortgages: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  propertyId: v.id("properties"),
  principal: v.number(),
  interestRate: v.number(),
  rateType: v.union(v.literal("fixed"), v.literal("variable")),
  termMonths: v.number(),
  amortizationMonths: v.number(),
  paymentAmount: v.number(),
  paymentFrequency: v.union(
    v.literal("monthly"),
    v.literal("bi_weekly"),
    v.literal("accelerated_bi_weekly"),
    v.literal("weekly")
  ),
  loanType: v.union(
    v.literal("conventional"),
    v.literal("insured"),
    v.literal("high_ratio")
  ),
  lienPosition: v.number(),
  annualServicingRate: v.optional(v.number()),
  interestAdjustmentDate: v.string(),
  termStartDate: v.string(),
  maturityDate: v.string(),
  firstPaymentDate: v.string(),
  brokerOfRecordId: v.id("brokers"),
  assignedBrokerId: v.optional(v.id("brokers")),
  fundedAt: v.optional(v.number()),
  createdAt: v.number(),
}),

mortgageBorrowers: defineTable({
  mortgageId: v.id("mortgages"),
  borrowerId: v.id("borrowers"),
  role: v.union(
    v.literal("primary"),
    v.literal("co_borrower"),
    v.literal("guarantor")
  ),
  addedAt: v.number(),
}),

obligations: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  mortgageId: v.id("mortgages"),
  borrowerId: v.id("borrowers"),
  paymentNumber: v.number(),
  amount: v.number(),
  principalPortion: v.number(),
  interestPortion: v.number(),
  dueDate: v.string(),
  gracePeriodEndDate: v.string(),
  settledAmount: v.optional(v.number()),
  settledDate: v.optional(v.string()),
  settledAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_mortgage", ["mortgageId"])
  .index("by_mortgage_and_due", ["mortgageId", "dueDate"])
  .index("by_borrower", ["borrowerId"])
  .index("by_status", ["status"]),
```

```ts
// convex/engine/machines/obligation.machine.ts
upcoming -> DUE_DATE_REACHED -> due
due -> GRACE_PERIOD_EXPIRED -> overdue
due -> PAYMENT_APPLIED -> settled
overdue -> PAYMENT_APPLIED -> settled
```

```ts
// convex/engine/machines/onboardingRequest.machine.ts
pending_review -> APPROVE -> approved
pending_review -> REJECT -> rejected
approved -> ASSIGN_ROLE -> role_assigned
```

```ts
// convex/fluent.ts
export const authedAction = convex.action().use(actionAuthMiddleware);
export const adminMutation = convex
  .mutation()
  .use(authMiddleware)
  .use(requireFairLendAdmin);
```

## Drift To Honor During Implementation

- The plan says `seedAll` is an `adminAction`, but the repo currently has no `adminAction` helper. You must either add one safely for action contexts or enforce the FairLend admin check inside `seedAll`.
- `obligations.dueDate` and `gracePeriodEndDate` are strings in the current schema, not numeric timestamps. Seed data and synthetic journal timelines must use valid ISO-style or otherwise consistent string dates there while journal timestamps remain numeric.
- `mortgages` use `brokerOfRecordId` and optional `assignedBrokerId`, not a generic `brokerId`.
- Current property indexes do **not** support a compound street/postal lookup. Idempotency for mortgages may need a filtered lookup rather than an index-backed unique query.
- `onboardingRequests` has no `by_role` index and no direct natural key over `(userId, requestedRole)`, so idempotency likely needs a filtered query over the existing user index.
- The mortgage machine’s initial state is already `active`, so mortgage seeds need creation journal entries, not synthetic transition trails, unless you intentionally seed later mortgage states.

## Integration Points

- `appendAuditJournalEntry` in `convex/engine/auditJournal.ts` must be the only audit write API used by seed helpers.
- `getMachineVersion("mortgage" | "obligation" | "onboardingRequest")` should be included on governed entity journal rows.
- `adminMutation` and any new action-level admin guard must preserve existing WorkOS-derived auth semantics from `convex/fluent.ts`.
- Existing transition tests query `auditJournal` via `by_entity`; new seed tests should use the same pattern to verify latest-state consistency.

## Suggested Test Shape

- Run `seedAll` once and assert the expected number of brokers, borrowers, lenders, mortgages, obligations, and onboarding requests.
- Run `seedAll` a second time and assert counts do not increase.
- For every seeded governed entity, compare `entity.status` to the latest `auditJournal` `newState` where `outcome === "transitioned"`.
- Assert presence of all requested state variants:
  - mortgages: all `active`
  - obligations: `upcoming`, `due`, `overdue`, `settled`
  - onboardingRequests: `pending_review`, `approved`, `rejected`

## Constraints & Rules

```md
- **Convex mutations cannot call other mutations directly.** `seedAll` is an action using `ctx.runMutation()`.
- **Timestamps for synthetic journal entries must be sequential**.
- **Hash-chain integrity maintained**: all entries via `appendAuditJournalEntry()`.
- **Seed ordering enforced**: broker → borrower → lender → mortgage → obligation → onboardingRequest.
- **Run `bun check`, `bun typecheck`, and `bunx convex codegen` before completion**.
```
