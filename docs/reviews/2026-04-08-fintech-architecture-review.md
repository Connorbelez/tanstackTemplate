# 2026-04-08 Fintech Architecture Review

## Worktree Context

- Repo: `fairlendapp`
- Branch reviewed: `04-04-active_mortgage_payment_system_08-15`
- HEAD reviewed: `8f77a4d9e`
- Review date: `2026-04-08`
- Review basis: current dirty worktree, including uncommitted migration changes
- Constraint applied: live code was treated as authoritative over older docs/specs

This branch is clearly mid-migration from legacy collection-attempt compatibility toward canonical transfer-owned provider flows. The reviewed implementation already moves important ownership into `transferRequests`, but several invariants are still enforced by sequencing and healing rather than by structure.

## Executive Summary

The branch is moving in the right architectural direction: provider-facing initiation is centered on `transferRequests`, reviewed governed entities still transition through `executeTransition`, and the cash-ledger write path remains meaningfully append-only through reversal/correction back-references. The strongest parts of the current design are the GT engine core in `convex/engine/transition.ts`, the obligation-to-mortgage lifecycle bridge in `convex/engine/effects/obligation.ts`, and the cash-ledger posting discipline in `convex/payments/cashLedger/postEntry.ts`.

The highest-risk gap is that confirmed inbound collection still depends on asynchronous effect execution plus a non-functional healing path rather than a structurally enforced synchronous invariant. A second architectural gap is that collection-plan execution still persists a business `collectionAttempt` before the canonical `transferRequest` link is guaranteed, which means the migration’s stated invariant is not yet fully locked. Reversal ownership is also still split between transfer and attempt paths for inbound collections, which preserves a boundary leak precisely where financial auditability matters most.

I did not find a direct runtime status-patch bypass for the reviewed governed entities (`transferRequests`, `collectionAttempts`, `obligations`, `mortgages`) in the reviewed files. The main problems are not blatant bypasses; they are incomplete ownership transfer, failure-window exposure, and operational dependence on healing that is currently placeholder-only.

## Areas Reviewed

- GT engine and machine registration:
  `convex/engine/transition.ts:102`
  `convex/engine/transitionMutation.ts:10`
  `convex/engine/machines/collectionAttempt.machine.ts:5`
  `convex/engine/machines/mortgage.machine.ts:8`
  `convex/engine/machines/obligation.machine.ts:17`
  `convex/engine/machines/transfer.machine.ts:5`
  `convex/engine/effects/registry.ts:8`
- Collection execution and transfer handoff:
  `convex/payments/collectionPlan/execution.ts:124`
- Attempt/transfer reconciliation:
  `convex/payments/transfers/collectionAttemptReconciliation.ts:140`
  `convex/engine/effects/collectionAttempt.ts:97`
  `convex/engine/effects/transfer.ts:98`
- Cash-ledger posting, reversal, and healing:
  `convex/payments/cashLedger/postEntry.ts:27`
  `convex/payments/cashLedger/integrations.ts:126`
  `convex/payments/cashLedger/transferReconciliation.ts:110`
  `convex/payments/cashLedger/transferReconciliationCron.ts:109`
- Schema and transfer-domain contract surface:
  `convex/schema.ts:791`
  `convex/schema.ts:905`
  `convex/schema.ts:1341`
  `convex/schema.ts:1673`
  `convex/payments/transfers/validators.ts:72`
  `convex/payments/transfers/interface.ts:1`
- Design / migration docs for drift comparison:
  `docs/architecture/unified-payment-rails-technical-design.md:1`
  `docs/technical-design/unified-payment-rails.md:1`
  `docs/superpowers/plans/2026-04-08-remove-legacy-attempts.md:1`

## Areas Not Deeply Reviewed

- Provider-specific webhook handlers beyond reversal flow, especially Rotessa/VoPay event normalization
- Admin/demo surfaces outside the transfer/attempt summary seam
- Full dispersal and payout execution stack beyond the transfer-side status handoff
- Test coverage quality outside files implicitly touched by the reviewed architecture

## Severity-Ranked Findings

### Critical

1. **Critical: confirmed inbound settlement still relies on asynchronous effect success, but the healing path is explicitly placeholder-only**

