# 01. Spec and Contract Cleanup

> **Canonical Source of Truth**: https://www.notion.so/337fc1b4402481db974fcf609859c7ba
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
This workstream aligns repo-facing documentation and code comments with the accepted
Active Mortgage Payment System architecture. It does not add the missing production
execution spine or richer rule capabilities; it stabilizes the vocabulary required
for those downstream changes to land coherently.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Contract vocabulary alignment | Align in-repo docs and comments with the accepted three-layer model. | P0 |
| F-2 | Canonical provider boundary | Mark `TransferProvider` as the canonical inbound provider contract for new work. | P0 |
| F-3 | Transitional compatibility guidance | Mark `PaymentMethod` and related adapters as migration-only compatibility surfaces. | P0 |
| F-4 | Boundary documentation | Document the canonical production path and obligation-driven lifecycle boundary. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Repo-facing docs and comments use one agreed vocabulary for Obligations, Collection Plan, and Collection Attempts. | Functional | Shared docs/comments no longer imply contradictory abstractions or collapsed layers. |
| REQ-2 | `TransferProvider` is explicit as the forward-looking inbound provider abstraction. | Functional | Interface docs and architecture docs state that new inbound integrations target `TransferProvider`. |
| REQ-3 | `PaymentMethod` is clearly documented as transitional compatibility. | Functional | Legacy interface comments and migration docs describe `PaymentMethod` as compatibility-only, not a peer contract for new work. |
| REQ-4 | The canonical production path and obligation-driven boundary are documented without ambiguity. | Functional | Docs describe `Collection Plan -> Collection Attempt -> transfer/provider settlement -> obligation application -> cash posting`, and state that mortgage lifecycle remains obligation-driven. |

## Use Cases
### UC-1: Engineer chooses the correct inbound provider abstraction
- **Actor**: Engineer adding or reviewing a payment integration
- **Precondition**: They are reading repo docs or code comments to determine the supported contract
- **Flow**:
  1. Read the payment interface documentation or design docs
  2. Identify which abstraction is canonical for new inbound work
  3. See how legacy compatibility is expected to behave during migration
- **Postcondition**: The engineer routes new work through `TransferProvider` and treats `PaymentMethod` as transitional compatibility
- **E2E Test**: Not applicable for this documentation-only cleanup

### UC-2: Engineer understands the three-layer execution boundary
- **Actor**: Engineer working on collection plan, collection attempts, or transfer execution
- **Precondition**: They need to understand the operational boundary before making changes
- **Flow**:
  1. Read the aligned architecture/ledger docs
  2. Confirm the business record remains `Collection Attempt`
  3. Confirm transfer execution and cash posting remain adjacent but separate concerns
- **Postcondition**: The engineer can implement downstream work without reintroducing dual-source or boundary ambiguity
- **E2E Test**: Not applicable for this documentation-only cleanup

## Schemas
- No schema changes are part of this workstream.
- The relevant contract surfaces are:
  - `convex/payments/methods/interface.ts`
  - `convex/payments/transfers/interface.ts`
  - `convex/payments/transfers/providers/adapter.ts`
  - repo-facing architecture and ledger docs that describe collection execution and provider boundaries

## Out of Scope
- Implementing the canonical plan-entry execution API
- Creating a production executor from Collection Plan into Collection Attempts
- Schema expansion for `collectionPlanEntries`, `collectionAttempts`, or `collectionRules`
- Admin query, mutation, or UI surfaces
- Balance pre-check, reschedule, and workout behaviors
