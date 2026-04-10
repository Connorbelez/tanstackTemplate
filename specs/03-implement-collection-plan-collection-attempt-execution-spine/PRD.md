# 03. Implement Collection Plan -> Collection Attempt Execution Spine

> **Canonical Source of Truth**: https://www.notion.so/337fc1b44024812291bac97a93ca6e10
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
This workstream operationalizes the page-02 execution contract by turning the
existing `executePlanEntry` API into the live production path for mortgage
collections. It must discover due plan entries, execute them through the
canonical command, initiate downstream transfer execution through Unified
Payment Rails, and advance Collection Attempt state through governed
transitions without collapsing debt, strategy, and execution boundaries.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Due-entry discovery and runner | Find due `planned` plan entries and execute them in bounded, replay-safe production batches. | P0 |
| F-2 | Canonical spine enforcement | Make `executePlanEntry` the only production attempt-creation path for collections. | P0 |
| F-3 | Transfer initiation handoff | Move from transfer-request creation to real downstream transfer initiation with no manual follow-up step. | P0 |
| F-4 | Collection Attempt GT advancement | Reflect real initiation outcomes back onto Collection Attempts through governed transitions. | P0 |
| F-5 | Retry and failure loop preservation | Preserve one-attempt-per-plan-entry while keeping failure paths compatible with retry-rule plan-entry creation. | P0 |
| F-6 | Production-path integration coverage | Replace seed-only or manual-transition happy paths with tests that exercise the real execution spine. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Production code discovers and executes due plan entries. | Functional | A scheduler-owned path selects due `planned` entries and executes them without manual seeding or direct inserts. |
| REQ-2 | Every production execution goes through `executePlanEntry`. | Functional | No alternate production attempt-creation path bypasses the canonical page-02 contract. |
| REQ-3 | Successful execution creates at most one Collection Attempt and at most one transfer request per plan entry. | Functional | Cron reruns and action retries remain replay-safe and do not duplicate business attempts. |
| REQ-4 | The spine initiates downstream transfer execution through Unified Payment Rails. | Functional | A created transfer request is followed by canonical transfer initiation rather than stopping at insertion. |
| REQ-5 | Collection Attempt state advances through GT based on real initiation outcomes. | Functional | Pending initiation, immediate confirmation, and initiation failure map to governed Collection Attempt transitions rather than ad hoc status patches. |
| REQ-6 | Failure remains durable and observable. | Functional | Transfer-initiation failure persists on the attempt and is visible to retry, audit, and operator workflows. |
| REQ-7 | Retry behavior continues to create replacement plan entries rather than duplicate attempts. | Functional | Failure flows preserve the one-attempt-per-plan-entry invariant and still feed rule-driven retry planning. |
| REQ-8 | The AMPS / Payment Rails boundary stays intact. | Functional | AMPS does not call `TransferProvider` directly and Unified Payment Rails retains ownership of transfer lifecycle and settlement. |
| REQ-9 | Mortgage lifecycle and cash posting boundaries stay intact. | Functional | This work does not make mortgage lifecycle or the ledgers collection-strategy-aware. |
| REQ-10 | Integration tests validate the live production spine. | Functional | Tests cover due-entry discovery, execution, initiation, GT advancement, replay safety, and failure handling through the real path. |

## Use Cases
### UC-1: Scheduler executes due planned entries through the canonical spine
- **Actor**: Scheduler-owned AMPS runner
- **Precondition**: A `collectionPlanEntries` row is `planned`, due, and executable
- **Flow**:
  1. Scheduler selects due planned entries in a bounded batch
  2. Runner calls `internal.payments.collectionPlan.execution.executePlanEntry`
  3. The command creates the Collection Attempt and transfer request
  4. The production spine initiates the downstream transfer
- **Postcondition**: The plan entry is consumed into one live Collection Attempt with downstream initiation started
- **E2E Test**: Backend integration test; browser e2e not required for this backend-only flow

### UC-2: Async provider initiation moves the attempt into a real in-flight state
- **Actor**: Scheduler-owned runner plus Unified Payment Rails
- **Precondition**: The chosen provider returns a pending or provider-initiated result
- **Flow**:
  1. Production execution creates and initiates the transfer
  2. Transfer initiation returns a provider reference without immediate settlement
  3. The Collection Attempt transitions from `initiated` to `pending` via GT
- **Postcondition**: The attempt is in a real in-flight state with stable linkage to the initiated transfer
- **E2E Test**: Backend integration test; browser e2e not required

### UC-3: Immediate confirmation or initiation failure is reflected back onto the attempt
- **Actor**: Scheduler-owned runner plus Unified Payment Rails
- **Precondition**: A due plan entry is executed and transfer initiation returns either immediate confirmation or a hard failure
- **Flow**:
  1. Production execution creates the attempt and transfer
  2. Transfer initiation either confirms immediately or fails
  3. The attempt is advanced through GT to the correct next state or durable failure state
- **Postcondition**: Success and failure both remain auditable and do not require manual GT firing to keep the model consistent
- **E2E Test**: Backend integration test; browser e2e not required

## Schemas
- `collectionPlanEntries`
  - source strategy rows for due-entry discovery
  - consumed through `status`, `collectionAttemptId`, and execution metadata added in page 02
- `collectionAttempts`
  - business execution records
  - must remain the AMPS-owned source of truth for collection execution state
- `transferRequests`
  - Unified Payment Rails transfer execution records
  - linked to attempts via `collectionAttemptId` and to plan entries via `planEntryId`
- cron / runner inputs
  - bounded batch size
  - stable scheduler idempotency per run and per plan entry

## Out of Scope
- Transfer settlement, cash posting, and downstream reconciliation semantics owned by page 04
- Initial mortgage activation/bootstrap entry creation owned by page 06
- Broader schema redesign for retry lineage and reschedule metadata owned by page 11
- New frontend routes or operator UI beyond what future admin wrappers may need
- Any direct `TransferProvider` usage from AMPS
