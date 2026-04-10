# 04. Reconcile Collection Attempts with Transfer Execution and Cash Posting — Gap Analysis

Re-fetched against the canonical Notion sources on 2026-04-03:

- Spec: `https://www.notion.so/337fc1b4402481a48a13ee61e289e8f0`
- Linked plan: `https://www.notion.so/337fc1b4402481658522e53977e06633`

## Verdict

Page 04 is implemented for the canonical inbound reconciliation path described in
the current Notion spec and linked implementation plan.

The codebase now reconciles attempt-linked inbound transfer confirmations,
failures, cancellations, and reversals back into Collection Attempt governed
transitions, keeps obligation application and borrower cash posting owned by the
attempt consequence path, and updates transfer-health detection so canonical
attempt-owned journals count as healthy evidence instead of bridge-era
exceptions. Browser e2e was intentionally not added because the delivery surface
for this page is backend settlement orchestration and reconciliation behavior.

## Coverage Matrix

| Spec item | Status | Evidence |
| --- | --- | --- |
| Transfer lifecycle outcomes reconcile to the linked Collection Attempt | Implemented | `convex/payments/transfers/collectionAttemptReconciliation.ts`, `convex/engine/effects/transfer.ts`, `convex/engine/machines/transfer.machine.ts` |
| Confirmed inbound collections produce one business settlement outcome | Implemented | `publishTransferConfirmed` now delegates attempt-linked inbound business meaning to the Collection Attempt path and skips duplicate inbound cash posting in `convex/engine/effects/transfer.ts` |
| Obligation application remains downstream of the Collection Attempt boundary | Implemented | confirmed attempt-linked inbound settlement still flows through `emitPaymentReceived`; transfer modules no longer own obligation semantics for that path |
| Borrower cash posting occurs exactly once for attempt-linked inbound collections | Implemented | attempt-owned settlement health uses `cash-receipt:${attemptId}` evidence in `convex/payments/transfers/collectionAttemptReconciliation.ts`; confirmed transfer effects avoid creating a second inbound cash story |
| Settlement-layer modules do not require plan-entry awareness | Implemented | reconciliation uses stable `collectionAttemptId` / posting-group linkage rather than plan-entry strategy semantics |
| Failed and cancelled inbound transfers remain durable and auditable | Implemented | `reconcileAttemptLinkedInboundFailure` and `reconcileAttemptLinkedInboundCancellation` patch provider status and drive governed attempt events |
| Reversals cascade once and preserve downstream corrective behavior | Implemented | `reconcileAttemptLinkedInboundReversal` routes transfer reversals into attempt reversal; reversal health now checks attempt-owned reversal posting groups |
| Legacy bridge behavior is compatibility-only, not canonical | Implemented | `emitPaymentReceived` already skips bridge creation when `transferRequestId` exists; canonical tests validate the attempt-linked transfer path while bridge-era wording was relabeled |
| Reconciliation and healing logic reflect the canonical path | Implemented with residual compatibility note | `convex/payments/cashLedger/transferReconciliation.ts` and `convex/payments/transfers/reconciliation.ts` now validate attempt-owned settlement/reversal consequences before classifying attempt-linked inbound transfers as healthy or orphaned |
| Integration coverage proves the canonical inbound path | Implemented | `convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts`, `convex/payments/cashLedger/__tests__/transferReconciliation.test.ts`, transfer-machine/effect/handler regression suites |

## Use Case Coverage

| Use case | Status | Evidence |
| --- | --- | --- |
| UC-1: Provider-settled inbound transfer confirms the originating Collection Attempt | Implemented | `collectionAttemptReconciliation.integration.test.ts` proves transfer confirmation settles the linked attempt once and leaves inbound cash posting on the attempt-owned path |
| UC-2: Failed or cancelled transfer execution feeds durable attempt failure semantics | Implemented | failure and cancellation integration coverage proves no confirmed-money side effects and durable attempt lifecycle updates |
| UC-3: Reversed inbound transfer triggers one attempt reversal and one ledger repair cascade | Implemented | reversal integration coverage plus attempt-owned reversal health checks in transfer reconciliation |
| UC-4: Legacy bridge-era inbound behavior is retired or fenced | Implemented with compatibility scope | bridge-era reconciliation tests were relabeled away from canonical-path claims and `emitPaymentReceived` bridge creation remains fenced behind missing-link compatibility logic |

## Key Design Outcomes Verified

- A dedicated transfer-to-attempt reconciliation coordinator now owns the
  attempt-linked inbound mapping seam.
- Transfer confirmation, failure, cancellation, and reversal all route through
  the same attempt-owned business boundary for inbound collections.
- Confirmed inbound transfer effects no longer create a second business cash
  meaning when a transfer is linked to a Collection Attempt.
- Transfer-health detection now treats attempt-owned `CASH_RECEIVED` and
  `REVERSAL` posting groups as canonical evidence for attempt-linked inbound
  transfers.
- Cancellation is now a first-class transfer-machine effect path instead of a
  transfer-only terminal state with no attempt reconciliation.

## Intentional Scope Boundaries Preserved

- Page 04 remains backend-only.
- No route or UI work was added.
- No broader schema normalization was introduced; the existing attempt/transfer
  linkage was sufficient for this page.
- Unified Payment Rails still owns transfer execution facts; AMPS still owns the
  business execution record and its downstream consequences.

## Residual Notes

1. The bridge-era `emitPaymentReceived` transfer creator still exists as an
   explicit compatibility path when an older attempt lacks a linked
   `transferRequestId`. Page 04 fences it and removes its canonical status, but
   does not fully delete that compatibility code.
2. The cash-ledger reconciliation cron still carries the existing
   `pending_no_effect` placeholder retry result for unresolved confirmed-transfer
   healing. Page 04 updates canonical detection and health classification, but
   does not add a brand-new automated repair executor for every unhealthy case.
3. GitNexus impact analysis partially resolved the touched surface:
   `reconcileTransfer` resolved with `LOW` risk, while some effect exports were
   not directly resolvable in the current index. Final scope verification used
   `detect_changes(scope="all")` plus direct diff review for the remaining
   symbols.

## Verification Evidence

- `bun run test convex/engine/effects/__tests__/transfer.test.ts convex/payments/transfers/__tests__/handlers.integration.test.ts convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts convex/payments/transfers/__tests__/transferMachine.test.ts convex/engine/machines/__tests__/transfer.machine.test.ts convex/payments/transfers/__tests__/reconciliation.test.ts convex/payments/cashLedger/__tests__/transferReconciliation.test.ts`
- `bun check`
- `bun typecheck`
- `bunx convex codegen`
- GitNexus `detect_changes(scope="all")` reported `risk_level: low` for repo `fairlendapp`

## Final Assessment

No blocking gaps remain for the page-04 objective. The production inbound
reconciliation story is now coherent: Collection Attempts remain the business
execution record, Unified Payment Rails remains the transfer execution record,
attempt-linked inbound settlement and reversal consequences are single-owned,
and the canonical path is covered by backend integration tests aligned to the
current Notion spec as of 2026-04-03.
