# ENG-14: Implement Effect Registry and Effect Dispatch Pattern

## Master Task List

### Chunk 1: Types, Effects & Registry
- [x] T-001: Add `EffectPayload` interface to `convex/engine/types.ts`
- [x] T-002: Add `effectPayloadValidator` to `convex/engine/validators.ts`
- [x] T-003: Update onboarding machine action names to match spec (`notifyApplicantApproved`, `notifyApplicantRejected`, `assignRole`)
- [x] T-004: Rename existing `assignRoleToUser` effect to `assignRole` and update args to use `effectPayloadValidator`
- [x] T-005: Add notification stub effects (`notifyApplicantApproved`, `notifyApplicantRejected`, `notifyAdminNewRequest`) to `convex/engine/effects/onboarding.ts`
- [x] T-006: Create `convex/engine/effects/obligation.ts` with stub effects (`emitObligationOverdue`, `emitObligationSettled`)
- [x] T-007: Widen registry type to `"mutation" | "action"` and add all effect entries to `convex/engine/effects/registry.ts`

### Chunk 2: Engine Integration & Quality Gate
- [x] T-008: Add `console.warn` for missing effects in `scheduleEffects` in `convex/engine/transition.ts`
- [x] T-009: Update `scheduleEffects` to pass full `EffectPayload` (add entityType, eventType, source params)
- [x] T-010: Update onboarding machine test to reflect renamed actions (no changes needed — tests already use new names)
- [x] T-011: Run `bun check`, `bun typecheck`, `bunx convex codegen` — all passing
