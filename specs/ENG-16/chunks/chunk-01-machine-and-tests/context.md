# Chunk 01 Context: Mortgage Machine + Tests

## Source: SPEC 1.2 §4.3 — mortgageMachine

**Purpose:** Governs the servicing lifecycle of a funded mortgage. Mortgages are seeded as `active` in Phase 1 — the application/origination pipeline is Phase 2. This machine proves guards, machineContext accumulation, and cross-entity event reception. The most complex Phase 1 machine.

**States:** `active` → `delinquent` → `defaulted` → `collections` → `written_off` | `matured`
Also: `delinquent` → `active` (cure path when overdue payments are settled)

### Event Transition Table

| Event | From | To | Guard | Actions |
|---|---|---|---|---|
| OBLIGATION_OVERDUE | active | delinquent | — | incrementMissedPayments |
| PAYMENT_CONFIRMED | active | active | — | recordPayment |
| MATURED | active | matured | — | — |
| PAYMENT_CONFIRMED | delinquent | active | allOverduePaid | recordPayment |
| PAYMENT_CONFIRMED | delinquent | delinquent | (fallthrough) | recordPayment |
| OBLIGATION_OVERDUE | delinquent | delinquent | — | incrementMissedPayments |
| DEFAULT_THRESHOLD_REACHED | delinquent | defaulted | gracePeriodExpired | — |
| COLLECTIONS_INITIATED | defaulted | collections | — | — |
| WRITE_OFF_APPROVED | collections | written_off | — | — |

### machineContext

```typescript
export interface MortgageMachineContext {
  missedPayments: number;   // accumulates on OBLIGATION_OVERDUE, decrements on PAYMENT_CONFIRMED
  lastPaymentAt: number;    // updated on PAYMENT_CONFIRMED
}
```

### Guards

- `allOverduePaid`: `({ context }) => context.missedPayments <= 1` — cure condition
  - **CRITICAL: Uses `<= 1` not `<= 0`** because XState v5 evaluates guards BEFORE executing assign actions. When PAYMENT_CONFIRMED arrives, the decrement hasn't happened yet, so the guard sees the pre-decrement value.
- `gracePeriodExpired`: `({ context }) => context.missedPayments >= 3` — default threshold

### Assign Actions

```typescript
actions: {
  incrementMissedPayments: assign({
    missedPayments: ({ context }) => context.missedPayments + 1,
  }),
  decrementMissedPayments: assign({
    missedPayments: ({ context }) => Math.max(0, context.missedPayments - 1),
  }),
  recordPayment: assign({
    lastPaymentAt: ({ event }) => {
      if ("paidAt" in event) return event.paidAt;
      return Date.now();
    },
    missedPayments: ({ context }) => Math.max(0, context.missedPayments - 1),
  }),
},
```

### Full Machine Definition (from spec)

```typescript
// convex/machines/mortgage.machine.ts
import { assign, setup } from "xstate";

export interface MortgageMachineContext {
  missedPayments: number;
  lastPaymentAt: number;
}

export const mortgageMachine = setup({
  types: {
    context: {} as MortgageMachineContext,
    events: {} as
      | { type: "OBLIGATION_OVERDUE"; obligationId: string }
      | { type: "PAYMENT_CONFIRMED"; obligationId: string; amount: number; paidAt: number }
      | { type: "DEFAULT_THRESHOLD_REACHED" }
      | { type: "COLLECTIONS_INITIATED" }
      | { type: "WRITE_OFF_APPROVED" }
      | { type: "MATURED" },
  },
  guards: {
    // Guard is evaluated BEFORE assign actions execute
    allOverduePaid: ({ context }) => context.missedPayments <= 1,
    gracePeriodExpired: ({ context }) => context.missedPayments >= 3,
  },
  actions: {
    incrementMissedPayments: assign({
      missedPayments: ({ context }) => context.missedPayments + 1,
    }),
    decrementMissedPayments: assign({
      missedPayments: ({ context }) => Math.max(0, context.missedPayments - 1),
    }),
    recordPayment: assign({
      lastPaymentAt: ({ event }) => {
        if ("paidAt" in event) return event.paidAt;
        return Date.now();
      },
      missedPayments: ({ context }) => Math.max(0, context.missedPayments - 1),
    }),
  },
}).createMachine({
  id: "mortgage",
  initial: "active",
  context: {
    missedPayments: 0,
    lastPaymentAt: 0,
  },
  states: {
    active: {
      on: {
        OBLIGATION_OVERDUE: {
          target: "delinquent",
          actions: ["incrementMissedPayments"],
        },
        PAYMENT_CONFIRMED: {
          target: "active",
          actions: ["recordPayment"],
        },
        MATURED: {
          target: "matured",
        },
      },
    },
    delinquent: {
      on: {
        PAYMENT_CONFIRMED: [
          {
            target: "active",
            guard: "allOverduePaid",
            actions: ["recordPayment"],
          },
          {
            target: "delinquent",
            actions: ["recordPayment"],
          },
        ],
        OBLIGATION_OVERDUE: {
          target: "delinquent",
          actions: ["incrementMissedPayments"],
        },
        DEFAULT_THRESHOLD_REACHED: {
          target: "defaulted",
          guard: "gracePeriodExpired",
        },
      },
    },
    defaulted: {
      on: {
        COLLECTIONS_INITIATED: {
          target: "collections",
        },
      },
    },
    collections: {
      on: {
        WRITE_OFF_APPROVED: {
          target: "written_off",
        },
      },
    },
    written_off: { type: "final" },
    matured: { type: "final" },
  },
});
```

