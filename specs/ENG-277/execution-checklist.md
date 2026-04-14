# Execution Checklist: ENG-277 - View Engine - Kanban Layout Builder

## Requirements From Linear
- [x] Reuse the existing kanban engine/query contracts in `convex/crm`; do not rebuild group creation, board querying, or view-state assembly from scratch.
- [x] Production admin routes must resolve object/view/saved-view context through one canonical view-engine path rather than route-local lookup logic.
- [x] Kanban availability must be offered only when an eligible single-select field exists, across native fields and typed EAV fields.
- [x] Users must be able to choose which eligible single-select field drives the board.
- [x] Dedicated adapters may provide a default kanban field and board defaults, while fallback entities derive eligibility and defaults from metadata-driven contracts.
- [x] Kanban must remain visible but disabled with a clear explanation when the entity lacks an eligible field.
- [x] MVP production kanban must be read-only even though lower-level move mutations already exist.
- [x] Saved-view and system-view contracts must remain the source of truth for selected layout and bound board field.
- [x] The shared admin shell should compose existing toolbar/filter/detail seams rather than introducing a separate kanban-only route architecture.
- [x] The implementation should cover at least one dedicated entity path and one metadata-driven fallback entity path.

## Definition Of Done From Linear
- [x] The production admin surface can render kanban for in-scope eligible entities using active system/saved-view context.
- [x] Board columns come from the selected eligible single-select field.
- [x] Dedicated entities can override kanban defaults through adapter metadata while fallback entities use metadata-driven defaults.
- [x] Disabled layout messaging appears when no eligible kanban field exists.
- [x] Production kanban does not expose drag-to-change or status-mutation behavior in MVP.
- [x] Shared admin routes in scope use real view-engine data instead of scaffolded or fake route-local list models for kanban-capable entities.
- [x] Layout selection and the chosen kanban field persist correctly across reload when saved-view state applies.
- [x] Tests cover at least one dedicated entity and one fallback entity.
- [x] `bun check` passes.
- [x] `bun typecheck` passes.
- [ ] `bunx convex codegen` passes.
  Blocked by a pre-existing Convex module-analysis failure outside ENG-277 (`crm/__tests__/helpers.js` / `@convex-dev/aggregate/src/test.ts`).

## Agent Instructions
- Keep this file current as work progresses.
- Do not mark an item complete unless code, tests, and validation support it.
- If an item is blocked or inapplicable, note the reason directly under the item.

## Test Coverage Expectations
- [x] Unit tests added or updated where backend or domain logic changed
- [ ] E2E tests added or updated where an operator or user workflow changed
  Deferred because authenticated admin-route e2e verification is not trustworthy until the Convex deployment/codegen issue is cleared in this worktree.
- [x] Storybook stories added or updated where reusable UI changed

## Final Validation
- [x] All requirements are satisfied
- [ ] All definition-of-done items are satisfied
  Remaining open item: `bunx convex codegen`
- [ ] Required quality gates passed
  Remaining open item: `bunx convex codegen`
- [x] Test coverage expectations were met or explicitly justified
