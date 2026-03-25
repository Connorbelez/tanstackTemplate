# ENG-165: Cross-system reconciliation (transfers ↔ journal entries)

## Master Task List

### Chunk 1: Schema & Types
- [x] T-001: Extend `transferRequests` schema with reconciliation-required fields (direction, amount, transferType, mortgageId, obligationId, lenderId, borrowerId, dispersalEntryId, confirmedAt, reversedAt) and add `confirmed`/`reversed` to status union + indexes
- [x] T-002: Create `transferHealingAttempts` table following `dispersalHealingAttempts` pattern (transferRequestId, attemptCount, lastAttemptAt, escalatedAt, status, createdAt + indexes)
- [x] T-003: Create transfer reconciliation item types in `transferReconciliation.ts` (OrphanedConfirmedTransferItem, OrphanedReversedTransferItem, StaleOutboundTransferItem, TransferAmountMismatchItem)
- [x] T-004: Create transfer healing types in `transferHealingTypes.ts` (TransferHealingCandidate, TransferHealingResult, MAX_TRANSFER_HEALING_ATTEMPTS)
- [x] T-005: Run `bunx convex codegen` and `bun typecheck` to verify schema changes

### Chunk 2: Check Functions
- [x] T-006: Implement `checkOrphanedConfirmedTransfers(ctx, options?)` — query confirmed transfers, check for matching journal entry by `by_transfer_request` index + entry type, return `ReconciliationCheckResult<OrphanedConfirmedTransferItem>`
- [x] T-007: Implement `checkOrphanedReversedTransfers(ctx, options?)` — query reversed transfers, check for REVERSAL journal entry by transferRequestId, return `ReconciliationCheckResult<OrphanedReversedTransferItem>`
- [x] T-008: Implement `checkStaleOutboundTransfers(ctx, options?)` — query confirmed outbound transfers, check linked dispersalEntry status, return `ReconciliationCheckResult<StaleOutboundTransferItem>`
- [x] T-009: Implement `checkTransferAmountMismatches(ctx, options?)` — for confirmed transfers with matching journal entries, compare amounts, return `ReconciliationCheckResult<TransferAmountMismatchItem>`
- [x] T-010: Integrate all 4 checks into `runFullReconciliationSuite` in reconciliationSuite.ts

### Chunk 3: Self-Healing Cron & Query Endpoints
- [x] T-011: Implement `findOrphanedConfirmedTransfersForHealing` internalQuery — find confirmed transfers without journal entries, filter out already-escalated
- [x] T-012: Implement `retriggerTransferConfirmation` internalMutation — retry (re-schedule publishTransferConfirmed) or escalate to SUSPENSE after 3 attempts
- [x] T-013: Implement `transferReconciliationCron` internalAction — orchestrate find → retry/escalate loop with logging and audit trail
- [x] T-014: Wire `transferReconciliationCron` into `convex/crons.ts` at 15-minute interval
- [x] T-015: Add public query endpoints for all 4 transfer checks in `reconciliationQueries.ts`

### Chunk 4: Tests
- [x] T-016: Add test utilities — `createConfirmedTransfer`, `createReversedTransfer`, `createOutboundTransfer` helpers in testUtils.ts
- [x] T-017: Test `checkOrphanedConfirmedTransfers` — healthy (matching entry exists) + orphaned (no entry) scenarios
- [x] T-018: Test `checkOrphanedReversedTransfers` — healthy (REVERSAL entry exists) + orphaned scenarios
- [x] T-019: Test `checkStaleOutboundTransfers` — healthy (dispersal completed) + stale (dispersal still pending) scenarios
- [x] T-020: Test `checkTransferAmountMismatches` — matching amounts + mismatched amounts
- [x] T-021: Test self-healing retry logic (retrigger up to 3 times) and SUSPENSE escalation after 3 failures
- [x] T-022: Run `bun check`, `bun typecheck`, `bunx convex codegen` final quality gate
