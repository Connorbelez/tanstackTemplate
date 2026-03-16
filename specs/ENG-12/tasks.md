# Tasks: ENG-12 — Implement Transition Engine 8-Step Pipeline

Source: Linear ENG-12, Notion implementation plan
Generated: 2026-03-16

## Phase 1: Serialization Utilities
- [x] T-001: Create `convex/engine/serialization.ts` with `serializeStatus(stateValue)` and `deserializeStatus(status)`.

## Phase 2: Core Engine Rewrite
- [x] T-002: Rewrite `convex/engine/transition.ts` — generic entity loading, ConvexError, serialization, rename to `executeTransition`.
- [x] T-003: Update `convex/engine/transitionMutation.ts` to use `executeTransition`.

## Phase 3: Command Wrappers
- [x] T-004: Create `convex/engine/commands.ts` with `buildSource(viewer, channel)` helper.
- [x] T-005: Typed command wrappers: `transitionOnboardingRequest`, `transitionMortgage`, `transitionObligation`.

## Phase 4: Update Callers
- [x] T-006: Update `convex/onboarding/mutations.ts` to use `executeTransition` + `buildSource`. Removed deprecated `transitionEntity` wrapper.

## Phase 5: Verification
- [x] T-007: `bun check` passes, `bun typecheck` passes, tests pass (29/29 onboarding, 12/13 engine — 1 pre-existing failure).
