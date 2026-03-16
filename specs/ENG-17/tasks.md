# ENG-17: Define obligation machine (thin slice) + state x event matrix test

## Tasks

- [x] T-001: Create obligation machine definition (`convex/engine/machines/obligation.machine.ts`)
  - XState v5 `setup().createMachine()` with 4 states: upcoming, due, overdue, settled
  - 3 events: DUE_DATE_REACHED, GRACE_PERIOD_EXPIRED, PAYMENT_APPLIED
  - No machineContext (Record<string, never>)
  - Effect marker actions: emitObligationOverdue (no-op), emitObligationSettled (no-op)
  - settled is type: "final"
  - Machine id: "obligation"
  - Named export: `export const obligationMachine`

- [x] T-002: Create 4x3 state x event matrix test (`convex/engine/machines/__tests__/obligation.machine.test.ts`)
  - 12 matrix test cases (4 states x 3 events)
  - Terminal state lockdown: settled rejects all 3 events
  - Machine metadata: initial === "upcoming", id === "obligation"
  - Follow existing pattern: snapshotAt() helper + getNextSnapshot()

- [x] T-003: Run quality checks
  - `bun check` passes
  - `bun typecheck` passes
  - No `any` types introduced
