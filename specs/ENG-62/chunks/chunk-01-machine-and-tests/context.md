# Chunk 01 Context: collectionAttemptMachine

## Source: SPEC 1.5 Section 4.1 — Machine Definition

```typescript
// machines/collectionAttempt.machine.ts
import { setup } from "xstate";

export const COLLECTION_ATTEMPT_MACHINE_VERSION = "1.0.0";

export const collectionAttemptMachine = setup({
  types: {
    context: {} as {
      attemptId: string;
      retryCount: number;
      maxRetries: number;
    },
    events: {} as
      | { type: "DRAW_INITIATED"; providerRef: string }
      | { type: "PROVIDER_ACKNOWLEDGED"; providerRef: string }
      | { type: "FUNDS_SETTLED"; settledAt: number }
      | { type: "DRAW_FAILED"; reason: string; code: string }
      | { type: "RETRY_ELIGIBLE" }
      | { type: "MAX_RETRIES_EXCEEDED" }
      | { type: "RETRY_INITIATED"; providerRef: string }
      | { type: "ATTEMPT_CANCELLED"; reason: string },
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < context.maxRetries,
  },
}).createMachine({
  id: "collectionAttempt",
  initial: "initiated",
  states: {
    initiated: {
      on: {
        DRAW_INITIATED: {
          target: "pending",
          actions: ["recordProviderRef"],
        },
        FUNDS_SETTLED: {
          // Immediate confirmation path (ManualPaymentMethod)
          target: "confirmed",
          actions: ["emitPaymentReceived"],
        },
        ATTEMPT_CANCELLED: {
          target: "cancelled",
        },
      },
    },
    pending: {
      on: {
        FUNDS_SETTLED: {
          target: "confirmed",
          actions: ["emitPaymentReceived"],
        },
        DRAW_FAILED: {
          target: "failed",
          actions: ["incrementRetryCount"],
        },
      },
    },
    failed: {
      on: {
        RETRY_ELIGIBLE: {
          target: "retry_scheduled",
          guard: "canRetry",
          actions: ["scheduleRetryEntry"],
        },
        MAX_RETRIES_EXCEEDED: {
          target: "permanent_fail",
          actions: ["emitCollectionFailed", "notifyAdmin"],
        },
      },
    },
    retry_scheduled: {
      on: {
        RETRY_INITIATED: {
          target: "pending",
          actions: ["recordProviderRef"],
        },
      },
    },
    confirmed: { type: "final" },
    permanent_fail: { type: "final" },
    cancelled: { type: "final" },
  },
});
```

## Acceptance Criteria (from Linear issue)

- Machine definition: pure data, exports COLLECTION_ATTEMPT_MACHINE_VERSION
- ManualPaymentMethod path: initiated → confirmed via FUNDS_SETTLED (skips pending)
- Async path: initiated → pending (DRAW_INITIATED) → confirmed (FUNDS_SETTLED) or → failed (DRAW_FAILED)
- Retry path: failed → retry_scheduled (RETRY_ELIGIBLE, guard: canRetry) → pending (RETRY_INITIATED)
- Max retries: failed → permanent_fail (MAX_RETRIES_EXCEEDED)
- Cancel: initiated → cancelled (ATTEMPT_CANCELLED)
- `canRetry` guard: checks context.retryCount < context.maxRetries
- Effects: emitPaymentReceived on confirmed, emitCollectionFailed + notifyAdmin on permanent_fail
- Registered in `machines/registry.ts` as `collectionAttempt: collectionAttemptMachine`
- State × event matrix: 7 states × 8 events = 56 test cases, zero gaps

## States (7)
`initiated`, `pending`, `failed`, `retry_scheduled`, `confirmed`, `permanent_fail`, `cancelled`

## Events (8)
`DRAW_INITIATED`, `PROVIDER_ACKNOWLEDGED`, `FUNDS_SETTLED`, `DRAW_FAILED`, `RETRY_ELIGIBLE`, `MAX_RETRIES_EXCEEDED`, `RETRY_INITIATED`, `ATTEMPT_CANCELLED`

## Existing Pattern (obligation.machine.ts)

- Actions defined as no-op stubs in `setup({ actions: { ... } })`
- `transition()` from xstate for pure state computation
- `resolveState()` for creating test snapshots
- Context can be `Record<string, never>` (obligation) or typed (collection attempt needs retryCount for guard)
- Terminal states use `type: "final"` and reject all events

## Test Pattern (obligation.machine.test.ts)

```typescript
function snapshotAt(stateValue: string) {
  return obligationMachine.resolveState({
    value: stateValue,
    context: {} as Record<string, never>,
  });
}

// transition(machine, snapshot, event) returns [nextSnapshot, actions]
// Check next.value for target state
// Check actions.map(a => a.type) for fired effects
// Terminal states ignore all events with 0 actions
```

## Guard Testing

The `canRetry` guard requires context with `retryCount` and `maxRetries`. Test snapshots must provide appropriate context values:
- canRetry passes: `{ retryCount: 0, maxRetries: 3 }` → RETRY_ELIGIBLE transitions to retry_scheduled
- canRetry fails: `{ retryCount: 3, maxRetries: 3 }` → RETRY_ELIGIBLE stays in failed (guard blocks)

## Registry

Already registered in `machines/registry.ts` — imports `collectionAttemptMachine` and maps it. No changes needed to registry (just needs the placeholder to be replaced with the real machine).
