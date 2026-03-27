# Chunk 7: Tests & Verification

## Tasks
- [ ] T-025: Create `convex/engine/machines/__tests__/transfer.machine.test.ts`
- [ ] T-026: Create `convex/payments/transfers/__tests__/mutations.test.ts`
- [ ] T-027: Create `convex/payments/transfers/__tests__/bridge.test.ts`
- [ ] T-028: Create `convex/payments/transfers/__tests__/reconciliation.test.ts`
- [ ] T-029: Verify existing collection attempt tests pass (zero regression)
- [ ] T-030: Run `bunx convex codegen`, `bun check`, `bun typecheck`

## Quality Gate
```bash
bun run test
bun check
bun typecheck
```
