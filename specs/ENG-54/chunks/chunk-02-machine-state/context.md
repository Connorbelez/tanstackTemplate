# Chunk 2 Context: Machine Definition & State Verification

## SPEC Section 3.1 — Machine Shape (Canonical Reference)

The deal machine uses XState v5's nested compound states. Each phase is a compound state with internal sub-states.

### Expected States (11 total):
1. `initiated` (flat)
2. `lawyerOnboarding.pending`
3. `lawyerOnboarding.verified`
4. `lawyerOnboarding.complete` (type: "final")
5. `documentReview.pending`
6. `documentReview.signed`
7. `documentReview.complete` (type: "final")
8. `fundsTransfer.pending`
9. `fundsTransfer.complete` (type: "final")
10. `confirmed` (type: "final")
11. `failed` (type: "final")

### Expected Events (7 total):
1. `DEAL_LOCKED` — initiated → lawyerOnboarding, effects: [reserveShares, notifyAllParties, createDocumentPackage]
2. `LAWYER_VERIFIED` — lawyerOnboarding.pending → verified, effects: [createDealAccess]
3. `REPRESENTATION_CONFIRMED` — lawyerOnboarding.verified → complete
4. `LAWYER_APPROVED_DOCUMENTS` — documentReview.pending → signed
5. `ALL_PARTIES_SIGNED` — documentReview.signed → complete, effects: [archiveSignedDocuments]
6. `FUNDS_RECEIVED` — fundsTransfer.pending → complete, effects: [confirmFundsReceipt]
7. `DEAL_CANCELLED` — any non-terminal → failed (root level), effects: [voidReservation, notifyCancellation, revokeAllDealAccess]

### onDone transitions:
- lawyerOnboarding.complete (final) → onDone → documentReview
- documentReview.complete (final) → onDone → fundsTransfer
- fundsTransfer.complete (final) → onDone → confirmed, effects: [commitReservation, prorateAccrualBetweenOwners, updatePaymentSchedule]

### Accepted Drift: revokeLawyerAccess
The SPEC lists 3 confirmation effects. Code adds `revokeLawyerAccess` as a 4th on `fundsTransfer.onDone`. This is correct behavior.

## SPEC Section 4 — Compound State Serialization

### serializeState:
- `"initiated"` → `"initiated"` (flat string passthrough)
- `{ lawyerOnboarding: "verified" }` → `"lawyerOnboarding.verified"` (dot notation)

### deserializeState:
- `"initiated"` → `"initiated"` (no dot = flat string)
- `"lawyerOnboarding.verified"` → `{ lawyerOnboarding: "verified" }` (split on dot, build nested object)

### Round-trip requirement:
All 11 states must serialize → persist → deserialize → rehydrate correctly. XState rehydration via `resolveState({ value: deserialize(status), context })` must produce a valid state.

## State × Event Matrix (77 Cases)

For each (state, event) pair:
- **Valid transition** → assert exact target state and declared actions
- **Invalid transition** → assert state unchanged (no transition)
- **Terminal states** (`confirmed`, `failed`) → reject ALL events
- **`DEAL_CANCELLED`** → transitions from every non-terminal state to `failed`

Expected valid transitions (counting): ~15 valid + ~62 invalid = 77 total

## Key Files
- `convex/engine/machines/deal.machine.ts` — machine definition
- `convex/engine/machines/__tests__/deal.machine.test.ts` — state × event matrix tests
- `convex/engine/serialization.ts` — serialize/deserialize helpers
