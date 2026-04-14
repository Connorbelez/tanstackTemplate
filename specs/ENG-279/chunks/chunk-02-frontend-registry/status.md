# Status: chunk-02-frontend-registry

- Result: complete
- Completed at: 2026-04-13T19:40:50Z

## Completed tasks
- Refactored `RecordSidebar.tsx` to consume `getRecordDetailSurface` instead of stitching together `fieldDefs.listFields` plus `getRecordReference`.
- Expanded `entity-view-adapters.tsx` into a surface-key aware registry that accepts normalized fields and backend adapter metadata.
- Upgraded `FieldRenderer.tsx` to render select, multi-select, date/datetime, currency, percentage, link-like text, and editability/computed badges from normalized metadata.

## Validation
- `bunx biome check src/components/admin/shell/entity-view-adapters.tsx src/components/admin/shell/FieldRenderer.tsx src/components/admin/shell/RecordSidebar.tsx`
- `ALLOW_TEST_AUTH_ENDPOINTS=true DISABLE_GT_HASHCHAIN=true DISABLE_CASH_LEDGER_HASHCHAIN=true bunx vitest run src/test/admin/admin-shell.test.ts`

## Notes
- GitNexus impact on `resolveRecordSidebarEntityAdapter`, `FieldRenderer`, and `AdminRecordDetailSurface` returned LOW risk.
- The fallback details tab now renders normalized fields in schema order instead of raw object JSON when metadata exists.
