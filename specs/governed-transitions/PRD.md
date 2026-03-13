# Governed Transitions — Demo

> **Canonical Source of Truth**: https://www.notion.so/313fc1b440248189a811ee4c5e551798
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview

Build an interactive demo showcasing FairLend's Governed Transitions pattern — where every business-critical state change passes through a formally verifiable XState v5 machine. The demo implements all 5 components (Machine Registry, Command Envelope, Transition Engine, Audit Journal, Effect Scheduler) using a simplified Loan Application domain, demonstrating source-agnostic commands, guard-based validation, rejected command logging, and declarative side effects.

### Design Philosophy

**The database is the source of truth. The machine is the law. The journal is the receipt.**

Governed Transitions is NOT:
- **CQRS** — no separate read/write stores, no projection rebuilds
- **Event Sourcing** — the database row is the source of truth, not the event stream. The journal is a receipt, not a reconstruction mechanism. You never replay the journal to reconstruct state.
- **A message bus** — no pub/sub, no eventual consistency. Transitions are synchronous within a Convex mutation.

### The Seven Rules

These are the invariants of the pattern. Every implementation decision must honor them:

1. **The machine is the law.** If a transition isn't in the machine definition, it cannot happen. Period.
2. **Status changes go through the engine.** No direct `ctx.db.patch(id, { status: "..." })` outside the Transition Engine. Ever.
3. **Commands are source-agnostic.** The machine never branches on `source.channel` or `source.actorType`. Source is audit metadata.
4. **Guards are pure functions.** No I/O, no database reads, no async. If you need external data for a guard, load it before calling the engine and pass it in the command payload.
5. **Effects are fire-and-forget.** The transition is committed before effects run. Effect failure doesn't roll back the transition.
6. **The journal records everything.** Successful transitions and rejected commands. An auditor can reconstruct the complete decision history.
7. **Machine definitions are pure data.** No imports from Convex, no database references, no environment variables. They are testable in isolation.

## Features

| ID  | Feature                    | Description                                                                                                  | Priority |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| F-1 | XState Machine Definition  | Pure XState v5 machine for a Loan Application lifecycle with guards, actions, and terminal states             | P0       |
| F-2 | Transition Engine          | Single Convex mutation that hydrates machine state, validates transitions, persists, journals, schedules      | P0       |
| F-3 | Command Envelope           | Source-agnostic command interface with channel/actor metadata for audit                                       | P0       |
| F-4 | Audit Journal              | Append-only journal recording every command (successful transitions + rejections) with full context           | P0       |
| F-5 | Effect Scheduler           | Declarative side effects referenced by string name in machine, resolved and scheduled by engine               | P1       |
| F-6 | Interactive Command Center | UI to create entities, send commands from different sources, see real-time state changes                      | P0       |
| F-7 | Journal Viewer             | Searchable audit journal showing transitions and rejections with source/actor detail                         | P0       |
| F-8 | State Visualization        | Visual state machine diagram showing current state, available transitions, and guard requirements             | P1       |
| F-9 | Machine Inspector          | View machine definition, enumerate valid transitions from any state, test transitions                        | P1       |

## Requirements

| ID    | Requirement                                                              | Type           | Acceptance Criteria                                                                    |
| ----- | ------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------- |
| REQ-1 | Machine definitions are pure data — no Convex/DB imports                 | Architectural  | Machine file has zero Convex imports, only xstate                                      |
| REQ-2 | Status changes only go through the Transition Engine mutation             | Architectural  | No direct `ctx.db.patch(id, { status })` outside the engine                            |
| REQ-3 | Commands are source-agnostic — machine never branches on source          | Functional     | Same event type produces same outcome regardless of source channel                     |
| REQ-4 | Rejected commands are journaled with reason                              | Functional     | Invalid transitions produce journal entry with outcome="rejected"                      |
| REQ-5 | Guards are pure functions — no I/O, no async                             | Architectural  | Guards only read machine context and event payload                                     |
| REQ-6 | Effects are fire-and-forget — scheduled after transition persists         | Architectural  | Effects run via ctx.scheduler.runAfter, not inline                                     |
| REQ-7 | Journal is append-only                                                   | Non-functional | No update/delete mutations exposed for journal table                                   |
| REQ-8 | Demo uses `demo_` prefixed tables                                        | Convention     | All tables named `demo_gt_*`                                                           |
| REQ-9 | Demo integrates with existing audit infrastructure                       | Functional     | Uses auditTrail component for hash-chain copy of journal entries                       |
| REQ-10| Journal entry is atomic with entity state change                         | Architectural  | Both ctx.db.patch (entity) and ctx.db.insert (journal) happen in same mutation         |

