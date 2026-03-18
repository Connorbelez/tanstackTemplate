# Chunk 2: Machine Definition & State Verification

- [ ] T-004: DoD #1 — Read `convex/engine/machines/deal.machine.ts`, verify:
  - Exports `DEAL_MACHINE_VERSION = "1.0.0"`
  - Pure data: zero imports from Convex, zero I/O, zero database references
  - States: `initiated`, `lawyerOnboarding` (pending, verified, complete), `documentReview` (pending, signed, complete), `fundsTransfer` (pending, complete), `confirmed`, `failed` — total 11 states
  - Events: `DEAL_LOCKED`, `LAWYER_VERIFIED`, `REPRESENTATION_CONFIRMED`, `LAWYER_APPROVED_DOCUMENTS`, `ALL_PARTIES_SIGNED`, `FUNDS_RECEIVED`, `DEAL_CANCELLED` — total 7 events
  - `DEAL_CANCELLED` at root level targeting `.failed`
  - Each phase uses `type: "final"` on last sub-state with `onDone` transitioning to next phase
  - Effect names in actions match the Effect Registry keys exactly

- [ ] T-005: DoD #2 — Read `convex/engine/machines/__tests__/deal.machine.test.ts`, verify all 77 state × event cases (11 states × 7 events). If gaps, write missing tests in-place. Run tests.

- [ ] T-006: DoD #3 — Read `convex/engine/serialization.ts`, verify serialize/deserialize round-trips for all 11 states. Check if dedicated serialization tests exist. Verify XState rehydration correctness.
