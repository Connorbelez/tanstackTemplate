# 13. Build Active Mortgage Payment System Demo Workspace (/demo)

> **Canonical Source of Truth**: https://www.notion.so/13-Build-Active-Mortgage-Payment-System-Demo-Workspace-demo-337fc1b440248137a4a1f11a164dae02?source=copy_link
>
> Linked implementation plan: https://www.notion.so/337fc1b4402481aea2baf5ef53f155ec
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
Page 13 is now a demo-track delivery, not a production admin rollout. The goal is
to build a stakeholder-reviewable Active Mortgage Payment System workspace under
`/demo/` that uses the completed collection backend contracts from page 12 and
shows the three-layer AMPS model clearly: obligation truth, collection strategy,
and execution history.

The workspace needs to support demo-safe operator flows for manual execution,
reschedule, workout lifecycle actions, and rule updates, while remaining
architecturally isolated from later production information architecture
decisions.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Demo Workspace Shell | Add an AMPS-specific workspace under `/demo/` with its own layout, navigation, and scenario framing. | P0 |
| F-2 | Rule Operations Surface | Render collection rules through the existing backend admin contracts with operator-friendly filtering and detail views. | P0 |
| F-3 | Plan and Attempt Surfaces | Render collection plan entries and collection attempts as distinct operational layers, not generic table rows. | P0 |
| F-4 | Mortgage Payments Narrative | Add a mortgage-scoped payments workspace that connects rules, plan entries, attempts, workouts, and recent execution context. | P0 |
| F-5 | Governed Demo Actions | Support manual execute, reschedule, workout, and rule-management actions through canonical backend mutations/actions or explicit demo wrappers. | P0 |
| F-6 | Scenario-Driven Review | Present healthy, overdue, retry, failed, suppressed, review-required, and workout-backed stories in a deterministic demo flow. | P0 |
| F-7 | Demo Validation | Add route-level and e2e coverage proving the demo works end-to-end under `/demo/` without admin-route coupling. | P1 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Demo-only route target | Functional | The AMPS experience lives under `/demo/` and does not add or depend on `/admin` routes. |
| REQ-2 | Canonical backend contracts | Functional | Reads and writes must use the supported collection backend contracts from `convex/payments/collectionPlan/admin.ts` or narrowly scoped demo wrappers that delegate to them. |
| REQ-3 | Three-layer clarity | Functional | The UI must distinguish obligation truth, collection strategy, and collection execution history everywhere the user reviews payment state. |
| REQ-4 | Governed operator flows | Functional | The demo must support manual execute, reschedule, workout creation/activation/exit, and rule update flows without fake writes. |
| REQ-5 | Scenario coverage | Functional | The demo must let stakeholders review healthy, overdue, failed, retried, suppressed, review-required, and workout-backed stories. |
| REQ-6 | Production-IA isolation | Non-functional | The implementation must avoid committing the project to a production admin shell information architecture. |
| REQ-7 | Deterministic demo state | Non-functional | Demo scenarios must be seedable/resettable or otherwise deterministic enough for repeatable walkthroughs and Playwright coverage. |
| REQ-8 | Reuse existing demo patterns | Non-functional | The new workspace should follow existing `/demo` route and component patterns where neutral primitives already exist. |

## Use Cases
### UC-1: Open the AMPS demo workspace
- **Actor**: Stakeholder or operator
- **Precondition**: The app is running and demo routes are available.
- **Flow**:
  1. Navigate to the AMPS workspace under `/demo/`.
  2. Review the workspace overview and available scenarios or focus areas.
  3. Open a rules, queue, or mortgage payments surface.
- **Postcondition**: The user can move through the AMPS demo without entering the production admin shell.
- **E2E Test**: To be filled during test phase.

### UC-2: Review collection rules, plan entries, and attempts
- **Actor**: Stakeholder or operator
- **Precondition**: Demo data or seeded scenario state is available.
- **Flow**:
  1. Open the rules surface and inspect active/draft rule state.
  2. Open collection plan and attempt surfaces.
  3. Compare strategy rows and execution rows for the same mortgage.
- **Postcondition**: The user understands the difference between rules, plan entries, and attempts from live backend data.
- **E2E Test**: To be filled during test phase.

### UC-3: Inspect a mortgage-scoped payments workspace
- **Actor**: Stakeholder or operator
- **Precondition**: A mortgage with collection state exists in the demo.
- **Flow**:
  1. Open a mortgage-specific payments view.
  2. Review applicable rules, upcoming entries, recent attempts, workout state, and supporting status signals.
  3. Use the view to understand obligation truth versus collection strategy versus execution outcomes.
- **Postcondition**: The mortgage-level AMPS story is reviewable from one coherent workspace.
- **E2E Test**: To be filled during test phase.

### UC-4: Run governed collection operations from the demo
- **Actor**: Operator
- **Precondition**: A demo mortgage has entries/rules/workouts eligible for action.
- **Flow**:
  1. Trigger manual execute, reschedule, workout, or rule-update actions from the demo.
  2. Confirm required reason/details.
  3. Observe refreshed backend-backed state after the action completes.
- **Postcondition**: The demo proves the canonical collection operations end to end.
- **E2E Test**: To be filled during test phase.

### UC-5: Walk through scenario-driven stories
- **Actor**: Stakeholder or operator
- **Precondition**: The demo exposes deterministic scenario data or a repeatable scenario-selection flow.
- **Flow**:
  1. Select or load a healthy, overdue, retry, failed, suppressed, review-required, or workout-backed story.
  2. Review the relevant queue and mortgage views.
  3. Optionally trigger a governed action and observe the resulting story transition.
- **Postcondition**: The user can review the target AMPS stories without implying final production navigation decisions.
- **E2E Test**: To be filled during test phase.

## Schemas
- Existing canonical backend tables and contracts:
  - `collectionRules`
  - `collectionPlanEntries`
  - `collectionAttempts`
  - `workoutPlans`
  - supporting mortgage, obligation, transfer, and audit data
- Existing backend admin surfaces expected for reuse:
  - `listCollectionRules`
  - `getCollectionRule`
  - `listCollectionPlanEntries`
  - `getCollectionPlanEntry`
  - `listCollectionAttempts`
  - `getCollectionAttempt`
  - `getMortgageCollectionOperationsSummary`
  - `executeCollectionPlanEntry`
  - `rescheduleCollectionPlanEntry`
  - `createWorkoutPlan`
  - `activateWorkoutPlan`
  - `completeWorkoutPlan`
  - `cancelWorkoutPlan`
  - `createCollectionRule`
  - `updateCollectionRule`
- Likely demo-local types:
  - AMPS demo route and tab definitions
  - scenario catalog metadata
  - view-model adapters for rules, plan entries, attempts, and mortgage summaries

## Out of Scope
- Production admin-route rollout or admin information architecture
- Replacing the page-12 backend contracts with UI-specific backend shapes unless a minimal demo wrapper is required
- Final visual polish and presentation hardening that belong to page 16
- New business-domain payment behavior beyond what pages 2 through 15 already shipped
