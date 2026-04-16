# Chunk: chunk-01-page-surface

- [ ] T-001: Write local execution artifacts for ENG-232 from the Linear issue, Notion plan, and supporting docs.
- [ ] T-002: Perform manual impact analysis for the existing admin detail symbols that will be changed (`AdminRecordDetailPage`, `RecordSidebar`, route helpers, dedicated detail routes, breadcrumbs).
- [ ] T-010: Add a reusable `EntityPage` component that wraps the existing detail content in the full-page desktop/mobile layout with summary and extension slots.
- [ ] T-011: Refactor the current page variant path so `AdminRecordDetailPage` uses `EntityPage` instead of the bare sidebar surface.
- [ ] T-012: Expose adapter and summary seams so dedicated entity adapters can inject page-specific content without hardcoding listing- or mortgage-only behavior into the base page.
