# Execution Checklist: ENG-279 - View Engine — Detail Sheet Renderer Registry, Editability, and Domain Sections

## Requirements From Linear
- [x] Detail renderer resolution is keyed by the opened entity/object, not the source route or source view.
- [x] Shared sheet and full-page detail surfaces consume the same renderer registry and normalized data contract.
- [x] The detail surface receives normalized fields with computed fields, field overrides, relation metadata, and editability metadata.
- [x] Dynamic or unconfigured entities render through a generic fallback detail renderer.
- [x] Dedicated entities can compose section-based detail experiences from reusable modules.
- [x] The first dedicated modules support domain-rich sections such as property context, comparables, documents, and document-adjacent panels where applicable.
  Current dedicated coverage is limited to the CRM/system objects already bootstrapped in this repo: mortgages, obligations, deals, borrowers, lenders, and brokers.
- [x] The details tab renders relation and computed values with typed presentation rules rather than raw JSON when metadata is available.
- [x] UI editability surfaces read-only/computed reasons while Convex mutations remain authoritative.
- [x] Relations and history continue reusing `LinkedRecordsPanel` and `ActivityTimeline`.
- [x] Existing dedicated admin routes continue to resolve through the shared detail surface and renderer registry.

## Definition Of Done From Linear
- [x] Opening a record from any admin table or linked relation resolves the same entity-specific renderer regardless of source route.
- [x] `RecordSidebar` no longer depends on raw `fieldDefs.listFields` alone for the Details tab.
- [x] Generic fallback entity detail renders normalized fields with no regression to relations, notes, files, or history tabs.
- [x] Dedicated entity modules render at least one rich sectioned experience reused in both sheet and page contexts.
- [x] Editability state is visible in the detail UI for persisted, native read-only, and computed fields.
- [x] Dedicated admin routes and the sidebar both resolve through the same renderer registry.
- [x] No new `any` types are introduced.
- [ ] `bun check`, `bun typecheck`, and `bunx convex codegen` pass.
  Blocked by unrelated repo-wide errors for `bun check`/`bun typecheck`, and by missing `CONVEX_DEPLOYMENT` for `bunx convex codegen`.
- [x] Automated tests cover the new detail query/resolver and the dedicated-vs-fallback rendering path.

## Agent Instructions
- Keep this file current as work progresses.
- Do not mark an item complete unless code, tests, and validation support it.
- If an item is blocked or inapplicable, note the reason directly under the item.

## Test Coverage Expectations
- [x] Unit tests added or updated where backend or domain logic changed
- [ ] E2E tests added or updated where an operator or user workflow changed
  Not added. The change stays within an existing admin detail surface and was validated with targeted backend/admin-shell tests instead of a browser workflow.
- [ ] Storybook stories added or updated where reusable UI changed
  Storybook is not currently part of the declared project workflow in `AGENTS.md`; if no story setup exists, document that explicitly at close-out.

## Final Validation
- [x] All requirements are satisfied
- [ ] All definition-of-done items are satisfied
  Repo-wide quality gates remain blocked outside ENG-279.
- [ ] Required quality gates passed
  `bun check` and `bun typecheck` fail on unrelated repo issues; `bunx convex codegen` is blocked by missing `CONVEX_DEPLOYMENT`.
- [x] Test coverage expectations were met or explicitly justified
