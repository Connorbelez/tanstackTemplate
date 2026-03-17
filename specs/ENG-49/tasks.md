# ENG-49: reserveShares + voidReservation Effects

## Implementation Tasks

- [ ] T-001 Add `getInternalDeal` internalQuery to convex/deals/queries.ts for effects to load deal data
- [ ] T-002 Create `setReservationId` internalMutation in convex/engine/effects/dealClosing.ts helper
- [ ] T-003 Implement `reserveShares` effect (internalAction) in convex/engine/effects/dealClosing.ts
- [ ] T-004 Implement `voidReservation` effect (internalAction) in convex/engine/effects/dealClosing.ts
- [ ] T-005 Update Effect Registry in convex/engine/effects/registry.ts to point to real handlers
- [ ] T-006 Write unit tests in convex/deals/__tests__/effects.test.ts
- [ ] T-007 Run verification: bunx convex codegen && bun check && bun typecheck

## Context

### Acceptance Criteria (from Linear)
- `reserveShares` effect calls ledger `reserveShares()` with correct args (mortgageId, sellerLenderId, buyerLenderId, amount, dealId)
- `reserveShares` uses idempotencyKey `deal:${dealId}:reserve` — re-execution returns existing reservation
- `reserveShares` stores returned reservationId in deal's machineContext via `setReservationId` helper
- `reserveShares` handles ledger rejection gracefully (logs error, doesn't throw — deal remains in lawyerOnboarding.pending)
- `voidReservation` effect calls ledger `voidReservation()` with machineContext.reservationId
- `voidReservation` handles missing reservationId (deal cancelled before lock) — exits cleanly
- `voidReservation` uses idempotencyKey `deal:${dealId}:void`
- Both effects registered in Effect Registry
- Tests in `deals/__tests__/effects.test.ts`

### Drift Report Summary
1. Ledger APIs exist and are ready (reserveShares at ledger/mutations.ts:519, voidReservation at :684)
2. DealMachineContext has reservationId field
3. AC uses `sellerInvestorId`/`buyerInvestorId` but ledger uses `sellerLenderId`/`buyerLenderId` — use ledger field names
4. Effects must be `internalAction` (not mutation) to call both ctx.runQuery and ctx.runMutation
5. Missing `getInternalDeal` query — needs to be created
6. Tests file doesn't exist yet — create as part of this ticket

### Integration Points
- **Upstream (ENG-46, DONE)**: Effect registry, effectPayloadValidator, deal machine with action markers
- **Ledger APIs**: reserveShares() and voidReservation() already implemented
- **Downstream (ENG-50)**: Will consume reservationId from machineContext

### Constraints
- From CLAUDE.md: No `any` types unless absolutely necessary
- From CLAUDE.md: `bun check`, `bun typecheck`, `bunx convex codegen` must all pass
- From SPEC 1.4 Section 5.1: reserveShares handles ledger rejection gracefully (logs, doesn't throw)
- From UC-DC-08: If seller has insufficient balance, reserveShares fails silently. Deal stays in lawyerOnboarding.pending without reservationId
- From SPEC 1.4 Section 5.3: voidReservation with no reservationId exits cleanly

### File Map
| File | Action | Description |
|------|--------|-------------|
| `convex/deals/queries.ts` | MODIFY | Add `getInternalDeal` internalQuery |
| `convex/engine/effects/dealClosing.ts` | CREATE | reserveShares + voidReservation effects + setReservationId helper |
| `convex/engine/effects/registry.ts` | MODIFY | Re-point to real handlers |
| `convex/deals/__tests__/effects.test.ts` | CREATE | Effect unit tests |
