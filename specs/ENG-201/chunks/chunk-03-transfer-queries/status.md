# Chunk 3 Status

## Completed Tasks
- T-007: Migrated transfer queries to `paymentQuery` permission chain
- T-008: Added `listTransfersByCounterparty` and `listTransfersByDeal` on `by_counterparty` / `by_deal` indexes
- T-009: Added `getTransferTimeline` joining transfer record, GT audit journal, and cash-ledger entries

## Quality Gate
- `bun check`: passed (existing repo complexity warnings remain)
- `bun typecheck`: passed
- `bunx convex codegen`: blocked (`No CONVEX_DEPLOYMENT set`)

## Notes
- Timeline response now includes source-separated collections (`auditJournalEntries`, `cashLedgerEntries`) and a merged, timestamp-ordered `timeline` list.
