# 13. Build Admin UI for Rules and Collection State

> **Canonical Source of Truth**: https://www.notion.so/337fc1b440248137a4a1f11a164dae02
>
> This PRD is a compressed working context snapshot extracted from the Notion spec
> and linked implementation plan. Always defer to the Notion pages for the latest
> requirements. This file exists to keep local implementation context tight.

## Overview
Page 13 defines the production admin UI needed for AMPS, but this workstream is now intentionally deferred from the current execution order. The current repo has a generic admin shell and generic record-detail scaffolding, but the user direction for this branch of work is to finish the remaining backend and boundary pages first and move all UI implementation to dedicated end-of-sequence execution pages under the parent Notion execution index.

This file now serves as a deferred backlog and handoff snapshot, not an approval to begin route/component implementation now. The UI requirements remain valid, but they are no longer in the active execution queue for the current phase of realignment.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Collection Operations Information Architecture | Add clear mortgage-centric and global admin views that distinguish obligations, plan entries, and attempts. | P0 |
| F-2 | Rules Management UI | Add admin UI for listing, inspecting, and updating collection rules through supported backend contracts. | P0 |
| F-3 | Collection Plan & Attempt Views | Add queue/detail views for plan entries and attempts with lineage, execution, and reconciliation context. | P0 |
| F-4 | Governed Operator Workflows | Expose manual execute, reschedule, and workout actions through explicit UI confirmations and reason capture. | P0 |
| F-5 | Production-Grade Admin Experience | Deliver a credible, modern operations UI with strong hierarchy, terminology, and visual clarity. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | The UI must reflect the three-layer model clearly. | Functional | Obligations, collection plan entries, and collection attempts are visually and conceptually distinct everywhere they appear. |
| REQ-2 | The UI must use page-12 backend surfaces. | Non-functional | Frontend data access uses supported collection admin queries and mutations, not raw ad hoc joins or direct table manipulation. |
| REQ-3 | Admins can inspect rules through dedicated UI. | Functional | Rules have list and detail/editor views with status, scope, effective window, config summary, and audit context. |
| REQ-4 | Admins can inspect collection-plan state through dedicated UI. | Functional | Plan entries have queue/detail views with lineage, balance gate, execution linkage, and workout ownership context. |
| REQ-5 | Admins can inspect collection-attempt state through dedicated UI. | Functional | Attempts have queue/detail views with transfer, provider, and reconciliation context. |
| REQ-6 | Mortgage detail exposes a usable payments operations workspace. | Functional | Mortgage detail includes a payments-focused area showing obligations, upcoming plan entries, recent attempts, and a timeline. |
| REQ-7 | Supported operator actions are available in UI. | Functional | Manual execute, reschedule, workout actions, and rule updates are accessible through governed UI flows with confirmation and reason capture where needed. |
| REQ-8 | The UI is operationally explainable. | Functional | Status badges, terminology, and timeline groupings make it clear what is debt truth versus collection strategy versus execution record. |
| REQ-9 | The UI is ready for downstream demo work. | Functional | Page-16 demo work can reuse the same route structure, components, and backend contracts. |
| REQ-10 | Verification proves real product behavior. | Functional | Frontend tests cover major route/component workflows, and e2e coverage is added where the operator flows are materially observable in the browser. |

## Use Cases
### UC-1: Admin Reviews Mortgage Payment Operations
- **Actor**: Admin/operator
- **Precondition**: A mortgage has obligations and at least some collection-plan or attempt history
- **Flow**:
  1. The admin opens a mortgage record.
  2. The admin navigates to the payments operations area.
  3. The UI shows obligation truth, scheduled plan entries, attempts, and a timeline without collapsing them into one status list.
- **Postcondition**: The operator can explain what is owed, what is scheduled, and what has been attempted.
- **E2E Test**: Mortgage payments workspace route coverage

### UC-2: Admin Manages Rules
- **Actor**: Admin/operator
- **Precondition**: Collection rules exist and the operator has payment-management access
- **Flow**:
  1. The admin opens the rules area.
  2. The admin reviews rule status, scope, config, and related activity.
  3. The admin performs a supported rule update through a governed UI flow.
- **Postcondition**: Rules are operable through UI using supported backend contracts.
- **E2E Test**: Rules list/detail and update flow coverage

### UC-3: Admin Intervenes in Collection Strategy
- **Actor**: Admin/operator
- **Precondition**: A plan entry or mortgage is in a state where supported intervention is allowed
- **Flow**:
  1. The admin inspects the relevant plan entry or mortgage operations view.
  2. The admin starts a supported action such as execute, reschedule, or workout activation.
  3. The UI captures confirmation and reason input, then shows the governed outcome.
- **Postcondition**: The action completes without bypassing canonical backend mutations.
- **E2E Test**: Governed action flow coverage

### UC-4: Admin Reviews Attempt Outcomes
- **Actor**: Admin/operator
- **Precondition**: Collection attempts exist with execution or reconciliation state
- **Flow**:
  1. The admin opens the attempts queue or a specific attempt detail.
  2. The UI shows lifecycle status, transfer context, failure/reconciliation information, and lineage back to the plan entry.
  3. The admin uses that information to understand what happened without inspecting raw backend tables.
- **Postcondition**: Attempt outcomes are operationally understandable in product UI.
- **E2E Test**: Attempts queue/detail coverage

## Schemas
- Page 13 primarily consumes the page-12 collection admin contracts rather than inventing new domain schema
- Likely frontend contracts:
  - rules list/detail view models
  - plan entry queue/detail view models
  - attempt queue/detail view models
  - mortgage-scoped collection operations summary
  - governed action form payloads for execute, reschedule, workout, and rule update flows

## Out of Scope
- Implementing page-13 UI work in the current execution sequence
- Replacing the current execution ordering from the parent backend-first realignment pages
- Replacing the existing admin shell entirely
- Adding new backend business logic beyond thin UI-support helpers if needed
- Borrower-facing collection UI
- Stakeholder-only demo divergence from the production route/component architecture
- Direct database operations from the UI

## Execution Sequencing Note
- The parent Notion execution index still contains page 13, but local execution planning has been refactored so that no UI work starts yet.
- All AMPS UI work should be treated as downstream of the remaining backend and verification workstreams, then resumed through dedicated UI execution pages at the end of the sequence.
- Until those dedicated end-loaded UI pages exist, this PRD should be used only as handoff context for the eventual UI phase.
