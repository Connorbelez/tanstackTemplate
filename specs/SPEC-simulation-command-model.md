# Simulation Command Model

## PRD

### Overview

This spec defines a deterministic backend simulation engine that can replay mortgage-market activity day by day and produce the exact same ending state every time from the same seed, command list, and code version.

The simulation is not a UI feature. It is a correctness harness for:

- mortgage ownership replay,
- ledger state reconstruction,
- obligation and default lifecycle testing,
- audit/export verification,
- and Playwright-driven end-to-end validation.

The harness must be able to start from a known seed state, execute a programmatic daily command stream, export the state on any day, and reconstruct the final ledger state from the exported commands alone.

### Goals

1. Provide a deterministic command model for daily simulation over at most 11 months.
2. Support a complete command journal with replay inputs, outputs, and audit metadata.
3. Validate every command before any ledger write happens.
4. Execute secondary trades through lower-level ledger primitives directly, not through deal-closing workflows.
5. Export day-level state, day-1 post-seed state, and the full command schedule in a form that can be replayed offline.
6. Integrate with the existing mortgage and obligation machinery where it already exists, without assuming missing renewal behavior.

### Non-Goals

- Building a new marketplace UI.
- Implementing new payment rails or third-party settlement providers.
- Replacing the production loan closing workflow.
- Adding renewals beyond what the current obligation/mortgage lifecycle can prove correctly.
- Simulating beyond 11 months unless renewal handling is explicitly added and validated.

### Scope

The simulation should support these command families:

| Command | Meaning | Ledger/Engine Path |
| --- | --- | --- |
| `mintMortgage` | Create a mortgage and initialize its treasury state. | `convex/ledger/postEntry.ts` via mortgage mint primitives |
| `buyMortgage` | Primary acquisition from treasury into an investor position. | Direct ledger issuance primitives |
| `sellMortgage` | Full-position secondary exit from one investor to another. | Direct ledger transfer primitives |
| `tradeMortgage` | Secondary whole-position transfer used for negotiated sales. | Direct ledger transfer primitives |
| `tradeFraction` | Partial secondary transfer of a mortgage position. | Direct ledger transfer primitives |
| `default` | Drive a mortgage into default or delinquency states when supported. | Existing mortgage/obligation machinery |
| `renewal` | Renew a mortgage only if the current lifecycle already supports it. | Existing mortgage/obligation machinery |

If default or renewal behavior is not fully supported by the current backend, the simulation must narrow to the commands that are supported and cap the run at 11 months.

### Business Requirements

1. The system must reject impossible ownership moves before any write occurs.
2. The system must preserve ledger invariants during the entire simulation.
3. The system must preserve an audit trail of who executed each command, when it was effective, and what state it changed.
4. The system must produce exports that can be consumed by Excel, CSV-based audit review, or an offline replay script.
5. The system must produce the same final state when replayed from the same exported command set.
6. The system must support state exports for any day in the run, including the first day after seeding.

### User Stories

1. As an auditor, I can export every command and reconstruct the exact final ledger state.
2. As a tester, I can step the simulation forward one day at a time and compare exported state against expected snapshots.
3. As a developer, I can generate a deterministic command schedule from a single seed.
4. As a product owner, I can confirm that invalid trades, overdrafts, or cross-mortgage transfers are rejected before posting.
5. As a QA engineer, I can run Playwright against the simulation and assert that ledger state, obligation state, and audit exports match.

### Acceptance Criteria

- The simulation can execute deterministically from a seed and command schedule.
- Every command has a unique idempotency key and a stable replay identity.
- Invalid commands fail before any ledger mutation.
- Secondary trades do not go through the deal-closing workflow.
- The simulation can export a ledger snapshot for any day in the run.
- The simulation can export the day-1 post-seed state.
- The simulation can export the full command schedule and all replay inputs.
- If renewals are not supported, the run horizon is limited to 11 months.
- Replaying the exported commands reproduces the exact same end state.

### Relevant Existing Code

- `convex/demo/simulation.ts` currently contains seed/advance/settlement logic but not a full command journal model.
- `docs/SIMULATION_DEMO_SPEC.md` describes a higher-level simulation demo and exposes the current gap around obligation state-machine coverage.
- `convex/ledger/postEntry.ts` is the authoritative ledger write path and must remain the validation choke point.
- `convex/ledger/queries.ts` already provides point-in-time ledger reconstruction helpers that the simulation should reuse.
- `convex/payments/obligations/generate.ts` and `convex/payments/obligations/crons.ts` are the right integration points for obligation generation and daily lifecycle transitions.
- `convex/engine/effects/dealClosing.ts` is explicitly not the path for simulation secondary trades.

