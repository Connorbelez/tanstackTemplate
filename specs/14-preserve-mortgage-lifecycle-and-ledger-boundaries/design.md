# 14. Preserve Mortgage Lifecycle and Ledger Boundaries — Design

> Derived from: https://www.notion.so/337fc1b440248188a5cbf191c15cb468

## Recommended Direction
Treat page 14 as a guardrail and regression-hardening page. The repo already appears architecturally aligned in the critical places:
- [mortgage.machine.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/machines/mortgage.machine.ts) only reacts to obligation-style lifecycle events
- [obligation.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/effects/obligation.ts) is the current mortgage-facing lifecycle bridge
- [transfer.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/effects/transfer.ts) owns transfer-confirmation side effects and defers attempt-linked inbound business settlement correctly
- [collectionAttempt.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/effects/collectionAttempt.ts) applies obligation payment and legacy bridge behavior, which is the seam most likely to blur cash meaning and strategy ownership if left unchecked
- [integrations.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/cashLedger/integrations.ts) owns borrower cash posting semantics through obligation- and transfer-driven entry helpers

The right move is not a sweeping rewrite. The right move is:
- make the existing ownership boundaries explicit
- fence the highest-risk seams with comments/helper boundaries if needed
- add regression tests that fail when lifecycle or ledger ownership leaks across domains

## Boundary Rules To Lock

### Mortgage Lifecycle
- Mortgage delinquency and cure come from obligation-driven events only
- plan-entry creation, reschedule, defer, suppress, retry, cancellation, or workout ownership do not directly mutate mortgage state
- attempt initiation, provider failure, or attempt terminal failure do not directly mutate mortgage state

### Strategy Layer
- collection plan entries are strategy-only scheduling artifacts
- collection attempts are execution records
- neither creates debt meaning by itself

### Cash & Ledger Meaning
- borrower cash posting remains in cash-ledger integration helpers
- ownership-ledger meaning remains tied to accrual/settlement semantics, not scheduling semantics
- confirmed money meaning may be bridged through obligation application or transfer confirmation, but not through plan-entry state alone

### Transfer Ownership
- provider settlement lifecycle remains in transfer rails and transfer effects
- AMPS consumes transfer outcomes through explicit coordinators/reconciliation seams rather than absorbing provider-state ownership

## Likely Code Targets

### Primary review/edit surfaces
- [mortgage.machine.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/machines/mortgage.machine.ts)
- [obligation.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/effects/obligation.ts)
- [collectionAttempt.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/effects/collectionAttempt.ts)
- [transfer.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/engine/effects/transfer.ts)
- [integrations.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/cashLedger/integrations.ts)

### Primary regression surfaces
- [crossEntity.test.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/test/convex/payments/crossEntity.test.ts)
- mortgage machine tests
- collection attempt machine/effect tests
- transfer reconciliation / cash-ledger integration tests
- workout and reschedule tests where lifecycle leakage could appear

## Implementation Strategy

### Phase 1: Audit and annotate the risky seams
- review the current attempt-confirmation and transfer-confirmation paths for any implicit lifecycle or ledger coupling
- add succinct boundary comments where future contributors could otherwise couple domains accidentally
- extract tiny helper predicates or assertion helpers only where they materially reduce leakage

### Phase 2: Fence the highest-risk cross-domain seams
- if needed, add explicit checks/helpers around:
  - mortgage lifecycle forwarding in obligation effects
  - attempt-linked inbound settlement ownership
  - legacy bridge transfer behavior
  - workout/reschedule paths that could otherwise mutate lifecycle indirectly

### Phase 3: Add architecture regression tests
- obligation-overdue still drives mortgage delinquency
- settled obligation still drives cure/payment-confirmed behavior
- plan-entry changes alone do not change mortgage state
- attempt failure/initiation alone does not change mortgage state
- transfer settlement and cash posting do not require plan-entry awareness
- workout changes future scheduling without directly mutating mortgage lifecycle

## Test Design
- prefer backend integration/regression tests over comments-only guardrails
- use targeted assertions on:
  - mortgage status
  - absence of unexpected transition journal entries
  - absence of cash-ledger posting from strategy-only changes
  - preservation of current transfer/cash posting ownership

## Open Technical Questions
- whether a small dedicated “boundary assertions” helper module is worth adding for repeated invariants
- whether the legacy bridge path in `emitPaymentReceived` needs stronger compatibility fencing or test coverage rather than behavior changes
- whether import-level architecture tests add enough value versus behavior-level regression tests in this repo

## Decision Bias
- favor the smallest code change that makes ownership explicit and testable
- prefer regression tests over architectural churn
- if a seam is already correct, document and test it instead of re-abstracting it
