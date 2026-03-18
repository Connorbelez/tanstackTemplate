# Chunk 01: Scaffold + Happy Path + Cancellation

## Tasks

### T-001: Create test file scaffold
**File:** `convex/machines/__tests__/deal.integration.test.ts` (CREATE)

Create the test file with:
- `convex-test` and `vitest` imports
- `import.meta.glob("/convex/**/*.ts")` for modules
- `internal` import from `../../_generated/api`
- `Id` type from `../../_generated/dataModel`
- `schema` import from `../../schema`
- Identity fixtures matching existing patterns (ADMIN_IDENTITY with WorkOS JWT fields)
- ADMIN_SOURCE fixture with `channel: "admin_dashboard"`, `actorId`, `actorType: "admin"`
- `TestHarness` type alias: `type TestHarness = ReturnType<typeof convexTest>`

### T-002: Implement seedDeal helper
Create a reusable `seedDeal(t, overrides?)` function that:
1. Inserts prerequisite `users` record
2. Inserts prerequisite `properties` record
3. Inserts prerequisite `brokers` record
4. Inserts prerequisite `mortgages` record (with all required fields matching existing seed pattern)
5. Inserts `deals` record with proper defaults and override support
6. Returns `{ dealId, mortgageId }` (typed with `Id<"deals">` and `Id<"mortgages">`)

Follow the EXACT seed pattern from `convex/deals/__tests__/dealClosing.test.ts`:
- users: `{ authId, email, firstName, lastName }`
- properties: `{ streetAddress, city, province, postalCode, propertyType, createdAt }`
- brokers: `{ status: "active", userId, createdAt }`
- mortgages: `{ status: "funded", propertyId, principal: 500_000, interestRate: 0.05, rateType: "fixed", termMonths: 60, amortizationMonths: 300, paymentAmount: 2908, paymentFrequency: "monthly", loanType: "conventional", lienPosition: 1, interestAdjustmentDate: "2026-01-01", termStartDate: "2026-01-01", maturityDate: "2031-01-01", firstPaymentDate: "2026-02-01", brokerOfRecordId, createdAt }`
- deals: default status "initiated", all required fields

### T-003: Implement happy path individual transition tests
`describe("Deal Integration — Happy Path (UC-DC-01)")` with individual tests for each transition:

1. `initiated → DEAL_LOCKED → lawyerOnboarding.pending`
   - Effects: ["reserveShares", "notifyAllParties", "createDocumentPackage"]
2. `lawyerOnboarding.pending → LAWYER_VERIFIED → lawyerOnboarding.verified`
   - Effects: ["createDealAccess"]
3. `lawyerOnboarding.verified → REPRESENTATION_CONFIRMED → documentReview.pending`
   - This is an auto-transition via onDone (lawyerOnboarding.complete → documentReview)
   - The REPRESENTATION_CONFIRMED handler has NO actions, so effectsScheduled should be []
4. `documentReview.pending → LAWYER_APPROVED_DOCUMENTS → documentReview.signed`
   - No effects on this transition
5. `documentReview.signed → ALL_PARTIES_SIGNED → fundsTransfer.pending`
   - This is auto-transition via onDone (documentReview.complete → fundsTransfer)
   - Effects on ALL_PARTIES_SIGNED: ["archiveSignedDocuments"]
6. `fundsTransfer.pending → FUNDS_RECEIVED → confirmed`
   - This is auto-transition via onDone (fundsTransfer.complete → confirmed)
   - Effects on FUNDS_RECEIVED event handler: ["confirmFundsReceipt"]
   - Effects on fundsTransfer.onDone: ["commitReservation", "prorateAccrualBetweenOwners", "updatePaymentSchedule", "revokeLawyerAccess"]
   - IMPORTANT: The `extractScheduledEffects` function in transition.ts only looks at event handlers, not onDone handlers. The onDone effects may NOT appear in effectsScheduled. Test what actually happens and adjust expectations.

**Transition call pattern:**
```typescript
const result = await t.mutation(
  internal.engine.transitionMutation.transitionMutation,
  {
    entityType: "deal",
    entityId: dealId,
    eventType: "DEAL_LOCKED",
    payload: { closingDate: Date.now() + 14 * 86400000 },
    source: ADMIN_SOURCE,
  }
);
```

### T-004: Implement full happy path end-to-end test
Single test that drives all 6 transitions sequentially, verifying:
- Each `result.success === true`
- Each `result.newState` matches expected compound state
- Each `result.effectsScheduled` contains expected effects
- After all transitions, deal status in DB is "confirmed"

### T-005: Implement audit journal causal chain test
After running full happy path:
1. Query `auditJournal` table with `by_entity` index: `q.eq("entityType", "deal").eq("entityId", dealId)`
2. Verify journal has entries for every transition (6 entries)
3. Verify all entries have `outcome === "transitioned"`
4. Verify causal chain: `journal[i].newState === journal[i+1].previousState` for all i
5. Verify `journal[0].previousState === "initiated"` and `journal[last].newState === "confirmed"`

### T-006: Implement cancellation tests
`describe("Deal Integration — Cancellation (UC-DC-02)")` with tests:

1. Cancel from `initiated` → `failed`
   - Seed deal in "initiated", fire DEAL_CANCELLED
   - Effects: ["voidReservation", "notifyCancellation", "revokeAllDealAccess"]

2. Cancel from `lawyerOnboarding.pending` → `failed`
   - Seed deal in "initiated", advance with DEAL_LOCKED, then fire DEAL_CANCELLED
   - Effects: ["voidReservation", "notifyCancellation", "revokeAllDealAccess"]

3. Cancel from `documentReview.signed` → `failed`
   - Advance deal through: DEAL_LOCKED → LAWYER_VERIFIED → REPRESENTATION_CONFIRMED → LAWYER_APPROVED_DOCUMENTS
   - Then fire DEAL_CANCELLED
   - Effects: ["voidReservation", "notifyCancellation", "revokeAllDealAccess"]

4. Cancel from `fundsTransfer.pending` → `failed`
   - Advance deal through all steps to fundsTransfer.pending
   - Then fire DEAL_CANCELLED
   - Effects: ["voidReservation", "notifyCancellation", "revokeAllDealAccess"]
