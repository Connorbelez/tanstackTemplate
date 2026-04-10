# 06. Correct Activation and Initial Scheduling Handoff

> **Canonical Source of Truth**: https://www.notion.so/337fc1b4402481738c5ecc14f4e08da9
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
This workstream removes the remaining bootstrap-only shortcut for initial
collection scheduling. Obligations must remain the first contractual truth, and
the first `collectionPlanEntries` for a mortgage must be derived through the
same rules-engine semantics used elsewhere instead of direct insertion logic in
seed/bootstrap code.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Obligation-first activation | Preserve the sequence where mortgage terms generate obligations before collection strategy is derived. | P0 |
| F-2 | Canonical scheduling handoff | Introduce one shared activation/bootstrap handoff for initial schedule generation. | P0 |
| F-3 | Bootstrap convergence | Remove direct bootstrap insertion as a second source of truth for initial plan entries. | P0 |
| F-4 | Rules-engine-derived initial entries | Ensure the first collection strategy is produced through schedule-rule semantics. | P0 |
| F-5 | Idempotent reruns | Preserve safe reruns for bootstrap, activation, repair, and migration-style orchestration. | P0 |
| F-6 | Downstream compatibility | Keep page-03 execution and page-07 rule behavior working against the canonical output. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Obligation generation remains the first contractual step. | Functional | Activation/bootstrap creates or reuses obligations before attempting initial schedule generation. |
| REQ-2 | Initial scheduling must be rules-engine-derived rather than directly inserted as bootstrap truth. | Functional | No production/bootstrap path directly inserts first `collectionPlanEntries` while bypassing schedule-rule semantics. |
| REQ-3 | Seed/bootstrap flows may still exist, but they must call the same canonical scheduling logic as activation. | Functional | `seedPaymentData` and related orchestration use a shared scheduling contract rather than bespoke insertion code. |
| REQ-4 | There must be no dual-source truth for initial plan creation after this change. | Functional | One shared path owns initial plan creation semantics across bootstrap and activation-style flows. |
| REQ-5 | Activation must preserve the mortgage lifecycle boundary: mortgage truth remains obligation-driven, not collection-plan-driven. | Functional | Mortgage activation/lifecycle does not depend on plan-entry insertion to define contractual truth. |
| REQ-6 | Collection rules must be present before initial scheduling runs. | Functional | Bootstrap/activation ensures the default scheduling rule exists before using canonical scheduling. |
| REQ-7 | Initial scheduling reruns must be idempotent. | Functional | Re-running bootstrap or activation does not create duplicate initial `collectionPlanEntries`. |
| REQ-8 | Canonical initial plan entries must remain consumable by the page-03 execution spine and compatible with page-07 rules. | Functional | Downstream execution and retry/late-fee flows require no special-case handling for newly generated initial entries. |
| REQ-9 | Verification must compare the final repo against the live Notion spec and linked implementation plan. | Functional | A final gap analysis records coverage and any residual drift. |

## Use Cases
### UC-1: Bootstrap or activation creates the first collection strategy through the canonical handoff
- **Actor**: Seed/bootstrap or future activation orchestration
- **Precondition**: A mortgage exists and requires obligations plus initial schedule generation
- **Flow**:
  1. Mortgage terms are used to generate or reuse obligations
  2. Default collection rules are present
  3. Canonical scheduling logic evaluates the schedule rule for that mortgage
  4. Initial `collectionPlanEntries` are created through that shared path
- **Postcondition**: Initial scheduling is rule-driven and no bootstrap-only insertion path defines truth
- **E2E Test**: Backend integration coverage; browser e2e not required

### UC-2: Re-running bootstrap or repair does not duplicate initial entries
- **Actor**: Admin/bootstrap rerun or repair workflow
- **Precondition**: Obligations and initial plan entries may already exist
- **Flow**:
  1. The orchestration runs again for the same mortgage
  2. Existing obligations are reused
  3. Existing initial plan coverage is detected through canonical idempotency checks
  4. No duplicate initial plan entries are created
- **Postcondition**: The shared activation/bootstrap path is rerun-safe
- **E2E Test**: Backend integration coverage; browser e2e not required

### UC-3: Downstream execution and rule follow-ons continue to work against canonical output
- **Actor**: Collection-plan runner and follow-on rules
- **Precondition**: Initial plan entries were produced through the canonical activation/bootstrap handoff
- **Flow**:
  1. Page-03 execution discovers due `planned` entries
  2. Canonical execution proceeds without bootstrap-specific handling
  3. Retry and late-fee rules continue to operate from the same plan/obligation state model
- **Postcondition**: Initial scheduling convergence does not break downstream execution or lifecycle boundaries
- **E2E Test**: Backend integration coverage; browser e2e not required

## Schemas
- `obligations`
  - remain the first contractual truth created from mortgage terms
  - existing generated states and due-date windows remain authoritative
- `collectionRules`
  - `schedule_rule` remains the intended initial scheduling policy
  - default rules must exist before canonical scheduling runs
- `collectionPlanEntries`
  - initial entries remain `planned`
  - `source: "default_schedule"` and `ruleId` continue to record schedule-rule provenance
- bootstrap outputs
  - `seedPaymentData` and `seedAll` remain orchestration helpers, not alternate architectural truth

## Out of Scope
- New frontend routes, admin UX, or browser automation
- Reworking page-03 execution semantics beyond ensuring it consumes canonical initial entries
- Reworking retry or late-fee business semantics beyond preserving their compatibility with canonical initial schedule generation
- Broad schema or terminology cleanup deferred to later pages
- Full mortgage activation product flow if the repo still relies primarily on bootstrap/demo orchestration today
