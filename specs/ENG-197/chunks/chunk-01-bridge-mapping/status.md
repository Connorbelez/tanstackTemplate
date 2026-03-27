# Chunk 1 Status: completed

Completed tasks:
- T-001: Added `OBLIGATION_TYPE_TO_TRANSFER_TYPE`, `DEFAULT_OBLIGATION_TRANSFER_TYPE`, and `obligationTypeToTransferType()` in `convex/payments/transfers/types.ts`
- T-002: Extended `convex/payments/transfers/__tests__/types.test.ts` to cover the reverse mapping and fallback behavior
- T-003: Replaced the hardcoded bridge transfer type in `convex/engine/effects/collectionAttempt.ts` with dynamic derivation from the bridged obligation type

Quality gate:
- `bunx convex codegen` passed
- `bun check` passed with pre-existing complexity warnings outside ENG-197
- `bun typecheck` passed

Notes:
- Preserved Phase M2a behavior, D4 skip semantics, existing provider-code fallback, and the `transfer:bridge:{attemptId}` idempotency contract
