# Chunk 01 Context: Obligation Machine + Tests

## Machine Definition (from Implementation Plan)

Create `convex/engine/machines/obligation.machine.ts`:

```typescript
import { setup } from "xstate";

export const obligationMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as
      | { type: "DUE_DATE_REACHED" }
      | { type: "GRACE_PERIOD_EXPIRED" }
      | { type: "PAYMENT_APPLIED"; amount: number; paidAt: number },
  },
  actions: {
    emitObligationOverdue: () => {
      /* resolved by GT effect registry */
    },
    emitObligationSettled: () => {
      /* resolved by GT effect registry */
    },
  },
}).createMachine({
  id: "obligation",
  initial: "upcoming",
  states: {
    upcoming: {
      on: {
        DUE_DATE_REACHED: {
          target: "due",
        },
      },
    },
    due: {
      on: {
        GRACE_PERIOD_EXPIRED: {
          target: "overdue",
          actions: ["emitObligationOverdue"],
        },
        PAYMENT_APPLIED: {
          target: "settled",
          actions: ["emitObligationSettled"],
        },
      },
    },
    overdue: {
      on: {
        PAYMENT_APPLIED: {
          target: "settled",
          actions: ["emitObligationSettled"],
        },
      },
    },
    settled: { type: "final" },
  },
});
```

## Test Matrix (4 states x 3 events = 12 cases)

| State    | DUE_DATE_REACHED  | GRACE_PERIOD_EXPIRED | PAYMENT_APPLIED |
|----------|-------------------|----------------------|-----------------|
| upcoming | -> due            | stays upcoming       | stays upcoming  |
| due      | stays due         | -> overdue           | -> settled      |
| overdue  | stays overdue     | stays overdue        | -> settled      |
| settled  | stays settled     | stays settled        | stays settled   |

## Test Structure

Follow the pattern from `mortgage.machine.test.ts` and `onboardingRequest.machine.test.ts`:
- `snapshotAt(stateValue)` helper using `obligationMachine.resolveState()`
- `getNextSnapshot()` from xstate for pure state testing
- Event factory constants
- ALL_EVENTS array for terminal state lockdown loop
- Machine metadata tests (initial state, machine id)

Test skeleton:
```typescript
import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
import { obligationMachine } from "../obligation.machine";

function snapshotAt(stateValue: string) {
  return obligationMachine.resolveState({
    value: stateValue,
    context: {} as Record<string, never>,
  });
}

// Event factories
const DUE_DATE_REACHED = { type: "DUE_DATE_REACHED" as const };
const GRACE_PERIOD_EXPIRED = { type: "GRACE_PERIOD_EXPIRED" as const };
const PAYMENT_APPLIED = {
  type: "PAYMENT_APPLIED" as const,
  amount: 150000,
  paidAt: 1000,
};

const ALL_EVENTS = [DUE_DATE_REACHED, GRACE_PERIOD_EXPIRED, PAYMENT_APPLIED] as const;

describe("obligation machine", () => {
  // Machine metadata
  // 4x3 State x Event Matrix (12 cases in 4 describe blocks)
  // Terminal state lockdown (settled x all events)
});
```

## Key Design Decisions

1. **No machineContext** - The thin slice has no guards that reference accumulated state. Context is typed as `Record<string, never>`. This differs from mortgage which uses machineContext for missedPayments.

2. **Effect marker pattern** - Actions like `emitObligationOverdue` are declared as no-op functions in `setup({ actions })`. The GT transition engine reads action names from the machine config and schedules matching handlers from `effects/registry.ts`. Pattern established by `onboardingRequest.machine.ts`.

3. **PAYMENT_APPLIED from two states** - Both `due` and `overdue` accept `PAYMENT_APPLIED -> settled`. Same transition and effect, different source states. Matrix test must cover both paths.

4. **Single terminal state** - Only `settled` is `type: "final"`. `overdue` is NOT terminal - it can still settle.

5. **PAYMENT_APPLIED payload exists but is unused** - The thin slice carries `amount` and `paidAt` on the event type for forward compatibility. No guards consume them yet.

## Constraints & Gotchas

- **No Convex imports in machine files.** Machine definitions are pure XState.
- **Actions are no-ops, not implementations.** Actual effect execution is resolved by GT effect registry.
- **File path is `convex/engine/machines/`**, NOT `convex/machines/`.
- **Run `bun check` BEFORE manually fixing lint errors** - it auto-formats and fixes some issues.
- **No `any` types** - CLAUDE.md rule.

## Downstream Consumer

ENG-11 (Machine Registry) expects:
- Named export `obligationMachine` from `convex/engine/machines/obligation.machine.ts`
- Machine `.id === "obligation"` (used by `getMachineVersion()`)

## Existing Pattern Reference Files

- `convex/engine/machines/onboardingRequest.machine.ts` - Simpler machine with no-op effect marker actions (same pattern)
- `convex/engine/machines/mortgage.machine.ts` - More complex machine with machineContext and guards
- `convex/engine/machines/__tests__/mortgage.machine.test.ts` - Full matrix test pattern with snapshotAt(), getNextSnapshot(), terminal lockdown