For attempt-linked inbound transfers, `publishTransferConfirmed` patches `settledAt`, transitions the linked attempt, and then deliberately skips transfer-owned cash posting when the attempt linkage exists (`convex/engine/effects/transfer.ts:110`, `convex/engine/effects/transfer.ts:113`, `convex/engine/effects/transfer.ts:122`, `convex/engine/effects/transfer.ts:125`). That means the actual ledger effect for borrower cash receipt is delegated to `emitPaymentReceived` on the collection-attempt side (`convex/engine/effects/collectionAttempt.ts:105`, `convex/engine/effects/collectionAttempt.ts:135`, `convex/engine/effects/obligationPayment.ts:68`).

Architecturally, that makes a confirmed transfer depend on later scheduled effects for the money posting invariant. The repo does detect the resulting orphan condition (`convex/payments/cashLedger/transferReconciliation.ts:110`, `convex/payments/cashLedger/transferReconciliation.ts:140`, `convex/payments/cashLedger/transferReconciliation.ts:271`), but the cron “healing” path does not actually retrigger settlement posting today. Its retry effect is a documented placeholder no-op (`convex/payments/cashLedger/transferReconciliationCron.ts:109`, `convex/payments/cashLedger/transferReconciliationCron.ts:121`, `convex/payments/cashLedger/transferReconciliationCron.ts:326`). In practice, the system can therefore reach `transfer=confirmed` plus `attempt=confirmed` without an authoritative cash posting, and the fallback is escalation rather than true repair.

This is the most important financial-correctness issue in the branch because the design intent says ledger posting is a consequence of confirmed settlement, but the live implementation still treats that consequence as asynchronously healable instead of structurally guaranteed.

### High

2. **High: collection-plan execution still persists transferless business attempts before the canonical transfer link exists**

`stagePlanEntryExecution` inserts a new `collectionAttempts` row and patches the plan entry to `executing` before any `transferRequest` exists (`convex/payments/collectionPlan/execution.ts:314`, `convex/payments/collectionPlan/execution.ts:343`). The canonical transfer is only created later, in the action phase, via `createTransferRequestInternal`, followed by a separate `recordTransferHandoffSuccess` patch back onto the attempt (`convex/payments/collectionPlan/execution.ts:617`, `convex/payments/collectionPlan/execution.ts:645`, `convex/payments/collectionPlan/execution.ts:674`).

That creates a real invariant gap between “business attempt exists” and “provider-facing transfer exists.” The migration plan explicitly says every executable attempt must be linked to a canonical transfer (`docs/superpowers/plans/2026-04-08-remove-legacy-attempts.md:5`, `docs/superpowers/plans/2026-04-08-remove-legacy-attempts.md:15`, `docs/superpowers/plans/2026-04-08-remove-legacy-attempts.md:62`), but the live flow still creates observable transferless attempts as an intermediate state.

The failure handling is also asymmetric. Generic handoff failures are degraded into attempt failure progression (`convex/payments/collectionPlan/execution.ts:720`, `convex/payments/collectionPlan/execution.ts:732`), but `MissingTransferRequestError` is rethrown without repair (`convex/payments/collectionPlan/execution.ts:684`, `convex/payments/collectionPlan/execution.ts:691`, `convex/payments/collectionPlan/execution.ts:716`). That leaves migration residue as a runtime escape hatch rather than a sealed invariant.

3. **High: reversal ownership for inbound collections is still split across `transferRequests` and `collectionAttempts`**

The migration plan says transfer requests should be the only provider-facing settlement and reversal record (`docs/superpowers/plans/2026-04-08-remove-legacy-attempts.md:5`, `docs/superpowers/plans/2026-04-08-remove-legacy-attempts.md:16`, `docs/superpowers/plans/2026-04-08-remove-legacy-attempts.md:17`). The live reversal path is cleaner than before, because webhook lookup is transfer-first (`convex/payments/webhooks/handleReversal.ts:41`, `convex/payments/webhooks/processReversal.ts:35`), but the actual reversal fan-out for inbound collections is still attempt-owned.

`publishTransferReversed` first mirrors reversal into the linked attempt (`convex/engine/effects/transfer.ts:595`), then skips transfer-owned cash reversal if the transfer is attempt-linked (`convex/engine/effects/transfer.ts:634`, `convex/engine/effects/transfer.ts:636`). The per-obligation reversal cascade is then executed from the collection-attempt effect/workflow side (`convex/engine/effects/collectionAttempt.ts:373`, `convex/engine/effects/collectionAttempt.ts:390`), and `postPaymentReversalCascade` still accepts either `attemptId` or `transferRequestId` as a first-class identifier (`convex/payments/cashLedger/integrations.ts:1340`, `convex/payments/cashLedger/integrations.ts:1380`).

