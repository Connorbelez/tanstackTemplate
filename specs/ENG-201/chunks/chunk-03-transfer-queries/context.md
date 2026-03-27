# Chunk 3 Context: Transfer Queries

## Source Context (Linear ENG-201)
Required queries to add:
- `listTransfersByCounterparty`
- `listTransfersByDeal`
- `getTransferTimeline`

Acceptance criteria relevant to this chunk:
- Queries must use appropriate indexes for performance.

## Source Context (Notion Implementation Plan ENG-201)
Implementation guidance:
- Migrate existing queries from `authedQuery`/`adminQuery` to `paymentQuery`.
- `listTransfersByCounterparty`
  - Args: `{ counterpartyType, counterpartyId }`
  - Index: `transferRequests.by_counterparty`
- `listTransfersByDeal`
  - Args: `{ dealId }`
  - Index: `transferRequests.by_deal`
- `getTransferTimeline`
  - Args: `{ transferId }`
  - Return transfer row + cash ledger entries + audit entries
  - Cash ledger index: `cash_ledger_journal_entries.by_transfer_request`
  - GT audit index: `auditJournal.by_entity` with `entityType = "transfer"` and `entityId = transferId as string`

## Codebase Reality
- Existing transfer queries:
  - `getTransferRequest` (`authedQuery`)
  - `listTransfersByMortgage` (`authedQuery`, uses `by_mortgage`)
  - `listTransfersByStatus` (`adminQuery`, uses `by_status`)
- Relevant schema indexes exist:
  - `transferRequests.by_counterparty`
  - `transferRequests.by_deal`
  - `cash_ledger_journal_entries.by_transfer_request`
  - `auditJournal.by_entity`

## Output Shape Guidance
- Keep response structures straightforward and serializable.
- Sort timeline entries deterministically (newest-first or by timestamp asc, but choose one and keep consistent).
- Keep read-path only; no mutation side effects.
