# Chunk 1: Schema and Shared Webhook Core — Status

Completed: 2026-03-27

## Tasks Completed
- [x] T-001: Extended `webhookEvents` with optional transfer trace fields and a `by_transfer_request` index in `convex/schema.ts`.
- [x] T-002: Added `convex/payments/webhooks/transferCore.ts` to centralize transfer webhook persistence, status updates, transfer lookup, and idempotency target-state checks.
- [x] T-003: Added normalized transfer webhook event/status types to `convex/payments/webhooks/types.ts`.

## Tasks Incomplete
- None.

## Quality Gate
- `bun check`: pass with pre-existing complexity warnings in unrelated files
- `bun typecheck`: pass
- `bunx convex codegen`: pass

## Notes
- Kept `webhookEvents` as the canonical table name to match the deployed repo shape instead of renaming to `transferWebhooks`.
- Added the new schema fields as optional to avoid breaking the existing webhook handlers before the provider refactors in later chunks.
