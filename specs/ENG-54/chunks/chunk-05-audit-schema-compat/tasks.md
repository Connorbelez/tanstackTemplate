# Chunk 5: Audit, Schema, Structure, Backward Compatibility

- [ ] T-014: DoD #11 — Read audit journal and hash chain, verify:
  - `appendAuditJournalEntry()` writes: entityType, entityId, eventType, previousState, newState, outcome, actorId, channel, machineVersion, timestamp
  - Both transitions AND rejections journaled
  - Compound states stored as dot-notation strings (e.g., "lawyerOnboarding.verified")
  - Layer 2 hash-chain fires via `startHashChain()` after every journal write
  - `machineVersion` format is `"deal@1.0.0"`

- [ ] T-015: DoD #12 — Read `convex/schema.ts`, verify deals section matches SPEC section 6:
  - `deals` table fields: status (v.string), machineContext (v.optional(v.any)), lastTransitionAt (v.optional(v.number)), mortgageId (v.id), buyerId (v.string), sellerId (v.string), fractionalShare (v.number), closingDate (v.optional(v.number)), lawyerId (v.optional(v.string)), lawyerType (v.optional(v.union)), createdAt (v.number), createdBy (v.string)
  - `deals` indexes: by_status, by_mortgage, by_buyer, by_seller
  - `dealAccess` table fields: userId, dealId, role (4-way union), grantedAt, grantedBy, revokedAt (optional), status (active|revoked)
  - `dealAccess` indexes: by_user_and_deal, by_deal, by_user
  - Accepted divergence: `reservationId` as top-level field

- [ ] T-016: DoD #13 — Verify all key files exist:
  - convex/engine/machines/deal.machine.ts
  - convex/engine/machines/registry.ts (deal registered)
  - convex/engine/effects/dealClosing.ts
  - convex/engine/effects/dealClosingProrate.ts
  - convex/engine/effects/dealClosingPayments.ts
  - convex/engine/effects/dealAccess.ts
  - convex/engine/effects/dealClosingEffects.ts (stubs)
  - convex/engine/effects/registry.ts (all 13 effects)
  - convex/deals/queries.ts
  - convex/deals/mutations.ts
  - convex/deals/accessCheck.ts
  - src/components/admin/kanban-deals.tsx
  - src/components/admin/deal-card.tsx
  - src/hooks/useDealActions.ts
  - src/routes/admin/deals/route.tsx

- [ ] T-017: DoD #14 — Grep for `ctx.db.patch.*status` across entire `convex/`:
  - Exclude: engine/transition.ts, __tests__/
  - Verify: no governed-entity status patches
  - Documented exception: dealAccess revokeAccess patches `status: "revoked"` (dealAccess is NOT a governed entity, so this is allowed)
  - Documented exception: `setReservationId` patches `reservationId` (NOT `status`)

- [ ] T-018: DoD #15 — Read flat-state machines, verify backward compatibility:
  - convex/engine/machines/mortgage.machine.ts — flat string states only
  - convex/engine/machines/obligation.machine.ts — flat string states only
  - convex/engine/machines/onboardingRequest.machine.ts — flat string states only
  - serializeState/deserializeState backward-compatible with flat strings
  - Run: `bun run test convex/engine` — all tests pass
