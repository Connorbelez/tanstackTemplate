# Chunk 2 Context: Cash Ledger Bridge Mapping & Webhook Tests

## Goal
Test that the cash ledger bridge correctly maps every transfer type to the right journal entry type and account families. Test webhook deduplication and reconciliation logic.

## Transfer Type → Cash Entry Type Mapping (from PaymentRailsSpec)

### Inbound (obligation-backed) → CASH_RECEIVED
| Transfer Type | Entry Type | Debit | Credit |
|---|---|---|---|
| borrower_interest_collection | CASH_RECEIVED | TRUST_CASH | BORROWER_RECEIVABLE |
| borrower_principal_collection | CASH_RECEIVED | TRUST_CASH | BORROWER_RECEIVABLE |
| borrower_late_fee_collection | CASH_RECEIVED | TRUST_CASH | BORROWER_RECEIVABLE |
| borrower_arrears_cure | CASH_RECEIVED | TRUST_CASH | BORROWER_RECEIVABLE |

### Inbound (non-obligation) → CASH_RECEIVED with different credit
| Transfer Type | Entry Type | Debit | Credit |
|---|---|---|---|
| locking_fee_collection | CASH_RECEIVED | TRUST_CASH | UNAPPLIED_CASH |
| commitment_deposit_collection | CASH_RECEIVED | TRUST_CASH | UNAPPLIED_CASH |
| deal_principal_transfer | CASH_RECEIVED | TRUST_CASH | CASH_CLEARING |

### Outbound → LENDER_PAYOUT_SENT
| Transfer Type | Entry Type | Debit | Credit |
|---|---|---|---|
| lender_dispersal_payout | LENDER_PAYOUT_SENT | LENDER_PAYABLE | TRUST_CASH |
| lender_principal_return | LENDER_PAYOUT_SENT | LENDER_PAYABLE | TRUST_CASH |
| deal_seller_payout | LENDER_PAYOUT_SENT | LENDER_PAYABLE | TRUST_CASH |

### Reversal (any type)
| Event | Entry Type | Debit | Credit |
|---|---|---|---|
| TRANSFER_REVERSED | REVERSAL | Mirror of original credit | Mirror of original debit |

## Cash Ledger Integration Functions

**File:** `convex/payments/cashLedger/integrations.ts`

Key functions:
- `postCashReceiptForTransfer(ctx, args)` — inbound transfers → CASH_RECEIVED entry
- `postLenderPayoutForTransfer(ctx, args)` — outbound transfers → LENDER_PAYOUT_SENT entry
- `postTransferReversal(ctx, args)` — reversed transfers → REVERSAL entry

These functions call `postCashEntryInternal()` which is the 9-step validated pipeline.

## Idempotency Key Convention

Format: `cash-ledger:{entry-type}:{source-type}:{source-id}`
- Transfer cash receipt: `cash-ledger:cash-received:transfer:{transferRequestId}`
- Transfer payout: `cash-ledger:lender-payout-sent:transfer:{transferRequestId}`
- Transfer reversal: `cash-ledger:reversal:transfer:{transferRequestId}`

## Cash Ledger Types

**File:** `convex/payments/cashLedger/types.ts`

Entry types:
- `CASH_RECEIVED` — inbound money
- `LENDER_PAYOUT_SENT` — outbound to lender
- `REVERSAL` — compensating entry
- `CORRECTION` — manual adjustment
- `WAIVER` — write-off

Account families: `TRUST_CASH`, `BORROWER_RECEIVABLE`, `LENDER_PAYABLE`, `CASH_CLEARING`, `UNAPPLIED_CASH`, `SUSPENSE`, `CONTROL`

## Webhook Pipeline

The MockTransferProvider's `simulateWebhook()` produces a `MockWebhookPayload` with:
- `mappedTransferEvent`: `FUNDS_SETTLED` | `TRANSFER_FAILED` | `TRANSFER_REVERSED`
- `providerEventId`: unique event ID for deduplication
- `transactionId`: providerRef linking to transfer

In real usage, the webhook handler:
1. Receives HTTP POST at `/webhooks/{providerCode}`
2. Verifies signature
3. Looks up transfer by `providerCode + providerRef`
4. Fires GT event (FUNDS_SETTLED / TRANSFER_FAILED / TRANSFER_REVERSED)
5. GT effect handler runs (publishTransferConfirmed → cash posting)

For testing, we simulate this by:
1. Creating a transfer in `initiated` or `pending` state
2. Using MockTransferProvider.simulateWebhook() to get the payload
3. Feeding the event through `executeTransition()` on the transfer entity
4. Verifying the downstream effect (cash posting or skip)

## Reconciliation Logic

**File:** `convex/payments/transfers/reconciliation.ts`

Key functions:
- `isFreshTransfer(transfer, now)` — true if transfer confirmed within 5 minutes (FRESHNESS_THRESHOLD_MS = 300_000)
- Orphan detection: confirmed transfers with no matching cash_ledger_journal_entry after freshness threshold
- Healing: re-schedule the publishTransferConfirmed effect
- Escalation: after MAX_HEALING_ATTEMPTS (3), escalate to manual intervention

**Existing test:** `convex/payments/transfers/__tests__/reconciliation.test.ts` — tests isFreshTransfer boundary conditions. Extend, don't replace.

## Test Output Files
- `convex/payments/transfers/__tests__/cashLedgerMapping.test.ts` — transfer type → entry mapping
- `convex/payments/transfers/__tests__/webhookPipeline.test.ts` — webhook simulation through GT

## Existing Tests NOT to Modify
- `convex/payments/cashLedger/__tests__/*` — 35+ existing cash ledger tests are comprehensive
- `convex/payments/transfers/__tests__/reconciliation.test.ts` — extend, don't replace
- `convex/payments/transfers/__tests__/bridge.test.ts` — bridge shape tests already complete

## Test Harness Pattern
Use the established `convex-test` harness pattern:
```typescript
import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import schema from "../../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

function createHarness() {
  process.env.DISABLE_GT_HASHCHAIN = "true";
  const t = convexTest(schema, modules);
  auditLogTest.register(t, "auditLog");
  return t;
}
```
