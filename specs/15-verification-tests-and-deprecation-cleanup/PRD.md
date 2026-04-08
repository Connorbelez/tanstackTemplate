# 15. Verification, Tests, and Deprecation Cleanup

> **Canonical Source of Truth**: https://www.notion.so/337fc1b4402481a5abd4c1804791ac9b
>
> This PRD is a compressed working context snapshot extracted from the Notion spec
> and linked implementation plan. Always defer to the Notion pages for the latest
> requirements. This file exists to keep local implementation context tight.

## Overview
Page 15 closes the AMPS backend realignment by proving the canonical production path end to end, demoting outdated legacy stories, and making the docs/tests tell one consistent architecture story.

The upstream Notion page mentions admin UI and demo validation, but that work is intentionally deferred by user instruction to later dedicated execution pages. The active page-15 scope is backend production-path verification, compatibility labeling, and documentation cleanup only.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Final Backend Verification Matrix | Prove the canonical AMPS backend flow and major follow-on behaviors through focused regression coverage. | P0 |
| F-2 | Legacy/Compatibility Test Cleanup | Rewrite, relabel, or demote older bridge-era and manual-transition tests so they no longer imply the wrong production architecture. | P0 |
| F-3 | Documentation Consistency Cleanup | Ensure local docs and local planning artifacts consistently describe the canonical path and compatibility-only seams. | P0 |
| F-4 | Alignment Findings Closure | Map the remaining alignment-report findings to explicit verification artifacts or intentional compatibility/deprecation notes. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | The canonical backend production path is explicitly verified. | Functional | Tests cover activation/handoff-derived scheduling, canonical execution, transfer initiation/settlement, obligation application, and cash posting across the implemented backend seams. |
| REQ-2 | Boundary invariants remain verified in the final suite. | Functional | Mortgage lifecycle and ledger boundary tests are part of the page-15 verification matrix. |
| REQ-3 | Outdated legacy stories are removed or clearly relabeled. | Non-functional | Tests and comments no longer imply bridge/manual compatibility paths are the forward-looking production architecture. |
| REQ-4 | Compatibility-only paths remain only where justified and are named as such. | Non-functional | Surviving bridge or legacy-provider coverage is clearly marked compatibility-only. |
| REQ-5 | Documentation is consistent with the shipped backend architecture. | Non-functional | Local docs, gap analyses, and related design notes agree on the canonical execution path and compatibility boundaries. |
| REQ-6 | The alignment report findings are explicitly closed or intentionally reclassified. | Functional | The page-15 closeout explains how the remaining findings were verified, deprecated, or deferred. |
| REQ-7 | Page 15 does not reintroduce deferred UI scope. | Non-functional | Admin UI, browser verification, and demo acceptance remain deferred to later dedicated execution pages. |
| REQ-8 | Final repo verification passes. | Functional | `bun check`, `bun typecheck`, and `bunx convex codegen` pass after the page-15 changes. |

## Use Cases
### UC-1: Backend Canonical Path Verification
- **Actor**: System / test harness
- **Precondition**: The page-02 through page-14 backend work is present
- **Flow**:
  1. The verification matrix exercises scheduling, execution, transfer initiation, settlement, obligation application, and cash posting.
  2. Retry, late-fee, balance-pre-check, reschedule, workout, and boundary behavior are covered through focused backend tests.
  3. The final suite proves the production backend path rather than only manual or seed-only shortcuts.
- **Postcondition**: The canonical backend AMPS path is verified.
- **E2E Test**: Backend regression coverage only

### UC-2: Compatibility Coverage Is Demoted Without Being Lost
- **Actor**: Developer / maintainer
- **Precondition**: Some bridge/manual compatibility paths still exist in code
- **Flow**:
  1. Existing legacy tests are reviewed against the now-canonical architecture.
  2. Tests that still matter are relabeled as compatibility-only.
  3. Tests that imply the wrong production story are rewritten or retired.
- **Postcondition**: Compatibility survives where needed, but the suite no longer teaches the wrong architecture.
- **E2E Test**: Backend regression coverage only

### UC-3: Documentation Matches the Real Backend
- **Actor**: Developer / maintainer
- **Precondition**: AMPS architecture decisions have shifted during pages 02 through 14
- **Flow**:
  1. Local docs and local spec artifacts are reviewed against current backend reality.
  2. Compatibility-only and deferred-scope notes are aligned.
  3. The final gap analysis maps alignment findings to implemented or deferred outcomes.
- **Postcondition**: The local docs tell the same story as the shipped backend.
- **E2E Test**: Documentation and artifact review during implementation

## Schemas
- No new product schema is expected
- Likely implementation artifacts:
  - rewritten or relabeled backend tests
  - new verification-matrix test helpers or focused scenarios
  - local documentation and gap-analysis updates

## Out of Scope
- Admin UI implementation
- Browser/e2e UI verification
- Stakeholder demo validation
- New backend product capabilities beyond what pages 02 through 14 already introduced