### Terminal States
`written_off` and `matured` are `{ type: "final" }` — they accept no events.

### Guard-Before-Assign Timing (XState v5)
XState v5 evaluates guards BEFORE executing assign actions. This means:
- When PAYMENT_CONFIRMED arrives in `delinquent` with `missedPayments = 1`
- The `allOverduePaid` guard checks `context.missedPayments <= 1` → true (pre-decrement value)
- The transition fires, THEN `recordPayment` decrements to 0
- If we had used `<= 0`, the guard would fail when missedPayments = 1 and the cure path would never trigger with exactly 1 missed payment remaining

### Context Accumulation Trace (from AC)
```
active (missedPayments: 0)
  → OBLIGATION_OVERDUE → delinquent (missedPayments: 1)
  → OBLIGATION_OVERDUE → delinquent (missedPayments: 2)
  → PAYMENT_CONFIRMED → delinquent (missedPayments: 1, guard fails: 2 > 1)
  → PAYMENT_CONFIRMED → active (missedPayments: 0, guard passes: 1 <= 1, cure!)
```

## Source: Existing Patterns

### Existing machine pattern (onboardingRequest.machine.ts)
```typescript
import { setup } from "xstate";

export const onboardingRequestMachine = setup({
  types: {
    context: {} as Record<string, never>,
    events: {} as
      | { type: "APPROVE" }
      | { type: "REJECT" }
      | { type: "ASSIGN_ROLE" },
  },
  actions: {
    assignRoleToUser: () => { /* resolved by GT effect registry */ },
  },
}).createMachine({
  id: "onboardingRequest",
  initial: "pending_review",
  context: {},
  states: {
    pending_review: {
      on: {
        APPROVE: { target: "approved", actions: ["assignRoleToUser"] },
        REJECT: { target: "rejected" },
      },
    },
    approved: {
      on: { ASSIGN_ROLE: { target: "role_assigned" } },
    },
    rejected: { type: "final" },
    role_assigned: { type: "final" },
  },
});
```

### Existing test pattern (onboardingRequest.machine.test.ts)
```typescript
import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
import { onboardingRequestMachine } from "../onboardingRequest.machine";

function snapshotAt(stateValue: string) {
  return onboardingRequestMachine.resolveState({
    value: stateValue,
    context: {} as Record<string, never>,
  });
}

describe("onboardingRequest machine", () => {
  it("pending_review → approved on APPROVE", () => {
    const current = snapshotAt("pending_review");
    const next = getNextSnapshot(onboardingRequestMachine, current, { type: "APPROVE" });
    expect(next.value).toBe("approved");
  });
  // ... matrix of all state×event combinations
});
```

### Machine registry pattern (registry.ts)
```typescript
import type { EntityType } from "../types";
import { onboardingRequestMachine } from "./onboardingRequest.machine";

export const machineRegistry: Partial<
  Record<EntityType, typeof onboardingRequestMachine>
> = {
  onboardingRequest: onboardingRequestMachine,
} as const;
```

Note: The registry currently types values as `typeof onboardingRequestMachine`. Since the mortgage machine has a different context type, the registry type may need to be loosened (e.g., to `AnyStateMachine` from xstate) or use a union type.

## Acceptance Criteria (from Linear)

- [ ] Machine definition with `setup()` typed context (`MortgageMachineContext`: missedPayments, lastPaymentAt) and events
- [ ] Guards: `allOverduePaid` (cure condition — note: evaluated BEFORE assign, so check `<= 1`), `gracePeriodExpired` (`missedPayments >= 3`)
- [ ] Assign actions: `incrementMissedPayments`, `decrementMissedPayments`, `recordPayment`
- [ ] Complete 6×6 state × event matrix test (36 test cases)
- [ ] Guard coverage: `allOverduePaid` with missedPayments = 0, 1, 2; `gracePeriodExpired` with missedPayments = 2, 3, 4
- [ ] Terminal state lockdown: `written_off` and `matured` accept no events
- [ ] Context accumulation trace: active → OBLIGATION_OVERDUE (1) → OBLIGATION_OVERDUE (2) → PAYMENT_CONFIRMED (1) → PAYMENT_CONFIRMED (0, cure → active)
- [ ] XState v5 guard-before-assign timing explicitly tested and documented
- [ ] `bun check` and `bun typecheck` pass

## Blocking Context

This issue **blocks**:
- **ENG-21**: Write Transition Engine integration tests — needs this machine registered
- **ENG-11**: Implement Machine Registry and machine version helper — needs multiple machines registered

## File Conventions
- Machine files: `convex/engine/machines/<entityType>.machine.ts`
- Test files: `convex/engine/machines/__tests__/<entityType>.test.ts` (note: test file uses entity name, not `.machine.test.ts`)
- Use `import { assign, setup } from "xstate"` and `import { getNextSnapshot } from "xstate"`
- Machine ID matches entity type name (e.g., `"mortgage"`)