## Use Cases

### UC-1: Create a Governed Entity
- **Actor**: Demo user
- **Precondition**: Demo page is loaded
- **Flow**: 1. User fills in entity label and loan amount → 2. System creates entity with status="draft" via `createEntity` mutation → 3. Entity appears in list with current state highlighted
- **Postcondition**: Entity exists in `demo_gt_entities` with status "draft", entityType "loanApplication"

### UC-2: Send a Valid Command
- **Actor**: Demo user
- **Precondition**: Entity exists in non-terminal state
- **Flow**: 1. User selects entity → 2. UI shows available transitions via `getValidTransitions` query → 3. User selects an event type button → 4. Selects a source channel from dropdown (borrower_portal/broker_portal/admin_dashboard/api_webhook/scheduler) → 5. Submits command → 6. Transition Engine validates via XState, persists new status, writes journal entry, schedules effects → 7. UI updates reactively showing new state
- **Postcondition**: Entity status changed, journal entry with outcome="transitioned", effects logged

### UC-3: Send an Invalid Command (Rejection)
- **Actor**: Demo user
- **Precondition**: Entity exists
- **Flow**: 1. User selects entity → 2. UI shows ALL possible events (not just valid ones) with invalid ones visually distinguished → 3. User clicks an invalid event → 4. Transition Engine detects state unchanged after `machine.transition()` → 5. Journal entry created with outcome="rejected" and reason "No valid transition for {eventType} from {currentState}" → 6. UI shows rejection toast/feedback
- **Postcondition**: Entity status unchanged, journal entry with outcome="rejected" and reason

### UC-4: View Audit Journal
- **Actor**: Demo user
- **Precondition**: Commands have been sent
- **Flow**: 1. User navigates to Journal tab → 2. Sees reverse-chronological list of all transitions and rejections → 3. Each entry shows: event type, previous→new state, outcome badge, source channel/actor, timestamp → 4. Can filter by entity (dropdown), outcome (toggle), source channel
- **Postcondition**: Complete audit trail visible with filtering

### UC-5: Inspect State Machine
- **Actor**: Demo user
- **Precondition**: None
- **Flow**: 1. User navigates to Machine tab → 2. Sees state diagram rendered as interactive HTML/CSS nodes and edges → 3. Each state node shows its name and whether it's terminal → 4. Edges show event names and guard names → 5. If entity is selected, current state is highlighted → 6. User can see a transition table: [From State → Event → Guard? → To State → Effects]
- **Postcondition**: Machine definition is fully explorable

### UC-6: Walk Through Full Lifecycle
- **Actor**: Demo user
- **Precondition**: None
- **Flow**:
  1. User clicks "Run Full Lifecycle" button
  2. System creates a new entity labeled "Lifecycle Demo — {timestamp}"
  3. System executes the following transitions sequentially in a single mutation:
     - `SUBMIT` from `borrower_portal` (actor: "borrower-demo") → draft → submitted
     - `ASSIGN_REVIEWER` from `admin_dashboard` (actor: "admin-demo") → submitted → under_review
     - `APPROVE` from `admin_dashboard` (actor: "admin-demo") → under_review → approved
     - `FUND` from `api_webhook` (actor: "system") → approved → funded
     - `CLOSE` from `scheduler` (actor: "system") → funded → closed
  4. Each transition produces its own journal entry with a different source
  5. User sees the entity in "closed" state and 5 journal entries showing the journey
- **Postcondition**: Entity in terminal state "closed", journal shows complete lifecycle with 5 transitions from 4 different source channels

