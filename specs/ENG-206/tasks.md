# ENG-206: Build Dispersal → Disbursement Bridge

## Master Task List

### Chunk 01 — Bridge Core Module ✅
- [x] T-001: Create `convex/dispersal/disbursementBridge.ts` with types, interfaces, and helper functions
- [x] T-002: Implement `findEligibleEntriesInternal` — internalQuery that finds pending entries past hold period
- [x] T-003: Implement `processSingleDisbursement` — internalMutation that validates + creates one transfer per entry
- [x] T-004: Implement `triggerDisbursementBridge` — internalAction that orchestrates the batch (find → process each → return summary)
- [x] T-005: Implement `resetFailedEntry` — internalMutation to reset a failed entry back to pending for retry

### Chunk 02 — Transfer Effects + Cron Alert ✅
- [x] T-006: Modify `publishTransferConfirmed` to patch dispersal entry → `"disbursed"` with `payoutDate` when outbound `lender_dispersal_payout` confirms
- [x] T-007: Modify `publishTransferFailed` to patch dispersal entry → `"failed"` when `lender_dispersal_payout` transfer fails
- [x] T-008: Create `checkDisbursementsDue` internalMutation — daily alert that reports eligible entries count by lender
- [x] T-009: Register disbursement-due cron in `convex/crons.ts`

### Chunk 03 — Tests ✅
- [x] T-010: Unit tests for bridge helper functions (idempotency key builder, eligible entry filtering)
- [x] T-011: Integration test — happy path: pending entry → transfer created → confirmed → entry "disbursed" + LENDER_PAYOUT_SENT journal
- [x] T-012: Integration test — idempotency: running bridge twice for same entry produces one transfer
- [x] T-013: Integration test — disbursement gate: entry amount exceeding LENDER_PAYABLE rejected
- [x] T-014: Integration test — failed transfer: entry status becomes "failed"
- [x] T-015: Integration test — ENG-219 guard: bridge uses entry.amount as-is, does NOT recompute
