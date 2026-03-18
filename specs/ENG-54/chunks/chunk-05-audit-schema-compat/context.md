# Chunk 5 Context: Audit, Schema, Structure, Backward Compatibility

## SPEC Section 6 — Schema

### deals table
```typescript
deals: defineTable({
  // GT fields
  status: v.string(),                    // Dot-notation compound state or flat string
  machineContext: v.optional(v.any()),   // { dealId, reservationId? }
  lastTransitionAt: v.optional(v.number()),

  // Domain fields
  mortgageId: v.id("mortgages"),
  buyerId: v.string(),                   // WorkOS user ID
  sellerId: v.string(),                  // WorkOS user ID
  fractionalShare: v.number(),           // 1-10000
  closingDate: v.optional(v.number()),   // Set on DEAL_LOCKED
  reservationId: v.optional(v.id("ledger_reservations")),  // Accepted divergence: top-level, not in machineContext
  lawyerId: v.optional(v.string()),
  lawyerType: v.optional(v.union(v.literal("platform_lawyer"), v.literal("guest_lawyer"))),
  createdAt: v.number(),
  createdBy: v.string(),
})
  .index("by_status", ["status"])
  .index("by_mortgage", ["mortgageId"])
  .index("by_buyer", ["buyerId"])
  .index("by_seller", ["sellerId"]),
```

### dealAccess table
```typescript
dealAccess: defineTable({
  userId: v.string(),
  dealId: v.id("deals"),
  role: v.union(
    v.literal("platform_lawyer"),
    v.literal("guest_lawyer"),
    v.literal("lender"),
    v.literal("borrower")
  ),
  grantedAt: v.number(),
  grantedBy: v.string(),
  revokedAt: v.optional(v.number()),
  status: v.union(v.literal("active"), v.literal("revoked")),
})
  .index("by_user_and_deal", ["userId", "dealId"])
  .index("by_deal", ["dealId"])
  .index("by_user", ["userId"]),
```

### Accepted Divergence: reservationId
- SPEC section 3.2 says `machineContext: { dealId, reservationId? }`
- Code stores `reservationId` as a TOP-LEVEL field on the `deals` table
- This is better for queryability and already referenced by integration tests

## Audit Journal Fields (SPEC Section 4.4)
Every audit journal entry must have:
- `entityType` — "deal"
- `entityId` — the deal's Convex document ID
- `eventType` — e.g., "DEAL_LOCKED", "DEAL_CANCELLED"
- `previousState` — dot-notation string (e.g., "lawyerOnboarding.pending")
- `newState` — dot-notation string (e.g., "lawyerOnboarding.verified")
- `outcome` — "transitioned" or "rejected"
- `actorId` — who fired the command
- `channel` — "admin_dashboard"
- `machineVersion` — format: "deal@1.0.0"
- `timestamp`

Layer 2 hash-chain must fire after every journal write via `startHashChain()`.

## File Structure (SPEC Section 2 — with accepted divergence)
SPEC says files under `convex/machines/` and `convex/effects/`. Code puts them under `convex/engine/machines/` and `convex/engine/effects/`. This is an accepted architectural divergence — the `engine/` directory groups all GT infrastructure.

### Expected 13 Effects in Registry
1. reserveShares
2. commitReservation
3. voidReservation
4. prorateAccrualBetweenOwners
5. updatePaymentSchedule
6. createDealAccess
7. revokeAllDealAccess
8. revokeLawyerAccess
9. notifyAllParties
10. notifyCancellation
11. createDocumentPackage
12. archiveSignedDocuments
13. confirmFundsReceipt

## Backward Compatibility
Flat-state machines (mortgage, obligation, onboardingRequest) use simple string states. The serialization helpers must handle both:
- Flat: `serializeState("active")` → `"active"`, `deserializeState("active")` → `"active"`
- Compound: `serializeState({ lawyerOnboarding: "verified" })` → `"lawyerOnboarding.verified"`

No changes should have been made to the flat-state machine definitions as part of WS4.

## DoD #14 — Status Patch Grep
The grep should cover ALL `.ts` files in `convex/` (not just `convex/engine/`). Looking for any `ctx.db.patch` that includes a `status` field modification outside the Transition Engine.

Documented exceptions:
- `dealAccess` table patches `status: "revoked"` — this table is NOT governed by GT
- `setReservationId` mutation patches `reservationId` — NOT a `status` field
