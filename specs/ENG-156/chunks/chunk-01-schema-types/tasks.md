# Chunk 01: Schema & Types

## Tasks

- [ ] **T-001**: Add `SUSPENSE_ROUTED` to `CASH_ENTRY_TYPES` array in `convex/payments/cashLedger/types.ts` (after `SUSPENSE_ESCALATED` on line 26)
- [ ] **T-002**: Add `SUSPENSE_ROUTED` family map entry to `CASH_ENTRY_TYPE_FAMILY_MAP` in `convex/payments/cashLedger/types.ts` (after `SUSPENSE_ESCALATED` entry ending line 94)
- [ ] **T-003**: Add `v.literal("SUSPENSE_ROUTED")` to `cashEntryTypeValidator` union in `convex/payments/cashLedger/validators.ts` (after `SUSPENSE_ESCALATED` on line 15)
- [ ] **T-004**: Add `v.literal("SUSPENSE_ROUTED")` to `cash_ledger_journal_entries.entryType` union in `convex/schema.ts` (after `SUSPENSE_ESCALATED` on line 1073)
- [ ] **T-005**: Add `"SUSPENSE_ROUTED"` to the balance check exclusion in `balanceCheck()` in `convex/payments/cashLedger/postEntry.ts` — add to the early return condition alongside REVERSAL, CORRECTION, SUSPENSE_ESCALATED (lines 100-106)

## Quality Gate
After all tasks: `bunx convex codegen && bun check && bun typecheck`
