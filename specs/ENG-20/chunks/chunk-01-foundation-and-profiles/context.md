# Chunk 1 Context: Foundation, Audit Support & Profile Seeds

Source: Linear ENG-20, Notion implementation plan, SPEC 1.2, ENG-18, ENG-12, ENG-13, and current repo inspection.

## Goal

Lay down the shared seed infrastructure and implement the non-governed profile seeds first so later governed-entity seeds can compose them without duplicating journal, idempotency, or fixture logic.

## Implementation Plan Excerpt

```md
## 4. Architecture & Design

### File Map

| File | Action | Purpose |
|------|--------|--------|
| `convex/seed/seedHelpers.ts` | Create | Shared helpers: synthetic journal entry writer, idempotency checker, source constant |
| `convex/seed/seedBroker.ts` | Create | Seed broker user + broker profile |
| `convex/seed/seedBorrower.ts` | Create | Seed borrower user + borrower profile |
| `convex/seed/seedLender.ts` | Create | Seed lender user + lender profile |
| `convex/seed/seedMortgage.ts` | Create | Seed property + mortgage + mortgageBorrower join |
| `convex/seed/seedObligation.ts` | Create | Seed obligations in mixed states with synthetic journal trails |
| `convex/seed/seedOnboardingRequest.ts` | Create | Seed onboarding requests in 3 different states |
| `convex/seed/seedAll.ts` | Create | Orchestrator action — calls seeds in dependency order |

### Key Design Decisions

1. **Direct insert, not transition engine**: Seed mutations use `ctx.db.insert()` directly to create entities in desired states, bypassing the transition engine. Synthetic journal entries simulate the transition history. This is intentional — seed mutations are admin shortcuts, not production flows.

2. **Synthetic journal entries via `appendAuditJournalEntry()`**: All synthetic journal entries MUST go through `appendAuditJournalEntry()` to maintain Layer 2 hash-chain integrity. Critical for ENG-23 reconciliation.

3. **Idempotency via natural keys**: Each seed checks for existing records before inserting. Natural keys:
   - Brokers: `licenseId`
   - Borrowers: user email
   - Lenders: user email
   - Mortgages: property address (`streetAddress` + `postalCode`)
   - Obligations: `mortgageId` + `paymentNumber`
   - Onboarding requests: `userId` + `requestedRole`

4. **adminMutation gating**: All individual seed mutations use `adminMutation` from `convex/fluent.ts`, which chains `authMiddleware` + `requireFairLendAdmin`.

6. **Source constant**: All seed audit entries use `{ channel: "admin_dashboard", actorType: "system", actorId: "seed" }` as the source.
```

```md
### Step 1: Create shared seed helpers
- **File(s):** `convex/seed/seedHelpers.ts`
- **Action:** Create file
- **Details:**
  - Export `SEED_SOURCE: CommandSource` constant
  - Export `writeSyntheticJournalTrail(ctx, entityType, entityId, statePath, eventMap, source)` — iterates through state path pairs, calling `appendAuditJournalEntry()` for each transition with sequential timestamps
  - Export `writeCreationJournalEntry(ctx, entityType, entityId, initialState, source)` — writes the initial creation entry
  - Import `appendAuditJournalEntry` from `../engine/auditJournal`
  - Import `getMachineVersion` from `../engine/machines/registry` (for governed entities only)
  - Import types from `../engine/types`

### Step 2: Implement seedBroker
- **File(s):** `convex/seed/seedBroker.ts`
- **Details:**
  - `adminMutation` that creates 2 brokers
  - For each broker: create `users` record, then `brokers` record
  - Idempotency: check `brokers` table by `licenseId` index before inserting
  - Realistic data: FSRA license numbers (e.g. "M08001234"), Ontario province
  - Broker 1: FairLend staff broker with brokerageName "FairLend Capital"
  - Broker 2: External brokerage broker with different org
  - Each gets creation journal entry via `writeCreationJournalEntry`

### Step 3: Implement seedBorrower
- **File(s):** `convex/seed/seedBorrower.ts`
- **Details:**
  - `adminMutation` that creates 5 borrowers
  - For each: create `users` record, then `borrowers` record
  - Idempotency: check `users` table by email before inserting
  - Realistic Canadian names, Ontario addresses
  - Varied profiles: different financial profiles, IDV statuses
  - Each gets creation journal entry

### Step 4: Implement seedLender
- **File(s):** `convex/seed/seedLender.ts`
- **Details:**
  - `adminMutation` that creates 3 lenders
  - Requires `brokerId` argument (from seedBroker output)
  - For each: create `users` record, then `lenders` record
  - Idempotency: check `users` table by email
  - Lender 1: Individual accredited lender
  - Lender 2: Institutional lender
  - Lender 3: MIC (Mortgage Investment Corporation)
  - Varied `accreditationStatus`, `kycStatus`, `onboardingEntryPath`
  - Each gets creation journal entry
```

