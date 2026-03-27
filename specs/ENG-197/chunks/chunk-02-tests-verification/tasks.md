# Chunk 2: Tests and Verification

- [x] T-004: Replace the stale “status confirmed” bridge record assumptions in `convex/payments/transfers/__tests__/bridge.test.ts` with tests that reflect the current initiated-then-confirmed GT bridge flow and assert transfer type derivation for at least interest, principal, late fee, arrears cure, and unknown/undefined obligation types.
- [x] T-005: Extend bridge-oriented test coverage to keep the D4 contract explicit: bridged transfers are identified by `collectionAttemptId`, keep the deterministic `transfer:bridge:{attemptId}` idempotency key, and are distinguishable from direct transfer records.
- [x] T-006: Run the required quality gate for ENG-197: `bunx convex codegen`, `bun check`, and `bun typecheck`.