This is not a pure transfer-owned reversal model yet. It is a transfer-triggered, attempt-executed reversal model. That may be temporarily acceptable during migration, but it remains a boundary leak between execution record, provider record, and financial journal semantics.

### Medium

4. **Medium: GT hash-chain guarantees are eventual, externalized, and can be disabled without any explicit warning in the GT path**

The GT transition engine claims Layer 2 audit chaining via `appendAuditJournalEntry` (`convex/engine/transition.ts:154`, `convex/engine/transition.ts:346`), but the implementation inserts into `auditJournal` first and then starts the hash-chain workflow asynchronously (`convex/engine/auditJournal.ts:10`, `convex/engine/hashChain.ts:106`, `convex/engine/hashChain.ts:117`). If GT hash chaining is disabled by environment variable, `startHashChain` returns silently with no warning and no compensating audit signal (`convex/engine/hashChain.ts:110`).

The cash-ledger side is better here: it also hashes asynchronously, but it at least emits an explicit warning when disabled (`convex/payments/cashLedger/hashChain.ts:157`, `convex/payments/cashLedger/hashChain.ts:163`). The net result is that the codebase has append-only journaling, but the stronger “hash-chained from the ground floor” claim is not currently a hard runtime guarantee for governed transitions.

5. **Medium: migration cleanliness is incomplete; legacy transfer statuses and compatibility language remain in live runtime contracts**

The migration plan explicitly calls for removing legacy statuses and transitional language (`docs/superpowers/plans/2026-04-08-remove-legacy-attempts.md:38`, `docs/superpowers/plans/2026-04-08-remove-legacy-attempts.md:39`, `docs/superpowers/plans/2026-04-08-remove-legacy-attempts.md:40`). The live schema and validators still accept `approved` and `completed` on `transferRequests` (`convex/schema.ts:1677`, `convex/schema.ts:1680`, `convex/payments/transfers/validators.ts:73`, `convex/payments/transfers/types.ts:137`), even though the actual transfer machine only models `initiated|pending|processing|confirmed|failed|cancelled|reversed` (`convex/engine/machines/transfer.machine.ts:42`).

The canonical provider contract file also still describes legacy `PaymentMethod` compatibility in its top-level guidance (`convex/payments/transfers/interface.ts:2`, `convex/payments/transfers/interface.ts:9`), and the main design docs still point readers at deleted `convex/payments/methods/*` files as part of the “current baseline” (`docs/architecture/unified-payment-rails-technical-design.md:18`, `docs/technical-design/unified-payment-rails.md:21`, `docs/technical-design/unified-payment-rails.md:95`).

For an active payment-rails migration, this is more than documentation debt. It leaves multiple “truths” about what is canonical, which raises the risk of future patches reintroducing compatibility paths that the branch is trying to remove.

6. **Medium: lifecycle timestamps are not structurally maintained for reviewed transfer/attempt state changes**

The reviewed admin and reconciliation code expects lifecycle timestamps like `confirmedAt`, `failedAt`, and `reversedAt` (`convex/payments/collectionPlan/admin.ts:321`, `convex/payments/collectionPlan/admin.ts:391`, `convex/payments/cashLedger/transferReconciliation.ts:124`). `publishTransferFailed` and `publishTransferReversed` do stamp failure/reversal timestamps (`convex/engine/effects/transfer.ts:386`, `convex/engine/effects/transfer.ts:590`), but `publishTransferConfirmed` only patches `settledAt`, not `confirmedAt` (`convex/engine/effects/transfer.ts:103`, `convex/engine/effects/transfer.ts:111`), and I did not find a corresponding reviewed path that stamps `collectionAttempts.confirmedAt` either.

This is not the top financial risk because settlement time still exists, but it is lifecycle drift inside the source of truth. The reconciliation code already compensates by falling back to creation time and logging warnings (`convex/payments/cashLedger/transferReconciliation.ts:124`, `convex/payments/cashLedger/transferReconciliation.ts:127`), which is a sign the runtime contract is not fully aligned with the schema.

### Low

7. **Low: the core docs are materially stale relative to the live branch**

Both unified-payment-rails design documents remain useful historical context, but they still describe deleted compatibility files as present-day baseline architecture (`docs/architecture/unified-payment-rails-technical-design.md:16`, `docs/architecture/unified-payment-rails-technical-design.md:18`, `docs/technical-design/unified-payment-rails.md:20`, `docs/technical-design/unified-payment-rails.md:93`). Because this branch is already mid-migration, those docs now understate the amount of transfer-domain ownership already in place while overstating the remaining role of `PaymentMethod`.

