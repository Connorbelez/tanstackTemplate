# 14. Preserve Mortgage Lifecycle and Ledger Boundaries

> **Canonical Source of Truth**: https://www.notion.so/337fc1b440248188a5cbf191c15cb468
>
> This PRD is a compressed working context snapshot extracted from the Notion spec
> and linked implementation plan. Always defer to the Notion pages for the latest
> requirements. This file exists to keep local implementation context tight.

## Overview
Page 14 is a guardrail page, not a net-new product feature page. The current repo is already mostly correct: the mortgage machine is obligation-driven, transfer/cash posting live outside the mortgage machine, and collection-plan state is not supposed to create debt or cash meaning.

The goal is to make those boundaries explicit enough in code and tests that later AMPS work cannot erode them accidentally.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Mortgage Lifecycle Boundary Guardrails | Keep mortgage delinquency/cure driven by obligation events only. | P0 |
| F-2 | Ledger Ownership Boundary Guardrails | Keep ownership-ledger and cash-ledger behavior independent from collection scheduling strategy. | P0 |
| F-3 | Boundary Regression Tests | Add explicit tests proving strategy-layer changes do not directly mutate mortgage or ledger meaning. | P0 |
| F-4 | Cross-Domain Guardrail Documentation | Encode the intended architectural ownership in code comments, helper boundaries, and local implementation docs. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Mortgage lifecycle stays obligation-driven only. | Functional | Mortgage state transitions continue to originate from obligation-driven events rather than plan-entry or attempt state. |
| REQ-2 | Collection Plan and Collection Attempt do not directly drive mortgage state. | Non-functional | No direct path from plan-entry creation/reschedule/attempt initiation/failure to mortgage-state mutation is introduced. |
| REQ-3 | Ownership-ledger logic stays strategy-agnostic. | Non-functional | Ownership-ledger accrual and settlement semantics do not require collection-plan context. |
| REQ-4 | Borrower cash posting stays in the cash-ledger integration layer. | Non-functional | Cash receipt/posting logic remains triggered by confirmed money/application flows, not by scheduling strategy state. |
| REQ-5 | AMPS does not absorb transfer lifecycle ownership. | Non-functional | Transfer/provider settlement lifecycle remains owned by transfer rails and consumed through explicit integration seams only. |
| REQ-6 | Workout and reschedule do not introduce hidden lifecycle shortcuts. | Functional | Strategy changes alter future scheduling only and do not directly mutate mortgage lifecycle. |
| REQ-7 | The boundaries are explicit in code paths and contracts. | Non-functional | Comments, helper seams, and result shapes make the intended ownership legible to future contributors. |
| REQ-8 | Boundary preservation is tested. | Functional | Regression tests prove mortgage and ledger boundaries survive plan-entry, attempt, reversal, and workout scenarios. |

## Use Cases
### UC-1: Obligation Overdue Drives Mortgage Delinquency
- **Actor**: System
- **Precondition**: A due obligation becomes overdue
- **Flow**:
  1. The obligation transitions into overdue state.
  2. The obligation effect emits the mortgage lifecycle event.
  3. The mortgage machine transitions based on the obligation-driven event.
- **Postcondition**: Mortgage delinquency remains obligation-driven.
- **E2E Test**: Backend regression coverage

### UC-2: Strategy Changes Do Not Directly Mutate Mortgage State
- **Actor**: Admin/system
- **Precondition**: Plan entries are rescheduled, retried, canceled, or workout-owned
- **Flow**:
  1. Strategy-layer entities change.
  2. No direct mortgage mutation is emitted from those changes alone.
  3. Mortgage state only changes later if obligation-driven events occur.
- **Postcondition**: Collection strategy remains separate from mortgage lifecycle.
- **E2E Test**: Backend regression coverage

### UC-3: Confirmed Money Posts Cash Meaning Without Strategy Awareness
- **Actor**: System
- **Precondition**: A real transfer settlement or obligation application occurs
- **Flow**:
  1. The transfer/cash integration layer handles confirmed money meaning.
  2. Posting logic uses obligation or confirmed-transfer semantics.
  3. Collection-plan scheduling metadata is not required to infer the journal meaning.
- **Postcondition**: Ledger and cash posting stay boundary-correct.
- **E2E Test**: Backend regression coverage

### UC-4: Workout Strategy Preserves Lifecycle Boundaries
- **Actor**: Admin/system
- **Precondition**: A workout supersedes or adds future plan entries
- **Flow**:
  1. Workout changes future collection strategy.
  2. Mortgage lifecycle does not change purely because the workout exists.
  3. Lifecycle changes still depend on obligation-driven events and confirmed money/application.
- **Postcondition**: Workout remains strategy-layer only.
- **E2E Test**: Backend regression coverage

## Schemas
- No major new product schema is expected
- Possible implementation artifacts:
  - helper boundary predicates / coordinators
  - richer comments or small contract helpers around cross-domain effect seams
  - additional test fixtures and assertions for mortgage/ledger boundary cases

## Out of Scope
- Rebuilding the mortgage machine
- Moving transfer lifecycle ownership into AMPS
- Adding admin UI
- Replacing existing page-03/page-04/page-10 behavior when small guardrails and tests are sufficient
