# ENG-16: Define mortgage machine + state × event matrix test

## Tasks

- [x] **T-001** — Create `convex/engine/machines/mortgage.machine.ts` with `MortgageMachineContext` interface, typed events (6), guards (`allOverduePaid`, `gracePeriodExpired`), assign actions (`incrementMissedPayments`, `decrementMissedPayments`, `recordPayment`), and full state machine definition (6 states: active, delinquent, defaulted, collections, written_off, matured)
- [x] **T-002** — Register mortgage machine in `convex/engine/machines/registry.ts`
- [x] **T-003** — Create `convex/engine/machines/__tests__/mortgage.machine.test.ts` with:
  - 6×6 state × event matrix (36 test cases)
  - Guard coverage: `allOverduePaid` with missedPayments = 0, 1, 2; `gracePeriodExpired` with missedPayments = 2, 3, 4
  - Terminal state lockdown: `written_off` and `matured` accept no events
  - Context accumulation trace: active → OBLIGATION_OVERDUE(1) → OBLIGATION_OVERDUE(2) → PAYMENT_CONFIRMED(1) → PAYMENT_CONFIRMED(0, cure → active)
  - XState v5 guard-before-assign timing explicitly tested and documented
- [x] **T-004** — Quality gate: `bun check` and `bun typecheck` pass
