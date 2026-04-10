# 09. Implement Borrower Reschedule Capability

> **Canonical Source of Truth**: https://www.notion.so/337fc1b44024814f9c99ff923baa8ae7
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
Page 09 adds a governed borrower-reschedule capability to AMPS so future collection strategy can be reshaped without mutating obligation truth. The repo already has partial schema scaffolding via `collectionPlanEntries.status = "rescheduled"` and `rescheduledFromId`, but there is no canonical reschedule command, no eligibility model, and no explicit operator-auditable lineage flow. The first implementation should ship as an admin-governed backend capability with a borrower-ready contract surface, since the repo already hints at borrower permissions but does not yet expose a borrower channel.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Governed Reschedule Command | Add one canonical reschedule entrypoint for eligible future collection-plan strategy entries. | P0 |
| F-2 | Strategy-Only Mutation Boundary | Reschedule changes collection strategy, not obligation truth or mortgage lifecycle facts. | P0 |
| F-3 | Lineage & Auditability | Preserve original and replacement plan entries with inspectable linkage, actor attribution, and operator reasoning. | P0 |
| F-4 | Execution Compatibility | Ensure page-03 execution and page-07 retry behavior remain unambiguous for replacement entries. | P0 |
| F-5 | Borrower-Ready Contract | Keep the contract reusable for future borrower-facing surfaces while shipping an admin-governed first version. | P1 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Reschedule operates on collection strategy only. | Functional | No obligation row is created, deleted, or mutated by a reschedule operation. |
| REQ-2 | Only eligible entries can be rescheduled. | Functional | The implementation rejects entries that are already executing, completed, cancelled, already rescheduled, or otherwise no longer safe to replace. |
| REQ-3 | Original entry remains historically visible. | Functional | A successful reschedule preserves the source entry and marks it as non-executable rather than deleting or silently patching it. |
| REQ-4 | Replacement entry is explicit and linked. | Functional | Successful reschedule creates one replacement `collectionPlanEntries` row linked through lineage fields such as `rescheduledFromId`. |
| REQ-5 | Replacement entry becomes the future execution target. | Functional | The original entry does not execute after successful reschedule; the replacement entry can execute later through the canonical page-03 flow. |
| REQ-6 | Reason and actor attribution are required. | Functional | Operators can inspect who initiated the reschedule, why it happened, and what dates/amounts changed. |
| REQ-7 | Retry and downstream transfer logic stay consistent. | Functional | Retry-created entries and attempt/transfer reconciliation remain unambiguous after a reschedule. |
| REQ-8 | First version can ship without borrower UI delivery. | Non-functional | Backend/admin-governed workflow is acceptable if the contract stays reusable for borrower channels later. |
| REQ-9 | In-flight execution is rejected instead of patched. | Functional | If attempt creation or execution is already underway, reschedule returns an explicit rejection rather than mutating live execution state. |
| REQ-10 | Verification proves obligation immutability and lineage correctness. | Functional | Backend tests cover success, rejection, execution compatibility, and replay safety. |

## Use Cases
### UC-1: Operator Reschedules an Eligible Future Entry
- **Actor**: Operator/admin
- **Precondition**: A future `collectionPlanEntry` is still in a safe reschedulable state
- **Flow**:
  1. Operator submits a new execution date and a reason.
  2. The reschedule command validates eligibility and captures actor metadata.
  3. The original entry is marked `rescheduled`.
  4. A replacement planned entry is created with lineage back to the original.
- **Postcondition**: Obligations remain unchanged and the replacement entry becomes the future execution target.
- **E2E Test**: Backend integration coverage during implementation

### UC-2: Ineligible or In-Flight Entry Is Rejected
- **Actor**: Operator/admin
- **Precondition**: The entry is already executing, completed, cancelled, already rescheduled, or linked to live execution state
- **Flow**:
  1. Operator submits a reschedule request.
  2. The command evaluates lifecycle status and execution linkages.
  3. The command rejects the request with a structured reason.
- **Postcondition**: No replacement entry is created and the original entry remains unchanged.
- **E2E Test**: Backend integration coverage during implementation

### UC-3: Replacement Entry Executes Through the Canonical Spine
- **Actor**: System scheduler
- **Precondition**: A prior reschedule created a valid replacement entry
- **Flow**:
  1. Due-runner selects the replacement entry when it becomes due.
  2. Canonical plan-entry execution proceeds through page-03 attempt creation and Payment Rails handoff.
  3. Retry behavior, if later needed, links from the executed replacement entry rather than the superseded original.
- **Postcondition**: Reschedule lineage and later execution remain auditably consistent.
- **E2E Test**: Backend integration coverage during implementation

### UC-4: Borrower-Facing Surfaces Can Reuse the Same Contract Later
- **Actor**: Future borrower channel
- **Precondition**: Page-09 backend contract exists
- **Flow**:
  1. A later borrower-facing workflow invokes the same governed reschedule mutation or a thin wrapper over it.
  2. The mutation still records strategy-only lineage and audit metadata.
- **Postcondition**: Page 09 does not have to be re-architected when borrower UI arrives.
- **E2E Test**: Deferred beyond page 09 unless implementation forces UI work

## Schemas
- `collectionPlanEntries`
  - already includes `status = "rescheduled"` and `rescheduledFromId`
  - needs canonical usage rules for original vs replacement entries
  - may need additional operator-visible metadata for reason/actor attribution if current audit surfaces are insufficient
- `collectionAttempts`
  - must remain untouched during reschedule itself
  - later attempts should attach only to the replacement entry that actually executes
- `collectionRules`
  - page-07 already has a placeholder `reschedule_policy` kind, but there is no active rule implementation yet
- audit trail / journals
  - should reflect reschedule as an explicit governance event, not a silent patch

## Out of Scope
- Full borrower-facing reschedule UI
- Mortgage obligation restructuring or workout behavior
- Rewriting historical attempts, transfers, or cash ledger facts
- Automated approval policies for borrower-requested reschedules
- Reschedule count limits unless implementation reveals a hard correctness need