This is low severity by itself, but it materially increases the chance of architectural backsliding during parallel work.

## Boundary Assessment Table

| Boundary | Intended Owner | Live Assessment | Notes |
| --- | --- | --- | --- |
| `CollectionPlan -> CollectionAttempt` | Collection plan decides when to execute; attempt becomes execution record | Mostly sound, but non-atomic | `collectionPlanEntries` create `collectionAttempts` cleanly, but the attempt is persisted before canonical transfer linkage exists (`convex/payments/collectionPlan/execution.ts:314`). |
| `CollectionAttempt -> TransferRequest` | Attempt should hand off provider-facing ownership to transfer | Leaky | Linkage is required by design but still repaired after the fact through separate mutation/action phases (`convex/payments/collectionPlan/execution.ts:645`, `convex/payments/collectionPlan/execution.ts:674`). |
| `TransferRequest -> Cash Ledger` | Transfer confirmation/reversal should deterministically own journal side-effects | Weak for inbound attempt-linked flows | Inbound attempt-linked transfers skip transfer-owned cash posting and depend on attempt-side effects plus cron detection (`convex/engine/effects/transfer.ts:122`, `convex/payments/cashLedger/transferReconciliationCron.ts:109`). |
| `CollectionAttempt -> Cash Ledger` | Attempt should provide traceability, not journal meaning | Mostly sound | The reviewed cash posting derives account meaning from obligations/transfer type, not from attempt strategy state (`convex/engine/effects/collectionAttempt.ts:101`, `convex/engine/effects/obligationPayment.ts:60`). |
| `Obligation -> Mortgage` | Obligation state should be the only mortgage lifecycle bridge for payment events | Sound | The reviewed code explicitly routes mortgage lifecycle changes through obligation effects, not plan-entry or attempt code (`convex/engine/effects/obligation.ts:87`, `convex/engine/effects/obligation.ts:99`). |
| `TransferRequest <-> CollectionAttempt` reversal ownership | Transfer should be canonical provider/reversal record | Still split | Webhook lookup is transfer-first, but inbound reversal execution still flows through collection-attempt reversal cascade (`convex/payments/webhooks/processReversal.ts:35`, `convex/engine/effects/collectionAttempt.ts:390`). |
| Governed state changes | `executeTransition` should own status changes for governed entities | Sound in reviewed runtime files | I did not find a direct runtime status patch bypass for reviewed governed entities. Creation-time inserts and non-governed tables still patch status directly by design. |
| Cash ledger append-only discipline | Journal rows should never be mutated in place; reversals/corrections should compensate | Sound | `postCashEntryInternal` inserts entries; reversals/corrections require `causedBy`; reviewed code did not patch existing cash journal rows (`convex/payments/cashLedger/postEntry.ts:141`, `convex/payments/cashLedger/postEntry.ts:178`, `convex/payments/cashLedger/integrations.ts:1468`). |

## Prioritized Recommendations

1. Make canonical transfer linkage atomic with attempt creation.
   Either create the `transferRequest` in the same mutation as `collectionAttempt`, or introduce a non-executable pre-attempt staging state that cannot progress until `transferRequestId` exists.

2. Replace placeholder transfer-healing with a real repair path, or move the invariant back into the synchronous confirmation path.
   A confirmed inbound settlement should not rely on a cron that explicitly does nothing today.

3. Collapse inbound reversal cash posting onto one canonical owner.
   Either keep transfer as the sole reversal orchestrator and make the ledger cascade transfer-scoped, or explicitly codify attempt as a subordinate execution object and stop presenting transfer as the sole reversal record for inbound collections.

4. Finish the migration cleanup now while the project is still greenfield.
   Remove legacy transfer statuses from schema/validators, strip `PaymentMethod` compatibility language from transfer-domain contracts, and update the unified-payment-rails docs so they describe the live architecture rather than deleted files.

5. Promote audit guarantees from “best effort” to explicit operational contract.
   Emit warnings when GT hash chaining is disabled, add observable failure metrics for both GT and cash-ledger hash-chain workflows, and document whether settlement is allowed to succeed when hash-chain persistence is unavailable.

6. Add architecture-level tests for the real invariants.
   Minimum cases:
   `confirmed transfer -> journal exists`
   `attempt-linked inbound reversal -> no dual-posting`
   `attempt cannot exist in executable state without transferRequestId`
   `confirmed/reversed lifecycle timestamps are stamped consistently`