## TDD

### Architecture Summary

The simulation should be implemented as a deterministic command journal plus a replay engine.

The core design is:

1. Seed a run with a known start date, asset set, investor set, and RNG seed.
2. Generate or load a dated command schedule.
3. Validate each command against the current in-memory simulation projection and the live ledger state.
4. Execute each command through the lowest correct backend primitive.
5. Persist command execution results, state snapshots, and replay artifacts.
6. Export any day as a full state snapshot and as a replay bundle.

### Proposed Data Model

Add simulation-specific tables instead of overloading production ledger tables.

#### `simulation_runs`

Fields:

- `runId`
- `scenarioName`
- `scenarioVersion`
- `seed`
- `startDate`
- `endDate`
- `horizonMonths`
- `status` (`seeded`, `running`, `completed`, `failed`)
- `createdAt`
- `updatedAt`
- `notes`

Purpose:

- One row per simulation run.
- Stores the immutable scenario identity and replay seed.

#### `simulation_commands`

Fields:

- `runId`
- `commandId`
- `dayIndex`
- `effectiveDate`
- `commandType`
- `actorId`
- `actorType`
- `channel`
- `idempotencyKey`
- `payload`
- `preconditions`
- `status` (`pending`, `accepted`, `rejected`, `executed`)
- `rejectionCode`
- `rejectionReason`
- `result`
- `resultHash`
- `createdAt`
- `executedAt`

Purpose:

- Stores the entire command journal in execution order.
- Provides the deterministic replay input for the harness.

#### `simulation_snapshots`

Fields:

- `runId`
- `dayIndex`
- `snapshotDate`
- `ledgerState`
- `obligationState`
- `portfolioState`
- `exportFormat`
- `contentHash`
- `createdAt`

Purpose:

- Stores day-level state exports.
- Supports day-1 and any-day reconstruction.

#### `simulation_artifacts`

Fields:

- `runId`
- `artifactType` (`commands_csv`, `ledger_csv`, `state_json`, `replay_bundle`)
- `dayIndex`
- `content`
- `contentHash`
- `createdAt`

Purpose:

- Holds export payloads used by Playwright and offline verification.

### Command Grammar

Use a discriminated union so the harness can generate and validate commands programmatically.

```ts
type SimulationCommand =
  | {
      commandType: "mintMortgage";
      mortgageId: string;
      principalCents: number;
      effectiveDate: string;
      actorId: string;
      actorType: "system" | "user";
      channel: "simulation" | "playwright";
      idempotencyKey: string;
    }
  | {
      commandType: "buyMortgage";
      mortgageId: string;
      investorId: string;
      units: bigint;
      effectiveDate: string;
      actorId: string;
      actorType: "system" | "user";
      channel: "simulation" | "playwright";
      idempotencyKey: string;
    }
  | {
      commandType: "sellMortgage" | "tradeMortgage";
      mortgageId: string;
      sellerInvestorId: string;
      buyerInvestorId: string;
      units: bigint;
      effectiveDate: string;
      actorId: string;
      actorType: "system" | "user";
      channel: "simulation" | "playwright";
      idempotencyKey: string;
    }
  | {
      commandType: "tradeFraction";
      mortgageId: string;
      sellerInvestorId: string;
      buyerInvestorId: string;
      units: bigint;
      effectiveDate: string;
      actorId: string;
      actorType: "system" | "user";
      channel: "simulation" | "playwright";
      idempotencyKey: string;
    }
  | {
      commandType: "default" | "renewal";
      mortgageId: string;
      effectiveDate: string;
      actorId: string;
      actorType: "system" | "user";
      channel: "simulation" | "playwright";
      idempotencyKey: string;
      payload?: Record<string, unknown>;
    };
```

### Execution Flow

1. Seed the run.
2. Generate the dated command stream.
3. Sort commands by `effectiveDate`, then by stable tie-breaker order, then by `commandId`.
4. For each command:
   - build the precondition projection,
   - validate the command against the current ledger state,
   - execute the command inside one Convex transaction,
   - record the result or rejection,
   - write a day snapshot when the calendar day changes.
5. Export day-1 state after seeding and before the first scheduled market event.

### Command Routing Rules

#### `mintMortgage`

- Create the mortgage and the treasury state.
- Use the existing mortgage/ledger mint path.
- Reject duplicate mortgage ids or duplicate mint attempts.

#### `buyMortgage`

