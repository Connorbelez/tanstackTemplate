# Chunk 1 Context: Mock Provider Core

## Scope
Build the controllable mock transfer provider and extend provider code unions so the new provider can be referenced by schema, mutations, and tests.

## Verbatim Acceptance Criteria (ENG-220)
- Implements full TransferProvider interface (initiate, confirm, cancel, getStatus)
- All 4 modes work: immediate, async, fail, reversal
- `simulateWebhook()` exercises the full webhook -> transfer state transition -> cash ledger pipeline
- Registered in Provider Registry for both inbound and outbound capabilities
- Only enabled when `NODE_ENV !== 'production'` or via explicit test flag
- Provider file includes reference comments for new provider authors

## Current Code Constraints
- Transfer provider interface exists at `convex/payments/transfers/interface.ts`
- Current transfer provider registry supports only `manual` in `convex/payments/transfers/providers/registry.ts`
- `providerCodeValidator` and `PROVIDER_CODES` are canonical and must remain consistent with schema-level `transferRequests.providerCode`
- Existing old mock implementation is `MockPADMethod` under `convex/payments/methods/mockPAD.ts` (legacy interface)

## Related Design Context
- ENG-189 implementation notes confirm `TransferProvider` interface is already available and used by downstream work.
- PaymentRails context emphasizes provider adapters as strategy implementations with normalized results and no provider-specific leakage outside adapter boundary.
- VoPay webhook pipeline exists at `convex/payments/webhooks/vopay.ts` with mapped events: `FUNDS_SETTLED`, `TRANSFER_FAILED`, `TRANSFER_REVERSED`.

## Implementation Notes
- Prefer dependency injection for webhook dispatch in `simulateWebhook()` so tests can exercise pure payload generation and optional pipeline invocation.
- Keep `MockTransferProvider` runtime deterministic for tests (explicit mode and predictable providerRef behavior).
- Keep provider-facing amount semantics in cents at domain boundary; if conversion guidance is included, it must be comments/reference guidance only.
