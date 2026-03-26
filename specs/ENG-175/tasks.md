# ENG-175: Reversal Webhook Handlers — Master Task List

## Chunk 1: Infrastructure + Core Reversal Logic
- [x] T-001: Create webhook signature verification utilities (`convex/payments/webhooks/verification.ts`)
- [x] T-002: Create shared reversal types and ReversalWebhookPayload interface (`convex/payments/webhooks/types.ts`)
- [x] T-003: Create internal reversal mutation processReversalCascade (`convex/payments/webhooks/processReversal.ts`)
- [x] T-004: Create shared reversal handler action handlePaymentReversal (`convex/payments/webhooks/handleReversal.ts`)

## Chunk 2: Provider Handlers + Router Registration
- [x] T-005: Create Rotessa PAD webhook httpAction handler (`convex/payments/webhooks/rotessa.ts`)
- [x] T-006: Create Stripe ACH webhook httpAction handler (`convex/payments/webhooks/stripe.ts`)
- [x] T-007: Register webhook routes in HTTP router (`convex/http.ts`)

## Chunk 3: Tests
- [x] T-008: Core reversal logic tests (`convex/payments/webhooks/__tests__/handleReversal.test.ts`)
- [x] T-009: Rotessa webhook handler tests (`convex/payments/webhooks/__tests__/rotessaWebhook.test.ts`)
- [x] T-010: Stripe webhook handler tests (`convex/payments/webhooks/__tests__/stripeWebhook.test.ts`)
