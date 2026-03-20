# Mortgage Marketplace Simulation Demo — SPEC

## Overview

A time-compressed simulation of 2 years of mortgage marketplace activity. Simulates day-by-day accrual and monthly dispersal events, enabling correctness verification of ledgers, dispersals, and mortgage positions without waiting.

---

## Data Model

### Simulation Clock
`simulation_clock` table (single row, `clockId: "simulation"`):
- `currentDate`: string (YYYY-MM-DD)
- `startedAt`: number (unix timestamp)

### Obligations (Pre-seeded)
Generate 24 months of obligations for each seeded mortgage at initialization:
- Monthly interest obligations (`regular_interest`) — due on 1st of each month
- Principal repayment obligation (`principal_repayment`) — due at maturity (24 months out)
- Types: `regular_interest`, `principal_repayment`

### Mortgages
Use existing `prodLedger.ts` mortgages (`prod-mtg-greenfield`, `prod-mtg-riverside`, `prod-mtg-oakwood`) with their seeded positions.

---

## Backend Modules

### `convex/demo/simulation.ts`

#### Queries

**`getSimulationState`** — Current simulation state
```ts
{
  clockDate: string;           // YYYY-MM-DD
  startedAt: number;
  totalObligations: number;
  pendingObligations: number;
  settledObligations: number;
  mortgages: Array<{
    mortgageId: string;
    label: string;
    positions: Array<{
      lenderId: string;
      balance: number;         // current position balance
      availableBalance: number;
    }>;
    invariant: { valid: boolean; total: number };
  }>;
}
```

**`getUpcomingDispersals`** — Pending obligations by due date
```ts
{
  obligations: Array<{
    mortgageId: string;
    mortgageLabel: string;
    dueDate: string;           // YYYY-MM-DD
    type: string;
    amount: number;             // expected settlement amount
    status: string;
    daysUntilDue: number;       // negative = overdue
  }>;
}
```

**`getDispersalHistory`** — Past dispersals
```ts
{
  entries: Array<{
    mortgageId: string;
    lenderId: string;
    amount: number;
    dispersalDate: string;
    status: string;
  }>;
  totalByLender: Record<string, number>;
}
```

**`getTrialBalance`** — Ledger balances
```ts
{
  accounts: Array<{
    accountId: string;
    type: string;
    mortgageId: string;
    lenderId?: string;
    postedBalance: number;      // cumulativeCredits - cumulativeDebits
    availableBalance: number;   // postedBalance - pending
    pendingCredits: number;
    pendingDebits: number;
  }>;
  totalPosted: number;
  totalPending: number;
}
```

#### Mutations

**`seedSimulation`** — Initialize simulation
- Seeds 3 mortgages with 5 lenders (via `seedProdData` pattern)
- Generates 24 months of `regular_interest` obligations per mortgage
- Creates 1 `principal_repayment` obligation at month 24
- Sets simulation clock to 2024-01-01
- Idempotent: checks if simulation_clock exists

**`advanceTime`** — Step simulation forward
- Input: `{ days: number }`
- Advances `currentDate` by N days
- Any obligations with `dueDate <= newDate` and `status === "pending"` become auto-due
- Returns: `{ newDate: string; obligationsTriggered: number }`

**`triggerDispersal`** — Settle an obligation
- Input: `{ obligationId: Id<"obligations">; settledAmount: number }`
- Validates `settledAmount` covers servicing fee
- Calls `createDispersalEntries` (internalMutation) to create disbursement records
- Updates obligation status to "settled"
- Returns: `{ dispersalEntryIds: Id<"dispersalEntries">[]; servicingFeeEntryId: Id<"servicingFeeEntries"> }`

---

## Frontend — `src/routes/demo/simulation.tsx`

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ Header: "Marketplace Simulation"        [Date: 2024-01-01] │
├─────────────────────────────────────────────────────────────┤
│ Stat Cards: [Day X] [Obligations: Y/Z] [Pending Dispersals]│
├─────────────────────────────────────────────────────────────┤
│ Time Controls: [Step +1] [Step +30] [Jump to Date]         │
├──────────────────────────┬──────────────────────────────────┤
│ Event Triggers          │ Main Panel                      │
│ ─────────────────────── │ ──────────────────────────────── │
│ [Originate Mortgage]    │ Tabs:                           │
│ [Sell Position]         │ • Overview (ledger state)        │
│ [Trade Mortgage]        │ • Obligations (upcoming + past)   │
│ [Default Mortgage]      │ • Dispersals (history)            │
│ [Payoff Mortgage]       │ • Trial Balance                  │
│ [Renew Mortgage]        │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

### Component States
- **No simulation**: Shows "Start Simulation" button
- **Running**: Shows time controls + event triggers
- **Simulation at current date**: All past obligations triggered

---

## Implementation Notes

### Key Files to Create
1. `convex/demo/simulation.ts` — backend logic
2. `convex/demo/simulation/validators.ts` — input validators
3. `src/routes/demo/simulation.tsx` — UI

### Key Files to Modify
- None — simulation is additive

### Dependencies
- Reuses existing `createDispersalEntries` (internalMutation)
- Reuses existing `prodLedger.ts` seed pattern
- Reuses existing `getPostedBalance`, `getAvailableBalance` from ledger

