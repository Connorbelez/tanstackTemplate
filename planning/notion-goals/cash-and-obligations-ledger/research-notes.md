# Research Notes - Cash & Obligations Ledger

## Summary

The repo and current Notion planning system support adding a second money-side
ledger goal. They do not support folding that work cleanly into the existing
ownership ledger without increasing risk and muddying boundaries.

## Important Finding

At the time of writing, no spec existed at
`specs/SPEC-ledger-cash-and-obligations.md` in this repository. This planning
package therefore includes a new local draft spec under this directory.

## Repo Findings

### 1. The current ledger is purpose-built for ownership units

Evidence:

- `convex/ledger/types.ts` defines only ownership account types:
  `WORLD`, `TREASURY`, `POSITION`
- `convex/ledger/types.ts` defines ownership entry types such as
  `MORTGAGE_MINTED`, `SHARES_ISSUED`, `SHARES_TRANSFERRED`,
  `SHARES_REDEEMED`, `MORTGAGE_BURNED`
- `convex/ledger/postEntry.ts` enforces same-mortgage rules and the 10% minimum
  fraction constraint
- `convex/ledger/mutations.ts` provides ownership-specific mutation helpers like
  `mintMortgage`, `issueSharesHandler`, `transferSharesHandler`,
  `redeemSharesHandler`, and `burnMortgage`

Implication:

The current ledger is not a generic financial posting engine with ownership as
one use case. It is already a bounded ownership ledger.

### 2. The ownership ledger has a high blast radius

GitNexus finding:

- `postEntry` is a critical upstream dependency for multiple ownership posting
  paths and demo flows.

Implication:

Retrofitting money semantics into `postEntry` is a risky way to introduce a new
financial primitive.

### 3. The payment system currently tracks obligation state, not money-side ledger state

Evidence:

- `convex/payments/obligations/generateImpl.ts` creates obligation rows with
  `amount` and `amountSettled`
- `convex/engine/effects/obligationPayment.ts` patches `amountSettled` directly
  on payment application
- `convex/engine/effects/obligation.ts` forwards settlement events and schedules
  dispersal creation

Implication:

Cash-side truth is not currently append-only and journal-backed.

### 4. Dispersal accounting is downstream and derived

Evidence:

- `convex/dispersal/createDispersalEntries.ts` reads active ownership positions
  from the ownership ledger
- It creates `dispersalEntries` and `servicingFeeEntries`, but these are result
  rows, not a full double-entry money ledger

Implication:

The codebase already has money-adjacent artifacts, but not a unified
receivable/cash/payable journal.

### 5. The schema already distinguishes ownership ledger from other financial tables

Evidence:

- `convex/schema.ts` contains `ledger_accounts`, `ledger_journal_entries`,
  `ledger_reservations`, and `ledger_sequence_counters`
- `dispersalEntries` and `servicingFeeEntries` live outside that ownership
  ledger schema

Implication:

Adding a separate `cash_ledger_*` namespace would align with the current schema
style.

## Notion Findings

### Mortgage Ownership Ledger Goal

The existing goal explicitly says:

- it tracks ownership only
- it has zero knowledge of interest accrual, payouts, or downstream money
  systems
- all money movement is out of scope

Implication:

The new goal should complement this goal, not revise its meaning in place.

### Active Mortgage Payment System Goal

The current payment-system docs already assume money-side ledger behavior:

- obligation settlement triggers cash receipt posting
- the architecture references ledger posting for receivables and cash receipts

Implication:

There is planning drift between the current payment architecture and the current
implemented ownership ledger boundary. A new goal resolves that drift.

### Three-Layer Payment Architecture

The architecture separates:

- obligations = what is owed
- collection plan = how to collect
- collection attempts = what happened

Implication:

A cash-and-obligations ledger is a natural fourth primitive adjacent to those
three layers: the journaled financial meaning of their events.

### Dispersal Accounting

The feature already depends on ownership positions and settlement events.

Implication:

Dispersal accounting should be a downstream consumer of the new money ledger for
payable creation and reconciliation, not the ledger itself.

## Recommendation

Create a new goal called `Cash & Obligations Ledger` with these positioning
rules:

- It is the money-side counterpart to the `Mortgage Ownership Ledger`
- It tracks cents, not units
- It does not weaken or replace the ownership ledger
- It becomes the source of truth for receivables, cash movement, lender
  liabilities, and corrections
- It can later share abstractions with the ownership ledger, but that should be
  a later refactor, not a prerequisite

## Suggested Dependency Narrative

- Depends on:
  - Mortgage Ownership Ledger
  - Active Mortgage Payment System
  - Three-Layer Payment Architecture
- Depended on by:
  - Dispersal Accounting
  - payout execution
  - reconciliation and audit exports
  - lender balance and wallet reporting

## Drafting Notes

The goal and spec drafts in this directory deliberately recommend a second
ledger instead of a forced extension because that is the cleanest fit with both
the codebase and the current planning documents.
