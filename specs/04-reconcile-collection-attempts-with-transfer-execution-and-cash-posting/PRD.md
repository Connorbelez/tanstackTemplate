# 04. Reconcile Collection Attempts with Transfer Execution and Cash Posting

> **Canonical Source of Truth**: https://www.notion.so/337fc1b4402481a48a13ee61e289e8f0
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
This workstream closes the remaining gap between the page-03 execution spine and
the actual settlement lifecycle in Unified Payment Rails. The end state is one
canonical inbound reconciliation story: a Collection Attempt remains the AMPS
business execution record, transfer lifecycle stays inside Payment Rails, and
confirmed, failed, cancelled, and reversed outcomes reconcile back into AMPS
without duplicate cash meaning or bridge-era ambiguity.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Transfer-to-attempt reconciliation seam | Add one canonical reconciliation path from transfer lifecycle outcomes back into the originating Collection Attempt. | P0 |
| F-2 | Single confirmed-settlement consequence path | Ensure confirmed inbound collections drive one obligation-application path and one borrower cash-posting path. | P0 |
| F-3 | Failure and cancellation coherence | Map failed or cancelled transfer execution back onto the same Collection Attempt without double-interpreting the money event. | P0 |
| F-4 | Reversal cascade unification | Make attempt-linked transfer reversals cascade once through Collection Attempt reversal and downstream ledger repair. | P0 |
| F-5 | Bridge-path retirement or fencing | Remove or sharply fence the older attempt-confirmed-to-bridge-transfer path so it is no longer the canonical production story. | P0 |
| F-6 | Canonical-flow integration coverage | Prove the stable inbound path with backend integration coverage and compatibility-labeled regression tests. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Transfer lifecycle outcomes must reconcile to the linked Collection Attempt. | Functional | Attempt-linked inbound transfers can map confirmed, failed, cancelled, and reversed outcomes back to the originating attempt without manual GT shortcuts. |
| REQ-2 | Confirmed inbound collections must produce one business settlement outcome. | Functional | The same money event cannot independently settle both transfer and attempt in ways that create duplicate business meaning. |
| REQ-3 | Obligation application must stay downstream of the Collection Attempt boundary. | Functional | Obligations are applied from the canonical attempt settlement path and do not depend on transfer modules understanding plan-entry strategy semantics. |
| REQ-4 | Borrower cash posting must occur exactly once for attempt-linked inbound collections. | Functional | Attempt-linked inbound settlement cannot create duplicate `CASH_RECEIVED` journals even when both attempt and transfer events are observed. |
| REQ-5 | Settlement-layer modules must not require plan-entry awareness to post money. | Functional | Transfer and cash-ledger modules reconcile from stable transfer or attempt references rather than strategy-layer concepts. |
| REQ-6 | Failed and cancelled inbound transfers must remain durable and auditable. | Functional | Failure or cancellation is reflected on the attempt with durable audit history and without creating confirmed-money side effects. |
| REQ-7 | Reversals must cascade once and preserve corrective downstream behavior. | Functional | An attempt-linked inbound transfer reversal drives one Collection Attempt reversal and one ledger-repair cascade with no double reversal. |
| REQ-8 | Legacy bridge behavior must be removed or explicitly compatibility-only. | Functional | `emitPaymentReceived` no longer defines the canonical inbound transfer story, and any retained compatibility logic is fenced and documented as legacy. |
| REQ-9 | Reconciliation and healing logic must reflect the canonical path. | Functional | Attempt-linked confirmed transfers are not treated as bridge-era orphan exceptions without validating the attempt-owned settlement consequences. |
| REQ-10 | Integration tests must cover the canonical inbound reconciliation path. | Functional | Tests prove confirmed, failed, cancelled or skipped, reversed, and compatibility-edge behavior through the real settlement seam. |

