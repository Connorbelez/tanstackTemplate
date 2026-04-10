# 04. Reconcile Collection Attempts with Transfer Execution and Cash Posting — Design

> Derived from: https://www.notion.so/337fc1b4402481a48a13ee61e289e8f0

## Types & Interfaces

### Existing domain records stay authoritative
The current page-03 surfaces remain the authoritative roots of the production
flow:
- `collectionAttempts` are the AMPS business execution records
- `transferRequests` are the Unified Payment Rails execution records
- `cash_ledger_journal_entries` remain the single money-posting evidence layer

Page 04 should reconcile those records rather than introduce a parallel inbound
execution record.

### Proposed reconciliation coordinator contract
The cleanest seam is a dedicated internal reconciliation helper or module that
accepts transfer outcomes and resolves them into attempt-owned business
transitions.

Planned contract shape:
- input
  - `transferId`
  - transfer outcome type such as `confirmed`, `failed`, `cancelled`, or `reversed`
  - canonical payload fields already emitted by Payment Rails such as
    `settledAt`, `reason`, `reversalRef`, and `effectiveDate`
  - `source`
- output
  - whether a linked `collectionAttemptId` existed
  - whether a Collection Attempt transition was fired
  - attempt state before and after reconciliation
  - whether downstream money or reversal consequences were attempt-owned

This coordinator should be called by transfer lifecycle entrypoints rather than
making transfer effects directly own business-layer semantics.

### Canonical ownership split
- Unified Payment Rails owns:
  - `TransferRequest`
  - provider initiation
  - provider callbacks
  - transfer state machine transitions
  - transfer settlement and reversal facts
- AMPS owns:
  - `CollectionAttempt`
  - business confirmation and reversal meaning
  - obligation application
  - borrower cash posting consequences

## Database Schema

### Existing schema is likely sufficient for the first page-04 pass
The current linkage already exists:
- `collectionAttempts.transferRequestId`
- `transferRequests.collectionAttemptId`
- `transferRequests.planEntryId`
- transfer and attempt status fields plus audit timestamps

The default plan is to avoid new tables or broad schema changes unless the code
review shows a missing audit or idempotency field. Page 11 is the correct place
for broader schema convergence.

### Reconciliation-specific expectations
- attempt-linked inbound transfers should not require a transfer-owned
  `CASH_RECEIVED` journal
- the canonical inbound journal should be discoverable through
  `attemptId`-scoped or posting-group-scoped ledger entries
- reversal lookup must remain idempotent whether it starts from
  `attemptId` or `transferRequestId`

## Architecture

### Data Flow
`collectionPlan.executePlanEntry`
-> `collectionAttempts` created and linked to `transferRequests`
-> provider initiation advances transfer state
-> later transfer lifecycle event confirms, fails, cancels, or reverses transfer
-> transfer lifecycle entrypoint delegates to a reconciliation coordinator
-> coordinator fires governed `collectionAttempt` transition when linked
-> `emitPaymentReceived` or `emitPaymentReversed` remains the attempt-owned
   consequence path
-> obligation application and cash-ledger repair occur once

### Component Structure
No frontend component work is expected for the initial page-04 implementation.
The main code will likely live in:
- `convex/engine/effects/transfer.ts`
- a new or expanded internal reconciliation helper near
  `convex/payments/collectionPlan/` or `convex/payments/transfers/`
- `convex/engine/effects/collectionAttempt.ts`
- `convex/payments/transfers/reconciliation.ts`
- relevant integration tests under transfer, cash-ledger, and cross-entity suites

### API Surface

#### Reads (Queries/GET)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| existing transfer query helpers | `transferId` | transfer record | Load the linked transfer and attempt references for reconciliation |
| existing attempt/plan-entry loaders or small internal helper | `attemptId` | attempt context | Support attempt-owned settlement and reversal consequences |

#### Writes (Mutations/POST)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| new transfer-to-attempt reconciliation helper | transfer outcome payload | reconciliation result | Translate transfer lifecycle facts into Collection Attempt GT events |
| existing `executeTransition` on `collectionAttempt` | attempt id + event payload | GT transition result | Preserve attempt-state ownership inside AMPS |
| refined attempt effects | effect payload | side effects | Keep obligation application, overpayment handling, and reversal repair in the attempt-owned layer |

#### Side Effects (Actions/Jobs)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `publishTransferConfirmed` | transfer effect args | void | Settlement-layer entrypoint that must reconcile attempt-linked transfers without double cash posting |
| `publishTransferFailed` and manual cancellation paths | transfer effect args | void | Failure or cancellation entrypoints that should map back to the linked attempt |
| `publishTransferReversed` | transfer effect args | void | Reversal entrypoint that should drive attempt reversal for attempt-linked inbound transfers |
| transfer reconciliation cron(s) | none or scheduled args | void | Healing logic that should validate canonical attempt-owned consequences instead of bridge-era shortcuts |

### Routing
No route changes are planned. This is backend orchestration and settlement
reconciliation work.

## Implementation Decisions

### Prefer a dedicated reconciliation coordinator over scattered ad hoc callbacks
The Notion implementation plan explicitly prefers a dedicated coordinator when
it keeps AMPS and Payment Rails boundaries clearer. That is the recommended
default here because transfer effects currently know too much about bridge-era
cash-posting exceptions but too little about the linked attempt lifecycle.

### Attempt-owned settlement stays canonical for attempt-linked inbound collections
For attempt-linked inbound transfers, transfer confirmation should reconcile
back into `collectionAttempt -> FUNDS_SETTLED`, and the attempt-owned
`emitPaymentReceived` path should remain the only place that applies
obligations, handles overpayment routing, and produces the business-layer cash
meaning. Transfer effects should not create a second inbound cash story.

### Remove or sharply fence the old bridge creator
`emitPaymentReceived` currently creates a transfer when `attempt.transferRequestId`
is absent. That should no longer be treated as a normal production path. The
preferred direction is to retire it in greenfield scope or reduce it to an
explicit compatibility/error path that is not exercised by canonical tests.

### Reversal should mirror confirmation ownership
If confirmation for attempt-linked inbound collections is attempt-owned, then
reversal should also reconcile to `collectionAttempt -> PAYMENT_REVERSED` and
let the durable attempt reversal cascade own downstream cash repair. Transfer
effects may still persist transfer-level reversal facts, but they should not
independently reverse attempt-owned inbound cash meaning.

### Reconciliation healing must validate the canonical outcome, not bridge heuristics
Current transfer reconciliation skips any transfer with `collectionAttemptId`.
That was acceptable while bridge behavior dominated, but the canonical model
should verify that the linked attempt consequences exist before treating the
transfer as healthy.

### Backend integration tests are the primary proof surface
The core risks are duplicate journals, duplicate obligation application, drift
between attempt and transfer status, and asymmetric reversal behavior. Those are
best exercised in Convex integration suites, not browser e2e.
