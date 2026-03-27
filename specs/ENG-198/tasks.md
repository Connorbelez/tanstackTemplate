# ENG-198: Implement Webhook Settlement Handler — Master Task List

Source: Linear ENG-198, Notion implementation plan, linked context pages
Generated: 2026-03-27

## Phase 1: Schema and Shared Webhook Core
- [x] T-001: Extend `webhookEvents` in `convex/schema.ts` with transfer-trace fields needed by the issue scope: `transferRequestId`, `signatureVerified`, and `normalizedEventType`, while preserving the existing table name and dedupe indexes already deployed in this repo.
- [x] T-002: Create a shared transfer-webhook helper module under `convex/payments/webhooks/` for durable event persistence, status updates, and provider-code-aware transfer lookup so PAD VoPay, EFT VoPay, and Rotessa PAD do not duplicate the same pipeline logic.
- [x] T-003: Update shared webhook-side types/utilities so provider-specific handlers can persist normalized event metadata without leaking provider-specific status strings outside the provider boundary.

## Phase 2: VoPay PAD and EFT Transfer Handlers
- [x] T-004: Refactor `convex/payments/webhooks/vopay.ts` to use the shared transfer-webhook core, persist transfer linkage metadata on `webhookEvents`, and acknowledge after durable persistence while scheduling transfer processing asynchronously.
- [x] T-005: Create `convex/payments/webhooks/eftVopay.ts` with the same VoPay verification and persistence pattern but using `providerCode: "eft_vopay"` and outbound transfer lookup via `transferRequests.by_provider_ref`.
- [x] T-006: Register `POST /webhooks/eft_vopay` in `convex/http.ts` without changing the existing `POST /webhooks/pad_vopay` contract.

## Phase 3: Rotessa PAD Skeleton and Test Coverage
- [x] T-007: Create `convex/payments/webhooks/rotessaPad.ts` as the transfer-domain skeleton for `POST /webhooks/pad_rotessa`, reusing Rotessa signature verification, persisting raw events before acknowledgement, and keeping provider-specific placeholder status mapping inside the Rotessa file.
- [x] T-008: Register `POST /webhooks/pad_rotessa` in `convex/http.ts` while keeping the existing legacy `/webhooks/rotessa` reversal route intact for current collection-attempt flows.
- [x] T-009: Expand webhook tests to cover shared persistence/idempotency behavior, VoPay PAD/EFT transfer processing paths, and the Rotessa PAD skeleton without regressing the existing reversal-only tests.
- [x] T-010: Run the repo quality gate for this issue: `bun check`, `bun typecheck`, and `bunx convex codegen`.