## Use Cases
### UC-1: Provider-settled inbound transfer confirms the originating Collection Attempt
- **Actor**: Unified Payment Rails transfer lifecycle plus AMPS reconciliation seam
- **Precondition**: A plan entry has already created a Collection Attempt and linked transfer request via page 03
- **Flow**:
  1. Provider initiation places the transfer into `pending` or `processing`
  2. A later transfer settlement event confirms the transfer in Payment Rails
  3. The canonical reconciliation seam resolves the linked `collectionAttemptId`
  4. The Collection Attempt transitions to `confirmed`
  5. Obligation application and borrower cash posting run once from the attempt-owned consequence path
- **Postcondition**: One confirmed inbound collection yields one stable attempt outcome, one obligation-application path, and one cash-posting path
- **E2E Test**: Backend integration test; browser e2e not required

### UC-2: Failed or cancelled transfer execution feeds durable attempt failure semantics
- **Actor**: Unified Payment Rails transfer lifecycle plus AMPS retry logic
- **Precondition**: A Collection Attempt is linked to an inbound transfer that fails or is cancelled before settlement
- **Flow**:
  1. Transfer lifecycle produces a failed or cancelled outcome
  2. The canonical reconciliation seam maps that outcome back to the same attempt
  3. The attempt advances through governed failure semantics and existing retry rules when appropriate
- **Postcondition**: The attempt remains the business-layer execution record for the failed collection and no cash or obligation posting occurs
- **E2E Test**: Backend integration test; browser e2e not required

### UC-3: Reversed inbound transfer triggers one attempt reversal and one ledger repair cascade
- **Actor**: Unified Payment Rails reversal lifecycle plus AMPS reversal logic
- **Precondition**: An inbound transfer and its linked Collection Attempt were previously confirmed
- **Flow**:
  1. Transfer lifecycle emits a reversal outcome
  2. The canonical reconciliation seam maps reversal back to the linked Collection Attempt
  3. The attempt transitions to `reversed`
  4. The durable attempt reversal cascade repairs cash and obligation state once
- **Postcondition**: Business and settlement layers remain aligned after reversal with explicit auditability
- **E2E Test**: Backend integration test; browser e2e not required

### UC-4: Legacy bridge-era inbound behavior is retired or fenced
- **Actor**: Internal reconciliation and test suites
- **Precondition**: Old tests or seed paths still assume `emitPaymentReceived` can create a transfer after the attempt settles
- **Flow**:
  1. Canonical attempt-linked transfer settlement is established as the only production path
  2. Bridge-era behavior is either removed or reduced to explicit compatibility handling
  3. Tests and reconciliation logic are rewritten to validate the canonical path first
- **Postcondition**: The repo no longer presents two production stories for the same inbound money movement
- **E2E Test**: Backend integration regression or compatibility test; browser e2e not required

## Schemas
- `collectionAttempts`
  - remains the AMPS-owned business execution record
  - already links to `planEntryId` and `transferRequestId`
  - owns business settlement and reversal semantics
- `transferRequests`
  - remains the Unified Payment Rails execution record
  - already links back to `collectionAttemptId`
  - owns provider initiation, transfer lifecycle, and settlement timestamps
- `cash_ledger_journal_entries`
  - must show exactly one inbound `CASH_RECEIVED` meaning for attempt-linked collections
  - must remain reversible via one stable posting group
- `obligations`
  - continue to receive payment application and corrective reversal consequences from the attempt-owned path
- reconciliation/healing metadata
  - existing transfer-healing attempts and audit trails should align to the new canonical path rather than bridge-only assumptions

## Out of Scope
- Converging the inbound provider boundary on `TransferProvider` beyond what page 05 already owns
- Broader schema normalization and contract cleanup deferred to page 11
- Mortgage lifecycle and ledger-boundary redesign outside the attempt/transfer seam owned by page 14
- Final repo-wide deprecation cleanup and exhaustive verification owned by page 15
- New frontend flows or browser UX work unless implementation exposes an unavoidable operator surface
