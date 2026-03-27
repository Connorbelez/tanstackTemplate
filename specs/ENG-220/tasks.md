# ENG-220: Implement MockTransferProvider for Testing and Reference — Master Task List

## Chunk 1: Mock Provider Core
- [x] T-001: Add `mock_pad` and `mock_eft` to transfer provider code taxonomy in `convex/payments/transfers/types.ts`
- [x] T-002: Add mock provider literals to transfer validators in `convex/payments/transfers/validators.ts`
- [x] T-003: Create `convex/payments/transfers/providers/mock.ts` implementing `TransferProvider` with modes `immediate | async | fail | reversal`
- [x] T-004: Implement `simulateWebhook(providerRef, event)` in `MockTransferProvider` to generate/dispatch webhook-shaped events for transfer transition testing

## Chunk 2: Registry and Legacy Integration
- [x] T-005: Register `mock_pad` and `mock_eft` in `convex/payments/transfers/providers/registry.ts`
- [x] T-006: Add production guard so mock providers are disabled in production unless explicit opt-in flag is enabled
- [x] T-007: Add deprecation warning path for legacy `MockPADMethod` usage in old `PaymentMethod` interface flow (`convex/payments/methods/mockPAD.ts` and/or `convex/payments/methods/registry.ts`)

## Chunk 3: Tests, Reference Value, and Verification
- [x] T-008: Create `convex/payments/transfers/providers/__tests__/mock.test.ts` covering all 4 modes, status progression, and mode overrides
- [x] T-009: Update transfer provider registry tests to assert mock provider registration/guard behavior
- [x] T-010: Add provider-reference comments in `mock.ts` documenting API boundary mapping, error normalization, and amount conversion guidance for future provider authors
- [x] T-011: Run quality gate: `bunx convex codegen`, `bun check`, `bun typecheck`
