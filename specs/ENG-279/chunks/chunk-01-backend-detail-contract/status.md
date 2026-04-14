# Status: chunk-01-backend-detail-contract

- Result: complete
- Completed at: 2026-04-13T19:40:50Z

## Completed tasks
- Extracted shared detail-field normalization into `convex/crm/entityViewFields.ts` and rewired `resolveViewState` to use it.
- Added `getRecordDetailSurface` to `convex/crm/recordQueries.ts`.
- Added backend tests covering normalized CRM detail fields plus native borrower computed/detail metadata.

## Validation
- `bunx biome check convex/crm/entityViewFields.ts convex/crm/viewState.ts convex/crm/recordQueries.ts convex/crm/types.ts convex/crm/__tests__/records.test.ts`
- `ALLOW_TEST_AUTH_ENDPOINTS=true DISABLE_GT_HASHCHAIN=true DISABLE_CASH_LEDGER_HASHCHAIN=true bunx vitest run convex/crm/__tests__/records.test.ts`

## Notes
- GitNexus impact on `resolveViewState` returned LOW risk. Direct callers are `viewQueries.ts` and `calendarQuery.ts`.
- The detail query materializes adapter-computed field values so the sidebar no longer drops computed fields from the live record payload.
