# 07. Expand Collection Rule Model and Complete Retry/Late-Fee Behaviors

> **Canonical Source of Truth**: https://www.notion.so/337fc1b440248176af0ec126b8aac764
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
Page 07 upgrades `collectionRules` from a thin generic record into a typed, admin-operable strategy model while preserving the working schedule, retry, and late-fee behaviors already present in the repo. The immediate goal is not new collection behavior; it is to make the rule contract explicit, deterministic, and extensible so pages 08, 09, 10, and 12 can build on it without another architectural rewrite.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Typed Rule Contract | Replace implicit `name`/`parameters` interpretation with explicit rule kinds, metadata, and strongly separated config. | P0 |
| F-2 | Behavior Preservation | Preserve existing schedule, retry, and late-fee semantics while migrating representation. | P0 |
| F-3 | Deterministic Rule Evaluation | Keep enablement, priority, trigger matching, and ordering deterministic and auditable. | P0 |
| F-4 | Future Extension Readiness | Make the rule model ready for balance pre-check, reschedule, workout, and admin operations without implementing those later pages here. | P1 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Existing schedule, retry, and late-fee behavior must continue to work. | Functional | Current schedule, retry, and late-fee tests still pass after the model refactor. |
| REQ-2 | Rule type must be explicit and machine-verifiable. | Functional | Engine dispatch no longer depends on freeform `name`; typed kinds/config are validated. |
| REQ-3 | Rule configuration must be understandable and operable by admins. | Functional | Shared rule envelope includes admin-readable metadata rather than only opaque parameter blobs. |
| REQ-4 | The model must support future balance pre-check, reschedule, and workout capabilities. | Functional | Schema and engine admit future rule kinds without introducing another generic escape hatch. |
| REQ-5 | Rule evaluation order and enablement must remain deterministic. | Functional | Ordering remains stable under typed rule queries and evaluation helpers. |
| REQ-6 | Seed/default rule creation and any migration path must be idempotent. | Functional | Default typed rules can be seeded repeatedly without duplication or semantic drift. |
| REQ-7 | The rule system must remain strategy-layer configuration, not debt truth. | Non-functional | Contractual truth stays in obligations/plan entries/attempts; rules only decide strategy outcomes. |
| REQ-8 | Late-fee behavior must stay compatible with the existing mortgage fee configuration source. | Functional | Late-fee rule typing does not break fee lookup via `mortgageFees`. |
| REQ-9 | Page 07 should not require admin UI or route work ahead of page 12. | Non-functional | No new route/component work is required unless code inspection proves otherwise. |

## Use Cases
### UC-1: Schedule Rule Creates Initial Entries Through Typed Configuration
- **Actor**: System scheduler / activation orchestration
- **Precondition**: Active schedule rule exists and matching obligations are in scope
- **Flow**:
  1. Engine loads active rules for the schedule trigger.
  2. Engine dispatches by explicit rule kind.
  3. Schedule rule reads typed config and creates initial collection plan entries.
- **Postcondition**: Planned entries are created with the same behavior as today, but through a typed rule contract.
- **E2E Test**: Backend integration coverage during implementation

### UC-2: Retry Rule Schedules Deterministic Replacement Entries
- **Actor**: System on collection failure
- **Precondition**: A collection attempt fails and emits retry-eligible context
- **Flow**:
  1. Engine evaluates active event rules.
  2. Retry rule matches `COLLECTION_FAILED`.
  3. Retry rule applies typed backoff configuration and lineage checks.
  4. A retry plan entry is created exactly once when allowed.
- **Postcondition**: Retry scheduling remains idempotent, deterministic, and lineage-preserving.
- **E2E Test**: Backend integration coverage during implementation

### UC-3: Late-Fee Rule Creates Fee Obligations Through Typed Rule Semantics
- **Actor**: System on overdue obligation event
- **Precondition**: A late-fee rule is active and applicable mortgage fee configuration exists
- **Flow**:
  1. Engine evaluates active event rules.
  2. Late-fee rule matches `OBLIGATION_OVERDUE`.
  3. Rule reads typed config and resolves the existing mortgage fee source of truth.
  4. A late-fee obligation is created only when no duplicate exists.
- **Postcondition**: Late-fee obligations are still created correctly, but the rule contract is explicit and admin-readable.
- **E2E Test**: Backend integration coverage during implementation

### UC-4: Future Rule Kinds Can Be Added Without Reopening Generic Model Drift
- **Actor**: Future engineering/admin extension work
- **Precondition**: Typed rule contract is in place
- **Flow**:
  1. A new rule kind is introduced in the typed schema.
  2. Engine dispatch extends through the typed registry.
  3. Shared metadata and evaluation helpers continue to work.
- **Postcondition**: Future pages extend the rule system rather than bypassing it.
- **E2E Test**: Schema/contract coverage during implementation

## Schemas
- `collectionRules`
  - Current repo shape: `name`, `trigger`, `condition`, `action`, `parameters`, `priority`, `enabled`, timestamps
  - Target page-07 shape: typed rule envelope plus rule-specific config and deterministic metadata
- `collectionPlanEntries`
  - Existing `source` and `ruleId` linkage remain part of the behavioral contract
- `obligations`
  - Late-fee creation remains downstream of the rule engine and compatible with current obligation creation logic
- `mortgageFees`
  - Existing late-fee fee configuration remains the source of fee economics unless code changes prove that page 07 must absorb it

## Out of Scope
- Borrower balance pre-check behavior itself
- Borrower reschedule behavior itself
- Workout plan behavior itself
- Admin UI/routes for managing rules
- Renaming every legacy literal such as `source: "retry_rule"` unless implementation necessity forces it
