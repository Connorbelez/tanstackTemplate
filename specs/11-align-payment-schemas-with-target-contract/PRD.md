# 11. Align Payment Schemas with Target Contract

> **Canonical Source of Truth**: https://www.notion.so/337fc1b44024814c9598f556312c62e9
>
> This PRD is a compressed working context snapshot extracted from the Notion spec
> and linked implementation plan. Always defer to the Notion pages for the latest
> requirements. This file exists to keep local implementation context tight.

## Overview
Page 11 is a schema-convergence pass across `collectionPlanEntries`, `collectionAttempts`, and `collectionRules`. The repo has already materially advanced since the older schema page was written: plan entries now have execution linkage, attempts already carry transfer-request linkage, and rules already have a typed contract. The remaining work is to remove the mismatch between current repo truth, the target schema contract, and the downstream admin/demo work that will consume these tables.

This is not a net-new capability page. It is a cleanup and sharpening pass so pages 12, 13, 15, and 16 can build against one coherent payment schema instead of transitional fields and mixed naming.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Collection Plan Entry Contract Alignment | Align `collectionPlanEntries` with the target execution, source, and lineage contract. | P0 |
| F-2 | Collection Attempt Contract Alignment | Align `collectionAttempts` with the transfer-mediated business execution model. | P0 |
| F-3 | Typed Rule Contract Canonicalization | Make the typed/admin-operable rule shape clearly canonical and fence or remove weaker legacy semantics. | P0 |
| F-4 | Consumer Migration Safety | Update downstream code, seeds, tests, and admin consumers to the converged schema without leaving dual-source truth. | P0 |
| F-5 | Schema/Docs Sync | Bring repo schema, code comments, and the Notion schema story back into alignment. | P1 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Plan entries expose canonical execution linkage. | Functional | `collectionPlanEntries` clearly represent whether/how an entry was consumed by the execution spine. |
| REQ-2 | Plan entries expose canonical strategy lineage. | Functional | Retry, reschedule, workout, and rule-created lineage are represented without ambiguous overloaded fields. |
| REQ-3 | Plan entries carry enough business context for admin use. | Functional | Downstream admin and inspection surfaces can reason about entries without reconstructing the entire world from adjacent tables. |
| REQ-4 | Attempts remain business-owned execution records. | Functional | `collectionAttempts` carry business execution context and transfer linkage without becoming transfer-owned records. |
| REQ-5 | Attempt-to-transfer reconciliation is explicit. | Functional | Attempt records have stable, auditable linkage to transfer-domain execution and outcomes. |
| REQ-6 | Attempts do not accumulate duplicate transfer semantics. | Functional | The schema does not introduce redundant aliases for the same transfer/provider fact unless there is clear distinct meaning. |
| REQ-7 | Rules use a typed canonical contract. | Functional | `collectionRules` canonical consumers rely on typed rule fields, not the older generic `name` / `action` / `parameters` shape. |
| REQ-8 | Transitional field meanings are removed or clearly migrated. | Functional | Field names and semantics on the core collection tables are no longer ambiguous to downstream code. |
| REQ-9 | Greenfield cleanup is preferred over compatibility debt. | Non-functional | The implementation may make sweeping schema cleanup changes because there is no production-data constraint. |
| REQ-10 | Verification covers downstream consumers. | Functional | Tests and consumer updates prove removed or renamed schema fields do not silently break the execution spine or admin surfaces. |

## Use Cases
### UC-1: Canonical Execution Surfaces a Plan Entry and Attempt Clearly
- **Actor**: Operator/admin, scheduler, developer
- **Precondition**: A collection plan entry has been created and may or may not have been executed
- **Flow**:
  1. A consumer reads the plan entry.
  2. The schema clearly communicates strategy origin, lineage, and execution-consumption state.
  3. The linked attempt, if any, carries the business execution context without requiring ambiguous joins.
- **Postcondition**: Operators and downstream code can reason about one collection execution flow from plan to attempt cleanly.
- **E2E Test**: Backend contract and integration coverage during implementation

### UC-2: Attempt-to-Transfer Reconciliation Remains Explicit
- **Actor**: Reconciliation logic, admin inspection surfaces
- **Precondition**: A collection attempt has handed off into transfer-domain execution
- **Flow**:
  1. A transfer request or downstream provider outcome is linked back to the attempt.
  2. Attempt state remains business-owned while transfer state remains transfer-owned.
  3. Reconciliation and admin consumers can inspect the linkage without relying on weak interim semantics.
- **Postcondition**: Attempt/transfer ownership boundaries stay explicit while the linkage is auditable.
- **E2E Test**: Backend integration coverage during implementation

### UC-3: Rules Are Managed and Consumed Through One Canonical Shape
- **Actor**: Admin consumers, rules engine, seed/test helpers
- **Precondition**: A rule exists for scheduling, retry, late fee, balance pre-check, reschedule policy, or workout policy
- **Flow**:
  1. The rule is read or written through typed rule fields.
  2. Legacy generic fields do not create competing semantics.
  3. Seeds, tests, and rule evaluation all use the same contract.
- **Postcondition**: Rules are admin-operable and type-safe without dual-source metadata.
- **E2E Test**: Backend contract and integration coverage during implementation

### UC-4: Downstream Admin Surfaces Can Build on the Final Contract
- **Actor**: Future page-12/page-13 admin surfaces
- **Precondition**: Core payment entities are queried for display and operations
- **Flow**:
  1. Admin queries consume the converged schema.
  2. Derived UI state does not depend on transitional field meanings.
  3. Demo/admin work can proceed against a stable contract.
- **Postcondition**: Page-12/page-13 work does not have to build around schema drift.
- **E2E Test**: Backend query and contract coverage during implementation

## Schemas
- `collectionPlanEntries`
  - likely remaining target deltas: direct `mortgageId`, clearer retry lineage, clearer rule-origin naming, richer timestamps such as cancellation visibility
- `collectionAttempts`
  - likely remaining target deltas: direct `mortgageId` / `obligationIds` business snapshots, clearer attempt-owned lifecycle timestamps, and explicit transfer linkage cleanup
- `collectionRules`
  - already materially typed, but still carries legacy generic fields that may need removal, deprecation, or deterministic migration
- generated Convex data model / validators
  - must stay aligned after schema cleanup

## Out of Scope
- New business capabilities beyond the schema/contract cleanup already implied by pages 02 through 10
- Borrower-facing UX
- Re-architecting Unified Payment Rails or transfer-domain ownership boundaries
- Rewriting mortgage lifecycle semantics
- Browser e2e unless implementation forces UI/admin-surface work
