# Chunk 1: Bridge Mapping

- [x] T-001: Add reverse obligation-to-transfer mapping exports to `convex/payments/transfers/types.ts` so inbound bridge code can derive `borrower_interest_collection`, `borrower_principal_collection`, `borrower_late_fee_collection`, or `borrower_arrears_cure` from an obligation type with a safe fallback for `undefined` or unmapped values.
- [x] T-002: Add focused unit coverage in `convex/payments/transfers/__tests__/types.test.ts` for the new reverse mapping/helper, including all supported obligation types and the default fallback behavior.
- [x] T-003: Update `convex/engine/effects/collectionAttempt.ts` to replace the hardcoded bridge `transferType: "borrower_interest_collection"` with the reverse-mapping helper using the first bridged obligation’s `type`, while preserving the existing Phase M2a behavior, idempotency key, provider-code fallback, and D4 skip semantics.