### Idempotency
- `seedSimulation` is idempotent — checks for existing clock
- `triggerDispersal` creates entries with unique `idempotencyKey` per obligation+lender

### Simulation Source
All mutations use: `{ type: "user", actor: "simulation", channel: "simulation" }`


---

## Appendix A: Cron Dependencies & Gap Analysis

### Critical Gap: Obligation State Machine

The current specification does not account for the **Governed Transitions (GT) engine** that drives obligation lifecycle. In production, crons trigger state transitions that simulation must replicate.

### Production Cron Architecture

```
crons.daily("daily obligation transitions", { hourUTC: 6, minuteUTC: 0 },
  internal.payments.obligations.crons.processObligationTransitions
);

crons.daily("daily reconciliation", { hourUTC: 6, minuteUTC: 0 },
  internal.engine.reconciliationAction.dailyReconciliation
);
```

#### `processObligationTransitions` — Obligation Lifecycle Cron

| Phase | Event | Transition | Effect |
|-------|-------|------------|--------|
| 1 | BECAME_DUE | upcoming → due | Fires via `transitionObligation` mutation |
| 2 | GRACE_PERIOD_EXPIRED | due → overdue | Triggers `emitObligationOverdue` + rules evaluation |

**File:** `convex/payments/obligations/crons.ts`

### Scheduled Effects via `ctx.scheduler.runAfter(0, ...)`

Effects queue immediately after mutation commit. In simulation mode, this behavior is preserved.

| Trigger | Effect | Action |
|--------|-------|--------|
| GRACE_PERIOD_EXPIRED | `emitObligationOverdue` | Fires OBLIGATION_OVERDUE at parent mortgage |
| PAYMENT_CONFIRMED | `emitObligationSettled` | Schedules `createDispersalEntries` |
| OBLIGATION_OVERDUE | `evaluateRules` | Collection plan rules engine |

### Required Changes to Implementation

#### 1. `advanceTime` — Must Trigger Obligation Transitions

**Current (Gap):** Advances clock but does NOT trigger state machine transitions.

**Required:**
```ts
export const advanceTime = adminMutation({
  handler: async (ctx, args) => {
    // 1. Advance simulation clock
    const newDate = addDays(clock.currentDate, args.days);
    await ctx.db.patch(clock._id, { currentDate: newDate });

    // 2. Phase 1: BECAME_DUE — pending → due
    const newlyDue = allObligations.filter(o =>
      o.status === 'pending' && o.dueDate <= asOfTimestamp
    );
    for (const obligation of newlyDue) {
      await ctx.runMutation(
        internal.engine.commands.transitionObligation,
        { entityId: obligation._id, eventType: 'BECAME_DUE',
          payload: {}, source: SIM_SOURCE }
      );
    }

    // 3. Phase 2: GRACE_PERIOD_EXPIRED — due → overdue
    const pastGrace = allObligations.filter(o =>
      o.status === 'due' && o.gracePeriodEnd <= asOfTimestamp
    );
    for (const obligation of pastGrace) {
      await ctx.runMutation(
        internal.engine.commands.transitionObligation,
        { entityId: obligation._id, eventType: 'GRACE_PERIOD_EXPIRED',
          payload: {}, source: SIM_SOURCE }
      );
    }

    // 4. Optional: Run reconciliation
    await ctx.runAction(
      internal.engine.reconciliationAction.dailyReconciliation,
    );

    return {
      newDate,
      obligationsTriggered: newlyDue.length + pastGrace.length,
      becameDue: newlyDue.length,
      becameOverdue: pastGrace.length,
    };
  }
});
```

#### 2. `seedSimulation` — No Changes Required

Already correctly seeds obligations with `status: 'pending'` and sets simulation clock.

#### 3. `triggerDispersal` — Already Correct

Already calls `createDispersalEntries` via `ctx.runMutation`. Scheduled effects fire automatically via `scheduler.runAfter(0, ...)`.

### Dispersal Flow (How Funds Move)

```
Obligation becomes due (via advanceTime)
        │
        ▼
BECAME_DUE transition fires
        │
        ▼ (scheduler.runAfter)
emitObligationSettled mutation
        │
        ▼ (scheduler.runAfter)
createDisbursalEntries — creates ledger entries
        │
        ▼
Lenders receive funds in ledger accounts
```

### Simulation vs Production Behavior

| Aspect | Production | Simulation |
|--------|-----------|-----------|
| Obligation transitions | Cron @ 06:00 UTC | `advanceTime` triggers inline |
| Scheduled effects | `runAfter(0, ...)` immediate | Same — works identically |
| Reconciliation | Cron @ 06:00 UTC | Run on each `advanceTime` call |
| Dispersals | User-triggered | User-triggered via `triggerDispersal` |

### Files to Modify

1. **`convex/demo/simulation.ts`** — Update `advanceTime` to call obligation transitions
2. **`convex/payments/obligations/queries.ts`** — May need simulation-aware filters (see below)

### Simulation-Aware Obligation Queries

The existing cron uses `getUpcomingDue` and `getDuePastGrace` which filter by `asOf: Date.now()`. For simulation, filter by simulation clock:

```ts
// Option A: Pass simulation date as parameter
getUpcomingDue({ asOf: number, simulationOnly?: boolean })

// Option B: Filter after fetch (current pattern)
// Current implementation filters by checking mortgage.simulationId
```