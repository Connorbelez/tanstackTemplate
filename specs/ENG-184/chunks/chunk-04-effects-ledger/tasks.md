# Chunk 4: Effects & Ledger Bridge

## Tasks
- [ ] T-013: Create `convex/engine/effects/transfer.ts`
- [ ] T-014: Register transfer effects in `convex/engine/effects/registry.ts`
- [ ] T-015: Add `postCashReceiptForTransfer()` in `convex/payments/cashLedger/integrations.ts`
- [ ] T-016: Add `postLenderPayoutForTransfer()` in `convex/payments/cashLedger/integrations.ts`

## Quality Gate
```bash
bunx convex codegen
bun check
bun typecheck
```