## Schemas

### demo_gt_entities
- `entityType`: string (machine type key, always "loanApplication" in demo)
- `label`: string (user-visible name)
- `status`: string (current XState state value — the machine is the authority, not the schema)
- `machineContext`: optional any (accumulated state for guards — unused in demo but included for pattern fidelity)
- `lastTransitionAt`: optional number (timestamp of last successful transition)
- `data`: optional any (domain-specific payload, e.g. `{ loanAmount: 450000, applicantName: "Alice" }`)
- `createdAt`: number
- Index: `by_status` on [status]
- Index: `by_type` on [entityType]

### demo_gt_journal
- `entityType`: string
- `entityId`: id of demo_gt_entities
- `eventType`: string (XState event type, e.g. "SUBMIT", "APPROVE")
- `payload`: optional any (event-specific data passed with the command)
- `previousState`: string
- `newState`: string (same as previousState on rejection)
- `outcome`: "transitioned" | "rejected"
- `reason`: optional string (rejection reason, e.g. "No valid transition for APPROVE from draft")
- `source`: object { channel: string, actorId?: string, actorType?: string, sessionId?: string }
- `machineVersion`: optional string (machine definition ID)
- `timestamp`: number
- `effectsScheduled`: optional array of strings (names of effects that were scheduled)
- Index: `by_entity` on [entityId, timestamp]
- Index: `by_outcome` on [outcome, timestamp]

### demo_gt_effects_log
- `entityId`: id of demo_gt_entities
- `journalEntryId`: id of demo_gt_journal
- `effectName`: string (matches the string name in the machine definition)
- `status`: "scheduled" | "completed" | "failed"
- `scheduledAt`: number
- `completedAt`: optional number
- Index: `by_entity` on [entityId]
- Index: `by_journal` on [journalEntryId]

## Out of Scope
- Real integrations (email, Plaid, WorkOS provisioning) — effects are simulated
- Multiple machine types in registry — demo uses a single Loan Application machine (registry pattern is still used, just with one entry)
- Cross-entity coordination — would require multiple machine types
- Parallel/nested states (Deal Closing pattern) — demo uses flat states for clarity
- machineContext with guards that accumulate across transitions — demo guard checks event payload only
- Production-grade transition engine (the real one will be shared infrastructure)
- The `ip` field from the production `CommandSource` — demo runs in browser where IP collection isn't meaningful

## Addendum — Demo Route UI Refinement

This addendum refines the demo route UX while preserving the existing route structure, backend APIs, and core use cases. In case of conflict, this addendum supersedes earlier generic frontend wording.

### Demo Route Interaction Model

The `/demo/governed-transitions` route is divided into three surfaces:

1. **Command Center** — the only interactive surface. Users can create entities, select an entity, choose a command, choose a source channel, submit commands, seed data, reset the demo, and run the full lifecycle.
2. **Journal** — a read-only observer surface backed by the existing `InteractiveLogsTable` component via a governed-transitions-specific adapter.
3. **Machine** — a read-only observer surface backed by the existing `N8nWorkflowBlock` component via a governed-transitions-specific adapter.

### Read-Only Observer Rule

The Journal and Machine tabs are presentation-only views.

- They may support inspection affordances such as filtering, searching, row expansion, and current-state highlighting.
- They may not dispatch commands, mutate entity state, edit topology, reorder states, add/remove nodes, or perform any destructive action.
- All state changes must continue to originate from the Command Center and flow through the Transition Engine mutation.

### Component Reuse Strategy

The demo should explicitly reuse:

- `src/components/ui/interactive-logs-table-shadcnui.tsx` for journal/audit visualization
- `src/components/ui/n8n-workflow-block-shadcnui.tsx` for state machine visualization

These components should be wrapped or adapted for governed-transitions-specific display semantics rather than used as-is if they expose generic workflow/log behaviors that conflict with the read-only observer rule.

### Updated UX Expectations

- The Journal tab should feel like an audit console, not an editor.
- The Machine tab should feel like a live machine/status viewer, not a workflow builder.
- The Command Center remains the sole place where demo users can take actions that change persisted state.
