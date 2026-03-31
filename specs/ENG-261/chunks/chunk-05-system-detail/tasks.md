# chunk-05-system-detail

- [ ] `T-020` Add backend support for native record detail retrieval so the system-adapter tab can open the same sidebar/page surface for native entities without relying on EAV-only `getRecord`.
- [ ] `T-021` Create `src/components/demo/crm/RecordDetailPage.tsx` for the full-page detail surface, including summary, fields, relations, and history sections.
- [ ] `T-022` Create `src/routes/demo/crm/$objectDefId.$recordId.tsx` and connect it to CRM record detail loading, 404 handling, and navigation back to `/demo/crm/`.
- [ ] `T-023` Create `src/components/demo/crm/SystemAdapterTab.tsx`, `src/components/demo/crm/ShapeComparison.tsx`, and `src/components/demo/crm/SourceIndicator.tsx` to validate native-table parity against the shared record UI.
