# 08. Implement Balance Pre-Check Capability

> **Canonical Source of Truth**: https://www.notion.so/337fc1b440248194a6e6dd923b82acc9
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
Page 08 adds a balance pre-check capability inside AMPS so Collection Plan execution can make strategy-layer decisions before creating a `collectionAttempt`. The decision must not mutate obligations, must not impersonate provider settlement truth, and must remain visible to operators. The current repo has no AMPS-side balance rule, but it does already persist transfer failure reasons such as `NSF` / `insufficient_funds`, which provides a viable first-version balance heuristic without coupling AMPS to provider execution internals.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Typed Balance Rule | Replace the page-07 placeholder `balance_pre_check` rule config with a real decision model. | P0 |
| F-2 | Execution Gating | Apply balance-aware decisions before Collection Attempt creation in the canonical page-03 execution spine. | P0 |
| F-3 | Operator Visibility | Persist machine-readable and human-readable pre-check outcomes so operators can understand why execution did or did not proceed. | P0 |
| F-4 | Signal Boundary Discipline | Keep balance pre-check in AMPS and keep provider/bank-account validation in Payment Rails. | P0 |
| F-5 | Future Signal Readiness | Make the first implementation extensible to richer balance or liquidity signals later. | P1 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Balance pre-check lives in Collection Plan / AMPS strategy logic. | Functional | No provider adapter or transfer-domain validator becomes the owner of balance-gating behavior. |
| REQ-2 | Pre-check must not mutate obligations. | Functional | Gated execution changes plan-entry strategy state only; obligations remain unchanged. |
| REQ-3 | Pre-check must not replace provider truth. | Functional | A pass can still fail later in Payment Rails, and provider-side validation still runs for entries that proceed. |
| REQ-4 | Decision outcomes are explicit. | Functional | The implementation can return at least `proceed`, `defer`, `suppress`, and `require_operator_review`. |
| REQ-5 | Blocked execution does not create a Collection Attempt. | Functional | No `collectionAttempts` row is created when the balance pre-check blocks execution. |
| REQ-6 | Operators can inspect the reason for a gate. | Functional | Plan-entry state captures rule/result/reason metadata suitable for later page-12/page-13 surfaces. |
| REQ-7 | Deferred entries remain visible and auditable. | Functional | Deferred or review-blocked entries are not silently dropped from AMPS state. |
| REQ-8 | First version uses a real repo-grounded signal or explicit fallback. | Functional | If no external balance service exists, the first implementation uses a documented heuristic such as recent NSF history rather than fake provider truth. |
| REQ-9 | Page 08 should not require full admin UI delivery ahead of pages 12 and 13. | Non-functional | Backend state/query support may be added, but no major route/component work is required unless code proves otherwise. |
| REQ-10 | Verification must cover proceed, defer, suppress, and review-required outcomes. | Functional | Backend contract/integration tests prove each branch and confirm obligation immutability. |

## Use Cases
### UC-1: Eligible Entry Proceeds After a Clear Pre-Check
- **Actor**: System scheduler / admin-triggered execution
- **Precondition**: A due `collectionPlanEntry` is executable and the balance pre-check returns `proceed`
- **Flow**:
  1. Execution loads the plan entry and obligations.
  2. Balance pre-check evaluates current rule config and available signal history.
  3. Execution records a passing snapshot and continues into attempt creation.
- **Postcondition**: One Collection Attempt is created and Payment Rails initiation still runs separately.
- **E2E Test**: Backend integration coverage during implementation

### UC-2: Entry Is Deferred Without Changing Obligation Truth
- **Actor**: System scheduler
- **Precondition**: A due entry hits a balance rule that returns `defer`
- **Flow**:
  1. Balance pre-check evaluates before attempt creation.
  2. AMPS records the defer decision, reason, and next-eligible timing.
  3. No Collection Attempt is created in this run.
- **Postcondition**: The plan entry remains visible and will not execute again until the defer window allows it.
- **E2E Test**: Backend integration coverage during implementation

### UC-3: Entry Is Suppressed or Sent for Operator Review
- **Actor**: System scheduler / operator
- **Precondition**: A balance rule returns `suppress` or `require_operator_review`
- **Flow**:
  1. Balance pre-check evaluates before attempt creation.
  2. AMPS records the blocking decision and operator-visible reason metadata.
  3. Due-runner execution does not create an attempt.
- **Postcondition**: Operators can inspect the blocking reason later and the obligation remains unchanged.
- **E2E Test**: Backend integration coverage during implementation

### UC-4: Provider-Side Validation Still Runs Separately for Proceeding Entries
- **Actor**: Unified Payment Rails
- **Precondition**: AMPS pre-check returns `proceed`
- **Flow**:
  1. AMPS creates an attempt and handoff request.
  2. Transfer-domain validation still evaluates bank account / mandate prerequisites.
  3. Transfer execution may still fail independently of the pre-check.
- **Postcondition**: AMPS strategy gating and provider-side execution remain distinct concerns.
- **E2E Test**: Backend integration coverage during implementation

## Schemas
- `collectionRules`
  - Page-07 introduced `balance_pre_check` as a placeholder kind; page 08 must replace that placeholder config with a real decision contract.
- `collectionPlanEntries`
  - Needs pre-check decision metadata so blocked or deferred execution can remain visible and auditable.
- `collectionAttempts`
  - Must remain absent when the balance pre-check blocks execution.
- `transferRequests`
  - Existing failure metadata (`failureCode`, `failureReason`, borrower/counterparty linkage) is a viable first-version heuristic source for balance-aware gating.

## Out of Scope
- Real bank-balance provider integration
- Borrower reschedule policy behavior itself
- Workout policy behavior itself
- Full admin UI for pre-check inspection or override
- Replacing provider-side bank-account validation with AMPS logic
