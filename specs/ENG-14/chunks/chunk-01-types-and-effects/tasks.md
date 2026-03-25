# Chunk 1: Types, Effects & Registry

- [ ] T-001: Add `EffectPayload` interface to `convex/engine/types.ts`
- [ ] T-002: Add `effectPayloadValidator` to `convex/engine/validators.ts`
- [ ] T-003: Update onboarding machine action names to match spec (`notifyApplicantApproved`, `notifyApplicantRejected`, `assignRole`)
- [ ] T-004: Rename existing `assignRoleToUser` effect to `assignRole` and update args to use `effectPayloadValidator`
- [ ] T-005: Add notification stub effects (`notifyApplicantApproved`, `notifyApplicantRejected`, `notifyAdminNewRequest`) to `convex/engine/effects/onboarding.ts`
- [ ] T-006: Create `convex/engine/effects/obligation.ts` with stub effects (`emitObligationOverdue`, `emitObligationSettled`)
- [ ] T-007: Widen registry type to `"mutation" | "action"` and add all effect entries to `convex/engine/effects/registry.ts`
