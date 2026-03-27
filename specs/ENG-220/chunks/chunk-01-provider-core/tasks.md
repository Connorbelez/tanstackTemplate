# Chunk 1: Mock Provider Core

## Tasks
- [x] T-001: Add `mock_pad` and `mock_eft` to transfer provider code taxonomy in `convex/payments/transfers/types.ts`
- [x] T-002: Add mock provider literals to transfer validators in `convex/payments/transfers/validators.ts`
- [x] T-003: Create `convex/payments/transfers/providers/mock.ts` implementing `TransferProvider` with modes `immediate | async | fail | reversal`
- [x] T-004: Implement `simulateWebhook(providerRef, event)` in `MockTransferProvider` to generate/dispatch webhook-shaped events for transfer transition testing

## Quality Gate
```bash
bunx convex codegen
bun check
bun typecheck
```
