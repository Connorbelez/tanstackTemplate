# ENG-209 Chunk Manifest

## Chunks

| Chunk | Tasks | Status | Description |
|-------|-------|--------|-------------|
| chunk-01-orchestrator | T-001 through T-005 | pending | Deposit collection orchestrator, admin trigger, effect extension, tests |

## Execution Order

1. **chunk-01-orchestrator** — All implementation in a single chunk since this is a focused 3-point issue with 5 tasks. The transfer infrastructure (types, validators, cash ledger mapping, effect handlers) is already fully operational. We're adding a thin orchestration layer on top.

## Context Sources

- Implementation plan: Notion (ENG-209)
- Transfer type taxonomy: `commitment_deposit_collection` already in `types.ts`
- Cash ledger mapping: `inboundTransferCreditFamily()` → UNAPPLIED_CASH already implemented
- Effect handler: `publishTransferConfirmed` handles all inbound transfers generically
- Pattern reference: `startDealClosingPipeline` in mutations.ts (orchestrator pattern)
- Test patterns: `mutations.test.ts`, `pipeline.test.ts`