## Current Repo Facts

```ts
// convex/schema.ts
brokers: defineTable({
  status: v.string(),
  lastTransitionAt: v.optional(v.number()),
  userId: v.id("users"),
  licenseId: v.optional(v.string()),
  licenseProvince: v.optional(v.string()),
  brokerageName: v.optional(v.string()),
  orgId: v.optional(v.string()),
  onboardedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_license", ["licenseId"])
  .index("by_status", ["status"]),

borrowers: defineTable({
  status: v.string(),
  lastTransitionAt: v.optional(v.number()),
  userId: v.id("users"),
  financialProfile: v.optional(v.any()),
  idvStatus: v.optional(v.string()),
  personaInquiryId: v.optional(v.string()),
  onboardedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_status", ["status"]),

lenders: defineTable({
  userId: v.id("users"),
  brokerId: v.id("brokers"),
  accreditationStatus: v.union(
    v.literal("pending"),
    v.literal("accredited"),
    v.literal("exempt"),
    v.literal("rejected")
  ),
  idvStatus: v.optional(v.string()),
  kycStatus: v.optional(v.string()),
  personaInquiryId: v.optional(v.string()),
  onboardingEntryPath: v.string(),
  onboardingId: v.optional(v.id("onboardingRequests")),
  status: v.string(),
  activatedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_broker", ["brokerId"])
  .index("by_status", ["status"]),
```

```ts
// convex/engine/types.ts
export type EntityType =
  | "onboardingRequest"
  | "mortgage"
  | "obligation"
  | "deal"
  | "provisionalApplication"
  | "applicationPackage"
  | "broker"
  | "borrower"
  | "lenderOnboarding"
  | "provisionalOffer"
  | "offerCondition"
  | "lenderRenewalIntent";
```

```ts
// convex/engine/validators.ts
export const entityTypeValidator = v.union(
  v.literal("onboardingRequest"),
  v.literal("mortgage"),
  v.literal("obligation"),
  v.literal("deal"),
  v.literal("provisionalApplication"),
  v.literal("applicationPackage"),
  v.literal("broker"),
  v.literal("borrower"),
  v.literal("lenderOnboarding"),
  v.literal("provisionalOffer"),
  v.literal("offerCondition"),
  v.literal("lenderRenewalIntent")
);
```

## Drift To Honor During Implementation

- The Notion plan says `seedLender.ts`; that matches the current repo. Do not reintroduce deprecated `seedInvestor.ts` naming.
- Current schema uses `users._id` document references, not WorkOS auth IDs, for `userId` fields.
- `borrowers` do **not** currently have a `brokerId` field, so borrower seeding must not invent one. The broker relationship is expressed later through mortgages and `mortgageBorrowers`.
- `brokers.orgId` is optional and stringly typed. If org rows are seeded, treat them as supporting data for realism and referential consistency rather than hard schema requirements.
- `EntityType` / `entityTypeValidator` currently omit `"lender"`. Without fixing that, lender creation journal entries either fail validation or force unsafe casts.

## Integration Points

- `appendAuditJournalEntry(ctx, entry)` in `convex/engine/auditJournal.ts` is the required Layer 1 + Layer 2 write path.
- `getMachineVersion(entityType)` in `convex/engine/machines/registry.ts` should be used only for governed entities (`onboardingRequest`, `mortgage`, `obligation`).
- `adminMutation` already exists in `convex/fluent.ts` and should gate the individual seed mutations.
- Existing test helpers in `src/test/auth/helpers.ts` and `src/test/convex/onboarding/helpers.ts` show the canonical `users` seed shape and audit journal query patterns.

## Constraints & Rules

```md
- **No `any` types**: Per CLAUDE.md, avoid `any`. Use proper types for all seed data objects. Exception: `machineContext` is typed as `v.optional(v.any())` in schema — this is intentional.
- **Run `bun check` BEFORE manually fixing lint errors**.
- **Seed ordering enforced**: broker → borrower → lender → mortgage → obligation → onboardingRequest. Not parallelizable.
- **All monetary values in cents**.
```
