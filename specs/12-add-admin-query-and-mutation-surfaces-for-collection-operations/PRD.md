# 12. Add Admin Query and Mutation Surfaces for Collection Operations

> **Canonical Source of Truth**: https://www.notion.so/337fc1b440248119a4b9eb469e201b27
>
> This PRD is a compressed working context snapshot extracted from the Notion spec
> and linked implementation plan. Always defer to the Notion pages for the latest
> requirements. This file exists to keep local implementation context tight.

## Overview
Page 12 is the backend contract page that makes the collection system operable by admins without raw database access. The collection domain now has meaningful internal capabilities from pages 02 through 11: canonical execution, runner scheduling, reconciliation, typed rules, balance gating, reschedule, workout, and aligned schemas. What is still missing is a stable admin-facing surface that exposes this state and routes approved operator actions through the governed collection-domain mutations.

This page is not a UI build. It is the backend admin contract that page 13 and the stakeholder demo pages depend on.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Collection Admin Read Surfaces | Add admin query surfaces for collection rules, plan entries, attempts, and mortgage-scoped collection state. | P0 |
| F-2 | Governed Collection Admin Writes | Add safe admin mutation surfaces for supported collection operations by delegating to canonical domain mutations. | P0 |
| F-3 | Explainable Operational State | Return operator-usable reason, lineage, and reconciliation metadata instead of raw table rows. | P0 |
| F-4 | Structural RBAC & Audit | Enforce admin permissions in backend surfaces and preserve auditable actor/reason metadata. | P0 |
| F-5 | Stable Contracts for Page 13 / Demo | Produce stable backend shapes that the admin UI and stakeholder demo can build against without re-deriving domain truth. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Admins can inspect collection rules through supported query surfaces. | Functional | Backend queries expose typed rule state, scope, status, config summary, and authorship metadata without requiring direct table reads. |
| REQ-2 | Admins can inspect collection plan entries through supported query surfaces. | Functional | Backend queries expose plan-entry execution state, source/lineage, balance-gate state, workout ownership, and linked attempt context. |
| REQ-3 | Admins can inspect collection attempts through supported query surfaces. | Functional | Backend queries expose attempt status, transfer linkage, provider/reconciliation state, and upstream plan-entry context. |
| REQ-4 | Admins can inspect mortgage-scoped collection state holistically. | Functional | A mortgage-oriented query surface can summarize active rules, upcoming/superseded entries, active workouts, and recent attempts. |
| REQ-5 | Supported admin actions route through governed collection-domain mutations. | Functional | Manual execution, reschedule, and workout/rule operations use canonical domain APIs rather than admin-only shortcut writes. |
| REQ-6 | Admin surfaces are structurally permissioned. | Non-functional | Queries and mutations enforce backend permissions via the existing auth/fluent middleware, not frontend gating. |
| REQ-7 | Operator-facing reason/audit metadata is queryable. | Functional | Admin surfaces expose sufficient reason, actor, and lineage information for explainability and operational review. |
| REQ-8 | Contracts are stable enough for page 13 and page 16 follow-on work. | Functional | Query and mutation result shapes are explicit and predictable, avoiding UI-specific raw data reconstruction. |
| REQ-9 | No raw DB manipulation path is introduced. | Non-functional | Admin surfaces remain wrappers around governed transitions and typed domain mutations. |
| REQ-10 | Verification covers backend contract behavior. | Functional | Focused backend contract/integration tests prove read models, RBAC behavior, and governed mutation delegation. |

## Use Cases
### UC-1: Admin Inspects Mortgage Collection State
- **Actor**: Admin/operator
- **Precondition**: A mortgage has scheduled, rescheduled, retry, or workout-related collection activity
- **Flow**:
  1. The admin queries a mortgage-scoped collection operations surface.
  2. The surface returns active rules, relevant plan entries, recent attempts, and workout context.
  3. The admin can understand what is scheduled, what executed, and why.
- **Postcondition**: Collection state is inspectable without raw table access or multi-query domain reconstruction in the UI.
- **E2E Test**: Backend contract coverage during implementation

### UC-2: Admin Reviews and Manages Rule State
- **Actor**: Admin/operator
- **Precondition**: Typed collection rules exist for scheduling, retry, late fee, balance pre-check, or workout strategy
- **Flow**:
  1. The admin lists or loads rules through supported backend queries.
  2. The admin updates supported rule fields or state through a governed mutation surface.
  3. The mutation records actor/reason metadata and preserves the canonical typed rule model.
- **Postcondition**: Rule operations are admin-operable without bypassing the rule contract.
- **E2E Test**: Backend contract and mutation coverage during implementation

### UC-3: Admin Manually Intervenes in Collection Execution
- **Actor**: Admin/operator
- **Precondition**: A plan entry exists and the operator needs to manually execute, reschedule, or otherwise apply an approved collection action
- **Flow**:
  1. The admin reads the current plan entry and attempt lineage through supported queries.
  2. The admin invokes a supported operation through the admin mutation surface.
  3. The admin mutation delegates to the canonical collection-domain mutation or execution API.
- **Postcondition**: The action preserves governed transitions, idempotency, and auditability.
- **E2E Test**: Backend integration coverage during implementation

### UC-4: Admin Reviews Attempt / Transfer Outcomes
- **Actor**: Admin/operator
- **Precondition**: A collection attempt has linked transfer execution and reconciliation outcomes
- **Flow**:
  1. The admin queries recent or entry-linked attempts.
  2. The surface returns attempt lifecycle, transfer linkage, provider refs, and reconciliation status.
  3. The admin can understand execution outcomes without manually traversing adjacent tables.
- **Postcondition**: Attempt and transfer execution history is operationally explainable.
- **E2E Test**: Backend contract coverage during implementation

## Schemas
- `collectionRules`
  - admin read surfaces should expose typed `kind`, `status`, `scope`, `config`, effective-window metadata, and authorship/audit fields
- `collectionPlanEntries`
  - admin read surfaces should expose source, lineage, execution linkage, balance-pre-check metadata, workout ownership, and mortgage context
- `collectionAttempts`
  - admin read surfaces should expose business execution state, transfer linkage, provider-facing refs, and reconciliation facts
- `workoutPlans`
  - admin read and mutation surfaces may need to expose active-plan summaries and canonical workout actions for mortgage operations
- admin query/mutation contracts
  - likely new collection-specific backend query and mutation endpoints, rather than forcing the existing generic entity-table query to absorb collection-domain behavior

## Out of Scope
- Building the full admin UI itself; page 13 consumes the surfaces this page introduces
- Borrower-facing operations
- Introducing admin-only shortcut writes that bypass governed transitions
- Replacing the collection domain with generic admin CRUD
- Browser e2e unless implementation forces route-level UI changes
