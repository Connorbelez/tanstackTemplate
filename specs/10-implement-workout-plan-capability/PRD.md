# 10. Implement Workout Plan Capability

> **Canonical Source of Truth**: https://www.notion.so/337fc1b4402481b59a5ecc19d8b22e13
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
Page 10 adds a workout-plan capability for distressed or exception collection cases without collapsing obligation truth, collection strategy, and mortgage lifecycle into one mutable surface. The current repo has no workout model, mutation, query, or UI, and the typed collection-rule model only contains a `workout_policy` placeholder. The repo now does have page-09 borrower/admin reschedule lineage and the page-03 execution spine, so page 10 can build on those seams, but it still needs an explicit workout domain concept rather than hidden manual plan-entry edits.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Explicit Workout Domain Model | Introduce workout plans as a first-class, queryable, auditable collection capability. | P0 |
| F-2 | Workout Lifecycle | Support governed lifecycle states such as draft, active, suspended, completed, and cancelled. | P0 |
| F-3 | Strategy-Layer Schedule Effects | Allow active workouts to alter future collection-plan strategy for covered obligations or mortgages without rewriting obligations. | P0 |
| F-4 | Interaction Discipline | Define explicit interaction rules with retry, reschedule, late-fee, and operator overrides. | P0 |
| F-5 | Operator Inspection | Persist rationale, scope, and history so operators can explain workout behavior later. | P0 |
| F-6 | Admin-First Delivery | Keep the first version operator-focused while preserving a contract that can be surfaced later in page 12 and page 13. | P1 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Workout is explicit strategy, not hidden edits. | Functional | There is a dedicated workout domain model or equivalently explicit typed construct, not an informal cluster of manual plan-entry changes. |
| REQ-2 | Workout lifecycle is auditable. | Functional | Creation, activation, modification, suspension, completion, and cancellation are queryable and audit-logged. |
| REQ-3 | Workout does not rewrite obligations. | Functional | No obligation row is mutated as part of workout strategy activation or modification. |
| REQ-4 | Workout can alter future collection strategy. | Functional | Covered future plan-entry generation or scheduling changes while the underlying obligations remain unchanged. |
| REQ-5 | Mortgage lifecycle remains obligation-driven. | Functional | Delinquency and cure logic still derive only from obligations and not from workout state. |
| REQ-6 | Interaction with retry, reschedule, and late fees is explicit. | Functional | The implementation documents and enforces precedence rules rather than allowing hidden overlap. |
| REQ-7 | Operators can inspect current workout rationale and scope. | Functional | Backend query/persistence surfaces expose enough metadata for later page-12/page-13 operator review. |
| REQ-8 | Workout-created or workout-owned plan entries remain auditable. | Functional | Future plan entries created or altered under a workout preserve source and lineage metadata. |
| REQ-9 | First version may ship admin-only. | Non-functional | Borrower self-service is not required as long as the capability is reusable later. |
| REQ-10 | Verification proves boundary preservation. | Functional | Backend tests demonstrate changed future strategy, unchanged obligations, explicit precedence, and obligation-driven mortgage lifecycle. |

## Use Cases
### UC-1: Operator Creates and Activates a Workout Plan
- **Actor**: Operator/admin
- **Precondition**: A mortgage or obligation set needs distressed-account strategy treatment
- **Flow**:
  1. Operator creates a workout draft with scope, rationale, and alternate schedule strategy.
  2. Operator activates the workout.
  3. Covered future collection strategy is updated to reflect the workout plan.
- **Postcondition**: A workout exists as explicit strategy and future plan entries follow it.
- **E2E Test**: Backend integration coverage during implementation

### UC-2: Active Workout Changes Future Collection Strategy Without Rewriting Obligations
- **Actor**: System scheduler / operator
- **Precondition**: A workout is active for covered obligations or a mortgage
- **Flow**:
  1. Existing or future collection-plan generation checks the active workout.
  2. Workout-owned plan entries are created, replaced, or sequenced according to the workout strategy.
  3. Obligations remain unchanged.
- **Postcondition**: Future collection behavior changes while contractual truth stays intact.
- **E2E Test**: Backend integration coverage during implementation

### UC-3: Workout Coexists Safely With Retry and Reschedule
- **Actor**: System scheduler / operator
- **Precondition**: A workout-owned or workout-covered entry fails or is otherwise modified
- **Flow**:
  1. Retry logic applies to the executed plan entry under explicit precedence rules.
  2. Reschedule or operator overrides either preserve workout ownership or are explicitly rejected in unsupported combinations.
- **Postcondition**: No hidden precedence ambiguity exists between workout and other strategy features.
- **E2E Test**: Backend integration coverage during implementation

### UC-4: Workout Exit Leaves Mortgage Lifecycle Boundaries Intact
- **Actor**: Operator/admin
- **Precondition**: A workout is suspended, completed, or cancelled
- **Flow**:
  1. Operator changes workout lifecycle state.
  2. Future collection strategy transitions predictably.
  3. Mortgage delinquency and cure continue to derive from obligations only.
- **Postcondition**: Workout exit does not mutate mortgage lifecycle truth.
- **E2E Test**: Backend integration coverage during implementation

## Schemas
- `collectionRules`
  - currently contains only a placeholder `workout_policy` kind
  - page 10 must decide whether to keep workout as rule metadata, a standalone domain object, or a hybrid
- `collectionPlanEntries`
  - likely needs workout ownership/source metadata for entries created or superseded under workout strategy
- new workout domain storage
  - expected to hold scope, status, rationale, effective window, and strategy configuration
- audit trail / audit log
  - should record workout lifecycle changes and strategy rewrites as explicit governance events

## Out of Scope
- Borrower self-service workout UI
- Rewriting obligation contractual truth or using workout to directly cure delinquency
- Making the mortgage machine workout-aware
- Full page-12/page-13 admin UX delivery unless implementation forces a minimal surface
- Generic hardship policy outside the collection-plan domain
