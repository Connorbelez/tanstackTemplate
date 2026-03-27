# Chunk 2 Context: Transfer Mutations

## Source Context (Linear ENG-201)
Required mutations to add:
- `cancelTransfer`
- `retryTransfer`
- `confirmManualTransfer`

Acceptance criteria relevant to this chunk:
- Idempotency: duplicate create requests by key return existing transfer.
- Amount validation stays integer-cents only.
- Every transfer action retains audit-grade source attribution.

## Source Context (Notion Implementation Plan ENG-201)
Implementation guidance:
- `cancelTransfer`
  - Use `paymentCancelMutation`.
  - Args: `transferId`.
  - Valid only from `initiated` or `pending`.
  - Execute GT event `TRANSFER_CANCELLED`.
- `retryTransfer`
  - Use `paymentRetryMutation`.
  - Args: `transferId`.
  - Load failed transfer, create a new transfer row with copied fields.
  - Generate fresh idempotency key format: `retry:{originalId}:{timestamp}`.
- `confirmManualTransfer`
  - Use `paymentMutation`.
  - Args: `transferId`, optional `providerRef`.
  - Only allowed when `providerCode === "manual"`.
  - Execute GT event `FUNDS_SETTLED` with `settledAt: Date.now()`.

## Machine/Event Constraints From Codebase
- Transfer machine supports:
  - `TRANSFER_CANCELLED` from `initiated`.
  - `FUNDS_SETTLED` from `initiated` and `pending`/`processing`.
- Existing `executeTransition` pipeline is already wired and should be reused.
- Existing `fireInitiateTransition` internal mutation currently validates only `FUNDS_SETTLED` and `PROVIDER_INITIATED`.

## Integration Notes
- `retryTransfer` should reuse existing `createTransferRequest` insertion semantics where possible to avoid duplication.
- Keep `buildSource(ctx.viewer, "admin_dashboard")` usage for actor attribution.
- Do not introduce user impersonation for system/webhook scenarios in these user-facing mutations.
