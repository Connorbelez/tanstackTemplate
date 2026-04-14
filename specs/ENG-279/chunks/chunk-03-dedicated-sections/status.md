# Status: chunk-03-dedicated-sections

- Result: complete
- Completed at: 2026-04-13T19:40:50Z

## Completed tasks
- Added reusable section primitives in `src/components/admin/shell/detail-sections.tsx`.
- Implemented first-pass dedicated detail layouts for mortgages, obligations, deals, borrowers, lenders, and brokers.
- Replaced the legacy `AdminDetailSheet` placeholder with the shared `AdminRecordDetailSurface`.

## Validation
- `bunx biome check src/components/admin/shell/detail-sections.tsx src/components/admin/shell/entity-view-adapters.tsx src/components/admin/shell/AdminDetailSheet.tsx`
- `ALLOW_TEST_AUTH_ENDPOINTS=true DISABLE_GT_HASHCHAIN=true DISABLE_CASH_LEDGER_HASHCHAIN=true bunx vitest run src/test/admin/admin-shell.test.ts`

## Notes
- Listing/property-specific comparables or document panels remain constrained by the absence of equivalent CRM object contracts in the current bootstrap data.
