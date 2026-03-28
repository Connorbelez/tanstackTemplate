# Chunk 01 — Bridge Core Module

## Tasks

- [ ] T-001: Create `convex/dispersal/disbursementBridge.ts` with types, interfaces, and helper functions
- [ ] T-002: Implement `findEligibleEntriesInternal` — internalQuery that finds pending entries past hold period
- [ ] T-003: Implement `processSingleDisbursement` — internalMutation that validates + creates one transfer per entry
- [ ] T-004: Implement `triggerDisbursementBridge` — internalAction that orchestrates the batch
- [ ] T-005: Implement `resetFailedEntry` — internalMutation to reset a failed entry back to pending for retry
