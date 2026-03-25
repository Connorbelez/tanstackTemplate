# ENG-172: Chunk Manifest

## Execution Order

| # | Chunk | Tasks | Status | Description |
|---|-------|-------|--------|-------------|
| 1 | chunk-01-cascade-function | T-001 → T-004 | pending | Core `postPaymentReversalCascade()` + `postTransferReversal()` + amount validation helper |
| 2 | chunk-02-reconciliation-query | T-005 → T-007 | pending | `findSettledObligationsWithNonZeroBalance()` detection query + public endpoint |
| 3 | chunk-03-unit-tests | T-008 → T-015 | pending | Unit tests for cascade, idempotency, clawback, amount validation, causedBy linkage |
| 4 | chunk-04-integration-tests | T-016 → T-020 | pending | E2E integration tests + quality gate |

## Dependencies
- Chunk 2 depends on Chunk 1 (reconciliation queries reference reversal entries)
- Chunk 3 depends on Chunk 1 (tests exercise the cascade function)
- Chunk 4 depends on Chunks 1-3 (E2E tests exercise full pipeline)

## Key Context Sources
- **Implementation Plan**: Notion page `32efc1b440248153a212d07c280f49de`
- **Tech Design §5**: Payment Reversal Design in `329fc1b44024801da365d6ccdf137e2a`
- **Cash & Obligations Ledger Goal**: Entry Semantics §6 in `329fc1b4402480b2b82ffa798d6c8e73`
- **Blocking Issues**: ENG-160 (Done ✅), ENG-162 (Done ✅)
- **Downstream**: ENG-175 (webhook handlers), ENG-173 (reversed state), ENG-180 (corrective obligations)
