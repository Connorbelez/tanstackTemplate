# ENG-182 Chunk Manifest

| Chunk | Label | Tasks | Status | Dependencies |
|-------|-------|-------|--------|--------------|
| 01 | schema-config | T-001, T-002, T-003 | pending | none |
| 02 | backend-core | T-004, T-005, T-006, T-007, T-008 | pending | chunk-01 |
| 03 | batch-cron | T-009, T-010 | pending | chunk-02 |
| 04 | tests | T-011, T-012, T-013 | pending | chunk-03 |

## Execution Order
1. **chunk-01-schema-config** — Schema fields + config module + validators
2. **chunk-02-backend-core** — Queries, helper mutations, admin payout
3. **chunk-03-batch-cron** — Batch action + cron registration
4. **chunk-04-tests** — All test files

## Context Sources
- Notion: Implementation Plan (ENG-182)
- Notion: Cash & Obligations Ledger (Goal)
- Notion: Lender Payable Journal (Feature)
- Notion: Tech Design §12 OQ-8
- Linear: ENG-162 (postLenderPayout — Done ✅)
- Linear: ENG-174 (Hold period — Done ✅)
- Codebase: `convex/schema.ts:132` (lenders table)
- Codebase: `convex/crons.ts` (existing cron schedule)
- Codebase: `convex/dispersal/holdPeriod.ts` (hold period config)
- Codebase: `convex/payments/cashLedger/mutations.ts:20` (postLenderPayout)
- Codebase: `convex/payments/cashLedger/queries.ts:89` (getLenderPayableBalance)
- Codebase: `convex/dispersal/validators.ts:7` (dispersalStatusValidator)
