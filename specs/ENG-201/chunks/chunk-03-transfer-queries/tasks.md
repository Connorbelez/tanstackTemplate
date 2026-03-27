# Chunk 3: Transfer Queries

## Tasks
- [x] T-007: Migrate existing transfer queries to payment permission chains
- [x] T-008: Add indexed list queries (`listTransfersByCounterparty`, `listTransfersByDeal`)
- [x] T-009: Add `getTransferTimeline` query combining transfer, audit journal, and cash-ledger rows

## Quality Gate
```bash
bun check
bun typecheck
bunx convex codegen
```
