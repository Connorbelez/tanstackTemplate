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
