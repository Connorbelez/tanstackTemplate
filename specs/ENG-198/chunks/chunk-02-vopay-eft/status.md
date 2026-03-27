# Chunk 2: VoPay PAD and EFT Transfer Handlers — Status

Completed: 2026-03-27

## Tasks Completed
- [x] T-004: Refactored `convex/payments/webhooks/vopay.ts` so the HTTP handler now verifies, persists, schedules, and immediately acknowledges while the scheduled mutation resolves transfers, patches webhook metadata, enforces idempotency, and finalizes `webhookEvents`.
- [x] T-005: Added `convex/payments/webhooks/eftVopay.ts` as the outbound VoPay EFT route wrapper over the same provider-owned processing pipeline.
- [x] T-006: Registered `POST /webhooks/eft_vopay` in `convex/http.ts`.

## Tasks Incomplete
- None.

## Quality Gate
- `bun check`: pass with pre-existing complexity warnings in unrelated files
- `bun typecheck`: pass
- `bunx convex codegen`: pass

## Notes
- The VoPay processing mutation now supports both `pad_vopay` and `eft_vopay` while keeping VoPay-specific status mapping inside the VoPay module.
- Scheduling failures are recorded onto `webhookEvents` as failed records so the webhook is still durably traceable even when async processing cannot be queued.
