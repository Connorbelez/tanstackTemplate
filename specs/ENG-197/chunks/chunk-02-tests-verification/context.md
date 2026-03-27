# Chunk 2 Context: Tests and Verification

## Scope
Bring the regression tests in line with the bridge’s actual GT behavior and prove that transfer type derivation is correct without disturbing the existing collection-attempt cash path.

## Verbatim Context from the ENG-197 Implementation Plan
> **Missing Pieces**  
> - Reverse obligation->transfer type mapping (the FIXME)  
> - Dedicated test file for the bridge behavior  
> - No test verifying that the bridge transfer's D4 path doesn't create duplicate cash entries

> **Step 3: Write bridge integration tests**  
> Test cases:  
> 1. Confirmed collection attempt creates bridge transfer with correct `transferType` based on obligation type  
> 2. Idempotency: re-running `emitPaymentReceived` doesn't create duplicate transfer  
> 3. D4 conditional: bridge transfer's `publishTransferConfirmed` skips cash posting  
> 4. Transfer queryable by `collectionAttemptId` index  
> 5. Different obligation types produce correct transfer types (`regular_interest`, `late_fee`, etc.)  
> 6. All existing collection attempt tests pass unchanged

## Current Repo Reality to Correct in Tests
- `convex/payments/transfers/__tests__/bridge.test.ts` still models the bridge as if the inserted record is already `status: "confirmed"` with `confirmedAt` and `settledAt` set at insert time.
- The actual bridge flow in `convex/engine/effects/collectionAttempt.ts` inserts `status: "initiated"` and then calls `executeTransition(... FUNDS_SETTLED ...)` to reach `confirmed`.
- `convex/engine/effects/__tests__/transfer.test.ts` already documents the D4 branch: transfers with `collectionAttemptId` skip cash posting in `publishTransferConfirmed`.

## Constraints
- Keep tests aligned to actual production behavior instead of frozen historical assumptions.
- Favor deterministic unit coverage where possible; add targeted integration-style assertions only where the existing test infrastructure already supports them.
- Existing collection attempt tests must remain unchanged unless a direct assertion genuinely needs updated expectations.

## Quality Gate
After implementation:
1. `bunx convex codegen`
2. `bun check`
3. `bun typecheck`
