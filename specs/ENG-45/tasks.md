# Tasks: ENG-45 — Implement compound state serialization helpers

Source: Linear ENG-45, Notion implementation plan
Generated: 2026-03-17

## Phase 1: Serialization Refactor
- [x] T-001: Replace `convex/engine/serialization.ts` with `serializeState(stateValue)` and `deserializeState(status)` using XState `StateValue`, dot-notation compound serialization, flat-string passthrough, recursive nested support, and a single-region guard for unsupported parallel states.
- [x] T-002: Update `convex/engine/transition.ts` to import and use `serializeState` / `deserializeState` at all hydration and persistence call sites without changing the existing audit and effect scheduling flow.

## Phase 2: Test Realignment
- [x] T-003: Replace `src/test/convex/engine/serialization.test.ts` to cover flat-state passthrough, dot-notation compound serialization/deserialization, unsupported multi-region rejection, round-trip identity for all 11 deal states, and XState rehydration against the real `dealMachine`.

## Phase 3: Verification
- [x] T-004: Run `bun check`.
- [ ] T-005: Run `bun typecheck`.
- [ ] T-006: Run `bunx convex codegen` and the targeted engine tests needed to verify serialization compatibility.
