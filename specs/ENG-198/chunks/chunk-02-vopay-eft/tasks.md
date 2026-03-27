# Chunk 2: VoPay PAD and EFT Transfer Handlers

## Tasks
- [x] T-004: Refactor `convex/payments/webhooks/vopay.ts` to use the shared transfer-webhook core, persist transfer linkage metadata on `webhookEvents`, and acknowledge after durable persistence while scheduling transfer processing asynchronously.
- [x] T-005: Create `convex/payments/webhooks/eftVopay.ts` with the same VoPay verification and persistence pattern but using `providerCode: "eft_vopay"` and outbound transfer lookup via `transferRequests.by_provider_ref`.
- [x] T-006: Register `POST /webhooks/eft_vopay` in `convex/http.ts` without changing the existing `POST /webhooks/pad_vopay` contract.

## Quality Gate
```bash
bun check
bun typecheck
bunx convex codegen
```
