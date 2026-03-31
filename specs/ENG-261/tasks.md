# ENG-261 Tasks

Source issue: `ENG-261`

Repo reality notes:
- The CRM backend is mostly present in `convex/crm/*`.
- Link types, record links, and link queries already exist, so Link Explorer does not need a placeholder.
- The main backend gap for this demo is native record detail support. `queryRecords` supports system objects, but `getRecord` explicitly does not.
- `queryViewRecords` supports table and kanban for EAV-backed objects only. System-object views must use `queryRecords` until backend parity exists.

## Ordered Tasks

- [ ] `T-001` Create `src/routes/demo/crm/route.tsx` as the section shell with header, pill-nav, `ssr: false`, and `Outlet`, following the existing multi-page demo route pattern.
- [ ] `T-002` Create shared CRM demo utilities/types under `src/components/demo/crm/` for route-local state, formatting helpers, and reusable view metadata so the new demo surface does not duplicate logic across tabs.
- [ ] `T-003` Create `src/components/demo/crm/MetricsProvider.tsx` and `src/components/demo/crm/ValidationMetrics.tsx` for sticky read-count/render-time/source-shape metrics shared across the CRM demo.
- [ ] `T-004` Create `convex/demo/crmSandbox.ts` with demo seed/reset helpers for a lead-pipeline walkthrough and any light bootstrap helpers needed by the frontend demo.
- [ ] `T-005` Create `src/components/demo/crm/FieldDefEditor.tsx` as a reusable row editor for field metadata.
- [ ] `T-006` Create `src/components/demo/crm/SelectOptionsEditor.tsx` for `select` and `multi_select` option editing.
- [ ] `T-007` Create `src/components/demo/crm/ObjectCreator.tsx` to create objectDefs and fieldDefs, and to list/select existing custom objects.
- [ ] `T-008` Create `src/components/demo/crm/FieldInput.tsx` that renders the correct input control for each supported CRM field type.
- [ ] `T-009` Create `src/components/demo/crm/DynamicRecordForm.tsx` for create/edit/delete record flows driven by fieldDefs.
- [ ] `T-010` Create `src/components/demo/crm/cell-renderers.tsx` with shared value-formatting and display helpers used by tables, details, and relations.
- [ ] `T-011` Create `src/components/demo/crm/RecordTable.tsx` using TanStack Table plus shared shadcn table primitives for sorting, search, pagination, and row-click handling.
- [ ] `T-012` Create `src/components/demo/crm/KanbanView.tsx` to render grouped records for select-backed views.
- [ ] `T-013` Create `src/components/demo/crm/ViewToggle.tsx` for table-versus-kanban switching where the selected object supports kanban.
- [ ] `T-014` Create `src/routes/demo/crm/index.tsx` and wire the custom-object playground end to end: object selection/creation, record form, table/kanban view, seed actions, and metrics updates.
- [ ] `T-015` Create `convex/crm/auditQueries.ts` as a thin wrapper over `auditLog.queryByResource()` for CRM record history UI.
- [ ] `T-016` Create `src/components/demo/crm/RecordSidebarProvider.tsx` to manage drawer open state, selected record reference, and related-record drill-in navigation.
- [ ] `T-017` Create `src/components/demo/crm/RecordFieldDisplay.tsx` for field-level rendering and inline edit affordances in the detail surface.
- [ ] `T-018` Create the record relations/history presentation components under `src/components/demo/crm/` using `api.crm.linkQueries.getLinkedRecords`, `api.crm.recordLinks.*`, and `api.crm.auditQueries.*`.
- [ ] `T-019` Create `src/components/demo/crm/RecordSidebar.tsx` with Details, Relations, and History tabs built on the shared Sheet primitive.
- [ ] `T-020` Add backend support for native record detail retrieval so the system-adapter tab can open the same sidebar/page surface for native entities without relying on EAV-only `getRecord`.
- [ ] `T-021` Create `src/components/demo/crm/RecordDetailPage.tsx` for the full-page detail surface, including summary, fields, relations, and history sections.
- [ ] `T-022` Create `src/routes/demo/crm/$objectDefId.$recordId.tsx` and connect it to CRM record detail loading, 404 handling, and navigation back to `/demo/crm/`.
- [ ] `T-023` Create `src/components/demo/crm/SystemAdapterTab.tsx`, `src/components/demo/crm/ShapeComparison.tsx`, and `src/components/demo/crm/SourceIndicator.tsx` to validate native-table parity against the shared record UI.
- [ ] `T-024` Create `src/components/demo/crm/LinkTypeCreator.tsx` for creating and listing polymorphic link types.
- [ ] `T-025` Create `src/components/demo/crm/LinkCreator.tsx` for selecting a link type and linking two concrete records/entities.
- [ ] `T-026` Create `src/components/demo/crm/LinkExplorer.tsx` to compose link-type creation, link creation, and linked-record inspection.
- [ ] `T-027` Create `src/routes/demo/crm/system.tsx` and `src/routes/demo/crm/links.tsx` and wire them into the section nav.
- [ ] `T-028` Run `bun check`, `bun typecheck`, and `bunx convex codegen`, then fix resulting issues until the quality gate passes.
