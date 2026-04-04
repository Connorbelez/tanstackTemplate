# 05. Converge Inbound Provider Boundary on TransferProvider

> **Canonical Source of Truth**: https://www.notion.so/337fc1b4402481ceb962ca7c2eada7af
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
This workstream finishes the architectural convergence that earlier pages already
started: inbound provider execution should be described, implemented, and tested
through `TransferProvider`, while `PaymentMethod` remains an explicitly frozen
compatibility abstraction. The goal is not to delete compatibility code
prematurely, but to remove the impression that the repo supports two equal
forward-looking inbound provider boundaries.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Canonical provider boundary | Treat `TransferProvider` as the only forward-looking inbound provider contract. | P0 |
| F-2 | Production handoff convergence | Ensure AMPS-owned execution paths hand off into Unified Payment Rails, which then resolves providers through transfer-domain contracts only. | P0 |
| F-3 | Compatibility fencing | Keep `PaymentMethod`, its registry, and adapter usage available only for explicit compatibility or migration edges. | P0 |
| F-4 | Registry and adapter narrowing | Simplify provider resolution and make adapter usage clearly transitional instead of ambient architecture. | P0 |
| F-5 | Docs and test convergence | Rewrite docs and tests so future contributors do not read `PaymentMethod` and `TransferProvider` as peer abstractions. | P0 |
| F-6 | Verified migration posture | Leave a clear retirement path for remaining legacy surfaces without breaking legitimate compatibility use cases today. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | No new production inbound execution path may depend directly on `PaymentMethod`. | Functional | Canonical inbound execution and reconciliation surfaces resolve providers only through transfer-domain contracts and registries. |
| REQ-2 | AMPS execution code must hand off into Unified Payment Rails rather than provider selection details. | Functional | Page-02/03/04 execution paths reference transfer request creation and initiation, not direct payment-method lookup. |
| REQ-3 | Adapter usage must be explicit and compatibility-scoped. | Functional | `PaymentMethodAdapter` remains available only as an intentional bridge and is not presented as a normal provider extension point. |
| REQ-4 | `TransferProvider` must be the only forward-looking provider abstraction in current docs and examples. | Functional | New docs, examples, and tests describe inbound provider work in transfer-domain terms. |
| REQ-5 | Legacy `PaymentMethod` surfaces must remain compatibility-only until later retirement work. | Functional | Existing compatibility use cases keep working, but registries, mocks, and interfaces are labeled frozen or deprecated for new work. |
| REQ-6 | Provider resolution must happen through the transfer-provider registry for canonical inbound paths. | Functional | Production initiation flows resolve provider implementations via `getTransferProvider` or an equivalent transfer-domain boundary. |
| REQ-7 | Tests must stop implying equal architectural status between `PaymentMethod` and `TransferProvider`. | Functional | Legacy tests are relabeled as compatibility coverage; canonical tests target transfer-provider flows. |
| REQ-8 | Compatibility warnings or comments must make the migration direction obvious. | Functional | Remaining legacy entrypoints include clear deprecation or compatibility guidance. |
| REQ-9 | Convergence work must not break current manual or mock compatibility flows prematurely. | Functional | Adapter-backed or explicitly legacy tests still pass where compatibility is intentionally preserved. |
| REQ-10 | Verification must compare final code against the live Notion page and linked implementation plan. | Functional | A final gap analysis confirms the current repo matches the page-05 contract or records any residual gaps. |

## Use Cases
### UC-1: New inbound execution work resolves a canonical TransferProvider
- **Actor**: AMPS execution handoff plus Unified Payment Rails provider resolution
- **Precondition**: A business-layer command creates or initiates an inbound transfer
- **Flow**:
  1. AMPS creates or advances business execution state
  2. AMPS hands off into Unified Payment Rails
  3. Unified Payment Rails resolves a `TransferProvider`
  4. Provider initiation runs through the transfer-domain boundary
- **Postcondition**: No new production inbound work depends directly on `PaymentMethod`
- **E2E Test**: Backend/unit or integration coverage; browser e2e not required

### UC-2: A legacy compatibility path still uses PaymentMethod through an explicit bridge
- **Actor**: Compatibility-only registry or adapter path
- **Precondition**: An older test, seed, or migration edge still depends on `PaymentMethod`
- **Flow**:
  1. Compatibility path opts into a legacy `PaymentMethod` implementation
  2. Adapter or registry bridge makes the legacy dependency explicit
  3. Docs and code comments explain that the path is transitional only
- **Postcondition**: Compatibility still works, but does not present itself as the canonical architecture
- **E2E Test**: Backend/unit compatibility test; browser e2e not required

### UC-3: A future contributor reads the codebase and sees one canonical inbound provider story
- **Actor**: Engineer extending inbound provider functionality
- **Precondition**: They inspect provider interfaces, registries, docs, and examples
- **Flow**:
  1. Canonical interfaces and registries point to `TransferProvider`
  2. Legacy `PaymentMethod` surfaces are clearly marked compatibility-only
  3. Tests and examples reinforce the same boundary
- **Postcondition**: The repo does not suggest two equal provider abstractions
- **E2E Test**: Documentation and test-suite convergence; browser e2e not required

## Schemas
- `TransferProvider`
  - canonical transfer-domain provider contract for new inbound work
  - owned by Unified Payment Rails
- `PaymentMethod`
  - compatibility-only abstraction for older inbound collection flows
  - should not receive new production provider features
- provider registries
  - transfer-domain registry remains canonical for provider resolution
  - legacy methods registry remains compatibility-only until later removal
- adapter boundary
  - `PaymentMethodAdapter` exists only to bridge remaining compatibility use cases

## Out of Scope
- Implementing new real provider integrations such as Rotessa or other external processors
- Broad schema normalization and contract retirement deferred to page 11
- Reworking page-02/03/04 business execution semantics beyond boundary wording and provider-resolution ownership
- Full deletion of every legacy `PaymentMethod` surface if compatibility still requires it
- New frontend routes or browser UX work
