# chunk-04-record-surfaces

- [ ] `T-015` Create `convex/crm/auditQueries.ts` as a thin wrapper over `auditLog.queryByResource()` for CRM record history UI.
- [ ] `T-016` Create `src/components/demo/crm/RecordSidebarProvider.tsx` to manage drawer open state, selected record reference, and related-record drill-in navigation.
- [ ] `T-017` Create `src/components/demo/crm/RecordFieldDisplay.tsx` for field-level rendering and inline edit affordances in the detail surface.
- [ ] `T-018` Create the record relations/history presentation components under `src/components/demo/crm/` using `api.crm.linkQueries.getLinkedRecords`, `api.crm.recordLinks.*`, and `api.crm.auditQueries.*`.
- [ ] `T-019` Create `src/components/demo/crm/RecordSidebar.tsx` with Details, Relations, and History tabs built on the shared Sheet primitive.
