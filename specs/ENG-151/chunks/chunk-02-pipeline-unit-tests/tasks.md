# Chunk 02: Pipeline Step Unit Tests

## Tasks
- [ ] T-006: VALIDATE_INPUT tests — zero amount, negative amount, non-integer, MAX_SAFE_INTEGER, debit===credit, invalid date, valid positive
- [ ] T-007: IDEMPOTENCY tests — duplicate key returns existing, no second entry, no balance update on duplicate, different keys create separate
- [ ] T-008: FAMILY_CHECK tests — valid/invalid family combos for all 11 entry types, REVERSAL/CORRECTION accept any family
- [ ] T-009: BALANCE_CHECK tests — rejects negative for non-exempt, allows CONTROL negative, allows BORROWER_RECEIVABLE negative, skips for REVERSAL/CORRECTION/SUSPENSE_ESCALATED
- [ ] T-010: CONSTRAINT_CHECK tests — REVERSAL without causedBy, REVERSAL with causedBy, CORRECTION without admin/actorId/causedBy/reason, CORRECTION with all fields
- [ ] T-011: SEQUENCE+PERSIST tests — monotonic sequence, debit account cumulativeDebits updated, credit account cumulativeCredits updated, cross-refs persisted, projected balances returned
- [ ] T-012: Cents integrity tests — amount stored as bigint, cumulative totals bigint, projected balance bigint, no floating point
