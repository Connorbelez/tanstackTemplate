# Chunk 2: Registry and Legacy Integration

## Tasks
- [x] T-005: Register `mock_pad` and `mock_eft` in `convex/payments/transfers/providers/registry.ts`
- [x] T-006: Add production guard so mock providers are disabled in production unless explicit opt-in flag is enabled
- [x] T-007: Add deprecation warning path for legacy `MockPADMethod` usage in old `PaymentMethod` interface flow (`convex/payments/methods/mockPAD.ts` and/or `convex/payments/methods/registry.ts`)

## Quality Gate
```bash
bunx convex codegen
bun check
bun typecheck
```