- Treat as primary market issuance from treasury to investor.
- Route to ledger issuance primitives directly.
- Do not call `convex/engine/effects/dealClosing.ts`.

#### `sellMortgage` and `tradeMortgage`

- Treat as secondary market full-position transfers.
- Route to `convex/ledger/postEntry.ts` or the direct ledger transfer helper layer.
- Use the smallest write path that already enforces mortgage and balance invariants.
- Do not call deal-closing or contract-close workflows.

#### `tradeFraction`

- Treat as a partial secondary transfer.
- Route to direct ledger transfer primitives.
- Enforce minimum position constraints before and after the move.

#### `default` and `renewal`

- Prefer existing obligation/mortgage lifecycle machinery when it is already supported.
- Integrate with `convex/payments/obligations/generate.ts` and `convex/payments/obligations/crons.ts` for day-based lifecycle advancement.
- If the backend cannot model renewal accurately, omit renewal commands and cap the simulation at 11 months.

### Validation Rules

Validation must happen before posting any command:

- `effectiveDate` must fall inside the run window.
- `idempotencyKey` must be unique within the run.
- `buyMortgage` requires available treasury units or another explicit supported issuance path.
- `sellMortgage`, `tradeMortgage`, and `tradeFraction` require seller ownership on the same mortgage.
- Secondary trades cannot move units across mortgages.
- A seller cannot transfer more than their current balance.
- A buyer cannot end up below the minimum non-zero holding threshold where that rule applies.
- Commands that imply a full exit must leave the seller at zero.
- Default and renewal commands must match the current supported lifecycle state.
- Unsupported commands are rejected with a deterministic code and reason.

### Replay Algorithm

The replay engine should be pure from the perspective of the schedule:

1. Load `simulation_runs` and the ordered `simulation_commands`.
2. Rebuild the simulation projection from seed state.
3. Apply each command in order.
4. At each day boundary, emit a snapshot from the current projection plus live ledger queries.
5. Compare the computed snapshot hash to any stored snapshot hash.
6. Fail fast on divergence, but keep the rejecting command and state delta in the result.

Replay input must include:

- run metadata,
- seed,
- command list,
- engine version,
- ledger schema version,
- scenario version,
- and the generated idempotency keys.

### Export Surfaces

Expose query surfaces for Playwright and offline verification:

- `getSimulationRun(runId)`
- `listSimulationCommands(runId)`
- `getSimulationStateAtDay(runId, dayIndex)`
- `getSimulationStateAtDate(runId, date)`
- `getSimulationDay1Snapshot(runId)`
- `exportSimulationCommandCsv(runId)`
- `exportSimulationLedgerCsv(runId, dayIndex?)`
- `exportSimulationReplayBundle(runId)`

The exported ledger state must include:

- mortgage ids,
- investor positions,
- current balances,
- command results,
- rejected commands,
- and the effective-day ordering.

### Failure Handling

- Reject impossible moves before any write.
- Record rejection codes instead of silently skipping a command.
- Keep execution idempotent when Playwright retries the same command.
- Stop the run if a snapshot hash diverges from expected replay output.
- If renewals are not supported, refuse renewal commands rather than approximating them.
- If the run exceeds 11 months without renewal support, fail configuration validation before execution starts.

### Seed Strategy

The seed must be deterministic and explicit:

- The run seed drives command generation.
- The run seed must be persisted in `simulation_runs`.
- The generator version must be persisted in `simulation_runs`.
- The same seed and version must produce the same command list.
- Use a stable investor pool and mortgage pool so the command schedule remains reproducible.
- Seed day-1 state immediately after seeding so the harness can compare post-seed and post-day-1 output.

### Test Plan

Unit tests:

- command grammar validation,
- invalid trade rejection,
- idempotency behavior,
- command-to-primitive routing,
- replay determinism,
- snapshot hash stability,
- day-1 export correctness.

Integration tests:

- run seeding plus a short command schedule,
- export any-day state,
- replay from exported commands,
- compare snapshot hashes,
- verify that secondary trades bypass deal-closing workflows.

End-to-end tests:

- use Playwright to advance the simulation day by day,
- trigger command batches,
- export the ledger state,
- compare against expected CSV/JSON fixtures,
- validate the final reconstructed portfolio state.

### Rollout Sequence

1. Add the simulation tables and basic command journal.
2. Wire seed and export queries.
3. Implement command validation and routing for mint/buy/trade flows.
4. Add day-level snapshot generation.
5. Wire default and renewal integration only where the backend already supports it.
6. Add replay bundle export and snapshot verification.
7. Add Playwright harness coverage.

