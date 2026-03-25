# Chunk 2: Audit Trail Tests

- [ ] T-008: Create `convex/payments/cashLedger/__tests__/auditTrail.test.ts` with test harness setup
- [ ] T-009: Test: successful posting creates audit record with `entityType: 'cashLedgerEntry'`
- [ ] T-010: Test: balance state transitions recorded in `beforeState`/`afterState`
- [ ] T-011: Test: hash chain integrity — post multiple entries, verify chain via `AuditTrail.verifyChain()`
- [ ] T-012: Test: rejected posting creates audit record with `eventType` containing `:REJECTED`
- [ ] T-013: Test: correction chain auditable — post entry + correction, verify both have audit records with `causedBy` in metadata
- [ ] T-014: Test: idempotent posting does not duplicate audit (same idempotency key → single audit record)
