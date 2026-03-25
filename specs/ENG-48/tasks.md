# ENG-48: dealAccess Authorization — Master Task List

## Chunk 1: Core Implementation
- [x] T-001: Create `convex/deals/accessCheck.ts` — `assertDealAccess()` helper
- [x] T-002: Create `convex/deals/mutations.ts` — `grantAccess`, `revokeAccess` internal mutations
- [x] T-003: Create `convex/deals/queries.ts` — `getActiveDealAccess`, `getActiveLawyerAccess`, `closingTeamAssignments`
- [x] T-004: Create `convex/engine/effects/dealAccess.ts` — `createDealAccess`, `revokeAllDealAccess`, `revokeLawyerAccess`
- [x] T-005: Modify `convex/engine/effects/registry.ts` — register 3 effects
- [x] T-006: Modify `convex/engine/machines/deal.machine.ts` — add `revokeLawyerAccess` to actions + `fundsTransfer.onDone`
- [x] T-007: Quality gate — biome clean, 99/99 machine tests pass, 0 source type errors

## Chunk 2: Tests
- [x] T-008: Create `convex/deals/__tests__/access.test.ts` — 16 test cases
- [x] T-009: Final quality gate — biome clean, source type-safe

## Notes
- Codegen (`bunx convex codegen`) must be run once `CONVEX_DEPLOYMENT` is configured — this regenerates `_generated/api.ts` to include the new `deals` and `dealAccess` modules. Registry type errors and test imports will resolve after codegen.
- `src/test/auth/helpers.ts` updated to include `convex/deals/**/*.*s` in module glob.
