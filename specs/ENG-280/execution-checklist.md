# Execution Checklist: ENG-280 - View Engine — Dedicated Entity Adapter Rollout for Listings, Mortgages, Obligations, and Borrowers

## Requirements From Linear
- [ ] The CRM native-object bootstrap and query layer can register and page listings records through the shared view engine, rather than leaving `/admin/listings` on a placeholder or unsupported path.
- [ ] Dedicated adapter definitions for listings, mortgages, obligations, and borrowers explicitly define title/status candidates, layout defaults, visible-field order, and field overrides instead of relying on generic fallback ordering.
- [ ] The backend supports dedicated entity hydration for domain-specific summary or computed columns that require more than record-local fields, and that hydration runs for table, kanban, and detail queries.
- [ ] Listings expose richer columns from the existing listing domain model, including marketplace/location/economic fields and relation-aware links back to mortgage/property context when present.
- [ ] Listings have a non-barren dedicated detail sheet/page experience through the shared renderer registry instead of the current generic fallback field grid.
- [ ] Mortgages expose domain-specific summary/computed columns and relation-aware display for property, borrower, deal, and obligation context without raw-id or generic JSON fallbacks.
- [ ] Mortgage detail sheets/pages are expanded enough to support upcoming origination/admin workflows, including meaningful sections for borrowers, payment setup, listing projection, documents, and audit/supporting context where the data contract already exists.
- [ ] Obligations expose domain-specific columns and relation-aware rendering for mortgage and borrower context, plus payment-state detail rendering beyond a one-field generic section.
- [ ] Borrowers expose relation-aware display and dedicated detail rendering rather than relying only on record-local status/IDV fields.
- [ ] Shared table and kanban row/card presentation become adapter-aware so the primary admin UX for these entities no longer depends on generic record title/supporting-text scaffolding.
- [ ] Dedicated detail sheets and pages for the rollout entities are composed through the shared renderer registry and reusable section modules, not route-local one-off implementations.
- [ ] Dedicated detail modules reuse existing domain queries where available, especially for listing availability/appraisals/encumbrances/transaction history and any mortgage-linked supporting context.
- [ ] Curated system default views are seeded or repaired idempotently for each rollout entity, including visible fields, field order, and aggregate presets; kanban bindings should be seeded only where the entity’s domain requirements justify them.
- [ ] Calendar behavior and calendar default views are not expanded by this issue.
- [ ] Non-dedicated entities continue to use the fallback adapter/view/detail path without regressions.
- [ ] No new `any` types are introduced.
- [ ] Validation covers native listings bootstrap/query behavior, dedicated hydration of computed fields, curated system views, and dedicated detail rendering for the rollout entities.

## Definition Of Done From Linear
- [ ] `/admin/listings` resolves through live CRM-native view-engine data instead of an unsupported native-table gap.
- [ ] Listings, mortgages, obligations, and borrowers each have curated system default view configuration that matches domain needs and survives re-bootstrap or repair.
- [ ] The shared table `Record` column and kanban card header for the rollout entities show domain-specific semantics rather than generic scaffold copy.
- [ ] Dedicated detail sheets/pages for the rollout entities render entity-specific sections through the shared registry.
- [ ] Listing detail surfaces show richer marketplace/property context sourced from live domain queries and no longer read as a generic fallback field dump.
- [ ] Mortgage detail surfaces are fleshed out enough for the next admin/origination workstream rather than stopping at a minimal terms-only layout.
- [ ] Mortgage, obligation, and borrower detail surfaces no longer read as generic field dumps for their primary admin UX.
- [ ] Dedicated adapter-computed fields or summary fields render correctly in list and detail surfaces without introducing N+1-style query behavior that breaks Convex read limits.
- [ ] Relation behavior continues to use the shared ENG-276 contract and still works across dedicated and fallback entities.
- [ ] Fallback entities remain functional and visually unchanged except where they benefit from shared improvements.
- [ ] `bun check` passes.
- [ ] `bun typecheck` passes.
- [ ] `bunx convex codegen` passes.
- [ ] Automated tests cover the new native/system bootstrap path, dedicated computed hydration, and at least one dedicated detail renderer path.

## Agent Instructions
- Keep this file current as work progresses.
- Do not mark an item complete unless code, tests, and validation support it.
- If an item is blocked or inapplicable, note the reason directly under the item.

## Test Coverage Expectations
- [ ] Unit tests added or updated where backend or domain logic changed
- [ ] E2E tests added or updated where an operator or user workflow changed
- [ ] Storybook stories added or updated where reusable UI changed

## Final Validation
- [ ] All requirements are satisfied
- [ ] All definition-of-done items are satisfied
- [ ] Required quality gates passed
- [ ] Test coverage expectations were met or explicitly justified
