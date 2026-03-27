# Chunk 1: Schema and Shared Webhook Core

## Tasks
- [x] T-001: Extend `webhookEvents` in `convex/schema.ts` with transfer-trace fields needed by the issue scope: `transferRequestId`, `signatureVerified`, and `normalizedEventType`, while preserving the existing table name and dedupe indexes already deployed in this repo.
- [x] T-002: Create a shared transfer-webhook helper module under `convex/payments/webhooks/` for durable event persistence, status updates, and provider-code-aware transfer lookup so PAD VoPay, EFT VoPay, and Rotessa PAD do not duplicate the same pipeline logic.
- [x] T-003: Update shared webhook-side types/utilities so provider-specific handlers can persist normalized event metadata without leaking provider-specific status strings outside the provider boundary.

## Quality Gate
```bash
bun check
bun typecheck
bunx convex codegen
```
