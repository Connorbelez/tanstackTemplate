# Chunk 4 Context: Outbound & Multi-Leg Integration Tests

## Goal
Test outbound disbursement flows and multi-leg deal closing transfer scenarios, focusing on financial safety invariants: failed outbound must not lose money, and partial multi-leg success must leave funds in trust.

## Dispersal → Disbursement Bridge

### Current Architecture
1. Obligation settles → `emitObligationSettled` effect fires
2. Effect schedules `createDispersalEntries` with `{ mortgageId, obligationId, settledAmount, settledDate }`
3. `createDispersalEntries` computes per-lender pro-rata shares based on ownership positions
4. Creates `dispersalEntries` records with `status: "pending"`

### Future Bridge (not yet implemented — test the concept)
The Dispersal → Disbursement bridge would:
1. Read pending dispersal entries
2. Create outbound TransferRequests (type: `lender_dispersal_payout`)
3. On transfer confirmation → patch dispersalEntry.status = "disbursed"

**Since this bridge is not yet implemented**, T-015 should test:
- Creating an outbound transfer manually linked to a dispersal entry
- Verifying the transfer goes through GT lifecycle
- Verifying cash ledger posting (LENDER_PAYOUT_SENT)

## Dispersal Engine

**File:** `convex/dispersal/createDispersalEntries.ts`

Key logic:
- `resolvePaymentMethodFromCollection(ctx, obligationId)` — walks collectionPlanEntries→collectionAttempts to find method
- Pro-rata share calculation based on `currentPositions` (from ownership ledger)
- Servicing fee deduction from servicing rate × principal basis
- Hold period calculation (lenders with recent transactions may have hold periods)

### dispersalEntries schema fields:
```
lenderId, lenderAccountId, mortgageId, obligationId, amount, status,
ownershipPercentage, paymentMethod, dispersalDate, holdUntil?, ...
```

## Failed Outbound Transfer — Money Safety

**Key invariant:** If an outbound transfer fails, the LENDER_PAYABLE account must remain intact. No money is lost.

Test flow:
1. Create outbound transfer (type: `lender_dispersal_payout`, status: `initiated`)
2. Transition to `pending` via PROVIDER_INITIATED
3. Fire TRANSFER_FAILED event
4. Verify: NO cash ledger entry created (failed transfers don't post)
5. Verify: LENDER_PAYABLE balance unchanged (if we can query it)
6. Verify: Transfer record has failureCode and failureReason set

## Multi-Leg Deal Closing

### Architecture (from PaymentRailsSpec)
```
Deal enters fundsTransfer → Transfer Pipeline triggers

Leg 1: Buyer → Trust (inbound, deal_principal_transfer)
  - Creates TransferRequest with pipelineId, legNumber: 1
  - On confirmation: CASH_RECEIVED (debit TRUST_CASH, credit CASH_CLEARING)

Leg 2: Trust → Seller (outbound, deal_seller_payout)
  - Only triggered AFTER Leg 1 confirms
  - Creates TransferRequest with same pipelineId, legNumber: 2
  - On confirmation: LENDER_PAYOUT_SENT (debit LENDER_PAYABLE, credit TRUST_CASH)

Both legs confirm → FUNDS_RECEIVED event on deal machine → fundsTransfer → confirmed
```

### Leg 1 Success + Leg 2 Failure Scenario
1. Leg 1 transfer: initiated → confirmed (CASH_RECEIVED posted)
2. Leg 2 transfer: initiated → pending → TRANSFER_FAILED
3. Result: Buyer funds are in TRUST_CASH. No payout to seller.
4. Deal stays in `fundsTransfer` state (FUNDS_RECEIVED never fires)
5. Admin must manually resolve

**Since the full multi-leg pipeline may not be implemented yet**, T-017 should test:
- Create two transfers with shared pipelineId + legNumber 1 and 2
- Confirm Leg 1 → verify CASH_RECEIVED posted
- Fail Leg 2 → verify NO LENDER_PAYOUT_SENT posted
- Verify Leg 1's cash entry still exists (not reversed by Leg 2 failure)
- Verify deal does NOT transition to confirmed

## Manual Outbound Transfer

Test the direct manual outbound path:
1. Create outbound transfer (type: `lender_dispersal_payout`, providerCode: `manual`)
2. Confirm via `confirmManualTransfer`
3. Verify: FUNDS_SETTLED → confirmed
4. Verify: `publishTransferConfirmed` posts LENDER_PAYOUT_SENT
5. Verify: Journal entry has correct debit (LENDER_PAYABLE) and credit (TRUST_CASH)

## Deal Closing Effects

**File:** `convex/engine/effects/dealClosingPayments.ts` — `updatePaymentSchedule`

This effect fires when a deal reaches confirmed state. It creates `dealReroutes` records for future payment dispersal redirection.

## Test Setup Requirements

Seeding needs:
1. All base entities (users, broker, borrower, lender, property, mortgage)
2. Ownership positions (for dispersal calculation)
3. Cash ledger accounts (TRUST_CASH, LENDER_PAYABLE, CASH_CLEARING)
4. Deal records (for multi-leg tests)

## Test Output Files
- `convex/payments/transfers/__tests__/outboundFlow.integration.test.ts`

## Key Invariants to Verify
1. **Failed outbound = zero money movement**: No cash ledger entry created for failed transfers
2. **Partial multi-leg = funds in trust**: Leg 1 success + Leg 2 failure leaves TRUST_CASH holding the funds
3. **Outbound confirmation = LENDER_PAYOUT_SENT**: Correct entry type and account families
4. **Pipeline linking**: Multi-leg transfers share pipelineId and have sequential legNumbers
