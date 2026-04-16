# Execution Checklist: ENG-276 - View Engine — Relation Cells, Inline Expansion, and Cross-Entity Navigation

## Requirements From Linear
- [ ] Shared view-engine table and kanban surfaces render relation-backed fields as chips/links instead of raw scalar or JSON fallbacks.
- [ ] Backend view queries return a typed, cell-ready relation payload for relation-backed fields, including target `recordId`, `recordKind`, `objectDefId`, and human-readable label text.
- [ ] Multi-relation cells render a collapsed truncated state and an inline expanded state that pushes surrounding layout downward instead of using detached hover-only UI.
- [ ] Only one relation cell expansion may be open per rendered surface in MVP.
- [ ] Clicking a relation chip opens the related record in the shared detail sheet when the sidebar provider context is available, and falls back to the correct full detail page route when it is not.
- [ ] Relation rendering and navigation are reusable across metadata-fallback entities and dedicated adapter entities without route-local exceptions.
- [ ] Kanban cards use the same relation value contract and presentation rules when a preview field is relation-backed.
- [ ] Generic detail rendering handles relation payloads meaningfully so fallback detail sections do not degrade to raw JSON once relation values become structured.
- [ ] Existing row-click navigation, Relations tab navigation, and detail-sheet back-stack behavior continue to work.
- [ ] Calendar-based views and calendar query contracts are out of scope for this issue and must not be expanded as part of the relation-cell work.
- [ ] No new `any` types are introduced.
- [ ] Validation includes backend relation payload hydration plus frontend expansion/navigation behavior.

## Definition Of Done From Linear
- [ ] Table cells for relation-backed fields display chip/link UI rather than raw ids, plain strings, or JSON.
- [ ] Multi-relation table cells expand inline and only one expanded relation cell can be open at a time.
- [ ] Relation chip clicks open related detail sheets across entity types from the shared admin view when feasible.
- [ ] When sheet navigation is not feasible, relation chip clicks fall back to the correct dedicated or generic full detail page route.
- [ ] Kanban relation preview fields use the same shared relation presentation and navigation rules.
- [ ] Generated fallback detail rendering no longer JSON-dumps relation payloads.
- [ ] Existing row-click detail navigation and `LinkedRecordsPanel` navigation still behave correctly after the new helper(s) land.
- [ ] Calendar layouts remain unchanged.
- [ ] `bun check` passes.
- [ ] `bun typecheck` passes.
- [ ] `bunx convex codegen` passes.
- [ ] Automated tests cover backend relation hydration and frontend inline expansion/navigation for at least one dedicated entity and one fallback entity.

## Agent Instructions
- Keep this file current as work progresses.
- Do not mark an item complete unless code, tests, and validation support it.
- If an item is blocked or inapplicable, note the reason directly under the item.

## Test Coverage Expectations
- [ ] Unit tests added or updated where backend or domain logic changed
- [ ] E2E tests added or updated where an operator or user workflow changed
- [ ] Storybook stories added or updated where reusable UI changed
  Storybook is likely not appropriate for this issue because the reusable behavior is primarily stateful relation-cell interaction already covered by component tests unless a new standalone presentational primitive materially benefits from story coverage.

## Final Validation
- [ ] All requirements are satisfied
- [ ] All definition-of-done items are satisfied
- [ ] Required quality gates passed
- [ ] Test coverage expectations were met or explicitly justified
