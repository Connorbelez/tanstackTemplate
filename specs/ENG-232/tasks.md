# Tasks: ENG-232 - Admin Shell - EntityPage (Full Entity Detail View)

## Phase 1: Planning And Impact
- [x] T-001: Write local execution artifacts for ENG-232 from the Linear issue, Notion plan, and supporting docs.
- [x] T-002: Perform manual impact analysis for the existing admin detail symbols that will be changed (`AdminRecordDetailPage`, `RecordSidebar`, route helpers, dedicated detail routes, breadcrumbs).

## Phase 2: Shared Page Surface
- [x] T-010: Add a reusable `EntityPage` component that wraps the existing detail content in the full-page desktop/mobile layout with summary and extension slots.
- [x] T-011: Refactor the current page variant path so `AdminRecordDetailPage` uses `EntityPage` instead of the bare sidebar surface.
- [x] T-012: Expose adapter and summary seams so dedicated entity adapters can inject page-specific content without hardcoding listing- or mortgage-only behavior into the base page.

## Phase 3: Routing And Navigation
- [x] T-020: Keep dedicated detail routes for system entities and wire them to the shared full-page detail page.
- [x] T-021: Update record route helpers and full-page link generation so sidebar navigation and direct route entry land on the same shared page.
- [x] T-022: Resolve breadcrumb leaf and back navigation from entity metadata plus loaded record title instead of `Record {id}` placeholders.

## Phase 4: Stories And Verification
- [x] T-030: Add or update Storybook coverage for the reusable page surface and its relevant states.
- [x] T-031: Add or update targeted tests for the new page layout or route behavior if existing test seams make that practical.
- [ ] T-032: Run `bunx convex codegen`, `bun check`, `bun typecheck`, and targeted test/story verification commands.
Reason: `bun check`, `bun typecheck`, targeted Vitest, and Storybook build passed, but `bunx convex codegen` is blocked by missing `CONVEX_DEPLOYMENT`.
- [x] T-033: Run final scope verification and update the execution artifacts with outcomes and any justified gaps.
