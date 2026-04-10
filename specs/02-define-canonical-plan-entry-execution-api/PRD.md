# 02. Define Canonical Plan Entry Execution API

> **Canonical Source of Truth**: https://www.notion.so/337fc1b440248115b4d3c21577f27601
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview
This workstream lands the canonical AMPS-side command for executing one
eligible Collection Plan entry into exactly one Collection Attempt. It defines
the shared input and result contract, replay-safe execution behavior, minimal
schema linkage, and the explicit AMPS -> Unified Payment Rails handoff boundary
without taking over the full production execution spine owned by downstream
workstreams.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Canonical execution command | Introduce one canonical internal command for plan-entry execution. | P0 |
| F-2 | Structured execution outcomes | Return explicit outcomes, reason codes, and linkage metadata instead of a bare ID. | P0 |
| F-3 | Business-layer replay safety | Prevent duplicate Collection Attempts for the same logical execution request. | P0 |
| F-4 | Payment Rails handoff boundary | Create the AMPS-side handoff into Unified Payment Rails without collapsing the Collection Attempt boundary. | P0 |
| F-5 | Contract-locking tests | Prove the execution contract before the page-03 spine is fully implemented. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | One canonical internal execution command exists. | Functional | A dedicated internal command executes plan entries and becomes the shared AMPS entrypoint. |
| REQ-2 | The command returns a structured result union keyed by `outcome`. | Functional | Callers receive `attempt_created`, `already_executed`, `not_eligible`, `rejected`, or `noop` with linkage and reasons. |
| REQ-3 | Replay safety is enforced before downstream transfer creation. | Functional | Repeated invocation of the same logical request reuses the first business attempt instead of creating a duplicate. |
| REQ-4 | The command creates the Collection Attempt before any Payment Rails handoff. | Functional | Attempt creation and plan-entry consumption happen before transfer-request creation is attempted. |
| REQ-5 | AMPS stops at the Payment Rails handoff boundary. | Functional | The new command uses the transfer-request contract and does not call `TransferProvider` directly. |
| REQ-6 | The command does not directly settle obligations, post cash, or drive mortgage delinquency state. | Functional | No obligation settlement, cash posting, or mortgage transition logic is added to the executor itself. |
| REQ-7 | Minimal schema support exists for replay-safe execution and downstream traceability. | Functional | Plan entries and attempts persist enough metadata to lock one attempt per execution and reconcile downstream transfer linkage. |
| REQ-8 | Contract-focused tests lock the behavior before page 03. | Functional | Tests cover `attempt_created`, `already_executed`, `not_eligible`, `rejected`, and handoff failure preserving the attempt. |

## Use Cases
### UC-1: System-triggered execution runs an eligible plan entry
- **Actor**: Scheduler or workflow-driven AMPS execution path
- **Precondition**: A plan entry exists, is executable, and has the required business metadata
- **Flow**:
  1. Call the canonical execution command with a stable idempotency key
  2. Validate eligibility and replay safety
  3. Create exactly one Collection Attempt
  4. Handoff to Payment Rails through transfer-request creation when appropriate
- **Postcondition**: Exactly one Collection Attempt exists as the business execution record
- **E2E Test**: Not required for this contract-focused backend workstream

### UC-2: Safe replay reuses the same business attempt
- **Actor**: Scheduler replay, workflow replay, or duplicate command delivery
- **Precondition**: The logical execution request was already processed once
- **Flow**:
  1. Call the canonical execution command again with the same logical request
  2. Replay detection finds the existing attempt or consumed plan entry
  3. Return a structured `already_executed` result
- **Postcondition**: No duplicate Collection Attempt is created
- **E2E Test**: Not required for this contract-focused backend workstream

### UC-3: Invalid or ineligible plan entries are rejected without side effects
- **Actor**: System or admin caller
- **Precondition**: The request is malformed, out of scope, or the plan entry is not executable
- **Flow**:
  1. Call the command with invalid or ineligible input
  2. The command classifies the failure as `rejected` or `not_eligible`
  3. No attempt is created and no transfer handoff occurs
- **Postcondition**: The caller receives an explicit machine-readable result and the plan entry remains unchanged
- **E2E Test**: Not required for this contract-focused backend workstream

## Schemas
- `collectionPlanEntries`
  - existing business strategy record
  - needs minimum execution linkage and consumption metadata
- `collectionAttempts`
  - existing business execution record
  - needs minimum execution metadata and downstream transfer linkage
- `transferRequests`
  - existing Unified Payment Rails handoff record
  - reused through the existing transfer-request creation contract

## Out of Scope
- Full scheduler and workflow integration
- Full page-03 production execution spine and transaction-boundary work
- Transfer lifecycle orchestration, webhook settlement, and downstream reconciliation
- Broad schema redesign for retries, reschedules, and admin metadata
- Admin UI or operator-facing execution screens
- Obligation settlement, borrower cash posting, or mortgage delinquency/cure behavior
