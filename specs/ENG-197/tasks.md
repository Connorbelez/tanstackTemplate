# ENG-197: Build Collection Attempt -> TransferRequest Creation Bridge — Master Task List

Source: Linear ENG-197, Notion implementation plan, Unified Payment Rails goal, PaymentRailsSpec
Generated: 2026-03-27

## Phase 1: Bridge Type Mapping
- [x] T-001: Add reverse obligation-to-transfer mapping exports to `convex/payments/transfers/types.ts` so inbound bridge code can derive `borrower_interest_collection`, `borrower_principal_collection`, `borrower_late_fee_collection`, or `borrower_arrears_cure` from an obligation type with a safe fallback for `undefined` or unmapped values.
- [x] T-002: Add focused unit coverage in `convex/payments/transfers/__tests__/types.test.ts` for the new reverse mapping/helper, including all supported obligation types and the default fallback behavior.

## Phase 2: Collection Attempt Bridge Integration
- [x] T-003: Update `convex/engine/effects/collectionAttempt.ts` to replace the hardcoded bridge `transferType: "borrower_interest_collection"` with the reverse-mapping helper using the first bridged obligation’s `type`, while preserving the existing Phase M2a behavior, idempotency key, provider-code fallback, and D4 skip semantics.

## Phase 3: Bridge Regression Coverage
- [x] T-004: Replace the stale “status confirmed” bridge record assumptions in `convex/payments/transfers/__tests__/bridge.test.ts` with tests that reflect the current initiated-then-confirmed GT bridge flow and assert transfer type derivation for at least interest, principal, late fee, arrears cure, and unknown/undefined obligation types.
- [x] T-005: Extend bridge-oriented test coverage to keep the D4 contract explicit: bridged transfers are identified by `collectionAttemptId`, keep the deterministic `transfer:bridge:{attemptId}` idempotency key, and are distinguishable from direct transfer records.

## Phase 4: Verification
- [x] T-006: Run the required quality gate for ENG-197: `bunx convex codegen`, `bun check`, and `bun typecheck`.
