# ENG-156: SUSPENSE Routing for Unmatched Cash — Master Task List

## Chunk 1: Schema & Types (`chunk-01-schema-types`) ✅

- [x] **T-001**: Add `SUSPENSE_ROUTED` to `CASH_ENTRY_TYPES` array in `convex/payments/cashLedger/types.ts`
- [x] **T-002**: Add `SUSPENSE_ROUTED` family map to `CASH_ENTRY_TYPE_FAMILY_MAP` in `convex/payments/cashLedger/types.ts` — `debit: ["SUSPENSE"], credit: ["CASH_CLEARING", "TRUST_CASH", "UNAPPLIED_CASH"]`
- [x] **T-003**: Add `v.literal("SUSPENSE_ROUTED")` to `cashEntryTypeValidator` in `convex/payments/cashLedger/validators.ts`
- [x] **T-004**: Add `v.literal("SUSPENSE_ROUTED")` to `cash_ledger_journal_entries.entryType` union in `convex/schema.ts`
- [x] **T-005**: Add `"SUSPENSE_ROUTED"` to balance check exclusion list in `balanceCheck()` in `convex/payments/cashLedger/postEntry.ts`

## Chunk 2: Integration Functions & Query Enrichment (`chunk-02-integration-queries`) ✅

- [x] **T-006**: Create `postToSuspense` helper function in `convex/payments/cashLedger/integrations.ts`
- [x] **T-007**: Create `postCashReceiptWithSuspenseFallback` exported function in `convex/payments/cashLedger/integrations.ts`
- [x] **T-008**: Enrich `getSuspenseItems()` in `convex/payments/cashLedger/queries.ts` — added `createdAt` and `ageMs`
- [x] **T-009**: Run quality gates: `bunx convex codegen && bun check && bun typecheck` (and optional `bun run test`) — all pass for modified files
