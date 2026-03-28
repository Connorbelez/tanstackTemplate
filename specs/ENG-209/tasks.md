# ENG-209: Implement Commitment Deposit Collection Flow

## Master Task List

### Chunk 1: Deposit Collection Orchestrator + Admin Trigger + Effect Extension + Tests

- [x] T-001: Create `convex/payments/transfers/depositCollection.ts` orchestrator
  - Export `collectCommitmentDeposit()` function
  - Accepts config: `{ dealId?, applicationId?, borrowerId, mortgageId, amount, providerCode }`
  - Calls `createTransferRequestInternal` with direction=inbound, transferType=commitment_deposit_collection
  - Calls `initiateTransferInternal` to kick off the provider
  - Idempotency key: `commitment-deposit:{dealId ?? applicationId}`
  - Source: `{ actorType: 'system', channel: 'commitment_deposit_collection' }`
  - Stores applicationId in metadata if provided

- [x] T-002: Add `collectCommitmentDepositAdmin` action in mutations.ts
  - Use `paymentAction` builder (requires payment:manage permission)
  - Args: dealId (optional id), applicationId (optional string), borrowerId (id), mortgageId (id), amount (number), providerCode (optional providerCodeValidator)
  - Validates amount is positive integer
  - Calls `collectCommitmentDeposit()` orchestrator
  - Phase 1 fallback: admin triggers deposit collection manually

- [x] T-003: Extend `publishTransferConfirmed` in `convex/engine/effects/transfer.ts`
  - After `handlePipelineLegConfirmed`, add commitment deposit condition progression stub
  - When `transfer.transferType === 'commitment_deposit_collection'`: log that offer condition progression is pending
  - Include TODO comment for when offer condition system exists: fire SYSTEM_VERIFIED event

- [x] T-004: Create `convex/payments/transfers/__tests__/depositCollection.test.ts`
  - Test: `collectCommitmentDeposit` config shape validation
  - Test: Idempotency key format follows `commitment-deposit:{id}` pattern
  - Test: Source has correct actorType and channel
  - Test: applicationId stored in metadata when provided
  - Test: No obligationId set (deposit is not obligation-backed)
  - Test: Amount validation rejects non-positive values
  - Test: Transfer type is commitment_deposit_collection
  - Test: Direction is inbound

- [x] T-005: Run quality gate: `bun check && bun typecheck && bunx convex codegen`
