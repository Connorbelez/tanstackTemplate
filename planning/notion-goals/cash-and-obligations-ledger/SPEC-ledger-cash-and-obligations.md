# SPEC - Cash & Obligations Ledger

## Overview

FairLend needs a ledger that tracks money-side financial truth with the same
discipline the platform already applies to mortgage ownership units. The
existing ownership ledger answers:

- who owns what mortgage fraction
- when ownership changed
- what the point-in-time ownership state was

It does not answer:

- how much each borrower owes FairLend right now
- how much cash has been collected and where it sits
- how much FairLend owes each lender right now
- how much of a payment is lender payable versus servicing revenue
- what the append-only correction path is for money mistakes

This spec defines a dedicated cash-and-obligations ledger to answer those
questions.

## Recommendation

Implement this as a second ledger boundary, not as an in-place mutation of the
existing ownership ledger.

### Option A: Extend the Existing Ownership Ledger

Pros:

- Reuses sequence, journal, and posting concepts
- One ledger brand in the codebase

Cons:

- The current ledger is structurally specialized for units, not cash
- `postEntry` contains ownership-specific invariants
- Existing queries, tests, and downstream consumers assume
  `WORLD/TREASURY/POSITION`
- High blast radius on an already implemented primitive

### Option B: Build a Separate Cash Ledger Beside Ownership

Pros:

- Preserves the ownership boundary
- Lets cash accounts and entry types evolve independently
- Keeps unit invariants and money invariants separate
- Lower migration and regression risk

Cons:

- Some duplicated posting concepts at first
- Requires explicit orchestration between the two ledgers

### Option C: Replace Both With a General Ledger Kernel First

Pros:

- Most theoretically elegant long-term architecture

Cons:

- Highest delivery risk
- Refactor before product control requirements are fully proven
- Forces premature generalization

### Decision

Choose Option B now. Revisit shared kernel extraction only after both ledgers
exist and stable duplication is visible.

## Design Philosophy

1. The journal is the source of truth.
2. Every posted money event is balanced in cents.
3. Entries are immutable and append-only.
4. Obligations, collections, payouts, and corrections are separate business
   events that publish money meaning into the ledger.
5. Ownership and money remain decoupled but linkable through shared IDs.

## Scope

### In Scope

- Borrower receivable postings
- Cash receipt postings
- Unapplied cash and suspense handling
- Lender payable creation
- Servicing fee revenue recognition
- Waivers, write-offs, reversals, and corrections
- Point-in-time reconstruction
- Reconciliation queries

### Out of Scope

- Mortgage ownership units
- Order book / marketplace logic
- Collection rule authoring
- Payment method adapters
- Mortgage state transitions
- UI polish beyond admin and audit consumers

## Core Data Model

### Accounts

```ts
interface CashLedgerAccount {
  id: string;
  ledger: "cash";
  family:
    | "BORROWER_RECEIVABLE"
    | "CASH_CLEARING"
    | "TRUST_CASH"
    | "UNAPPLIED_CASH"
    | "LENDER_PAYABLE"
    | "SERVICING_REVENUE"
    | "WRITE_OFF"
    | "SUSPENSE"
    | "CONTROL";
  mortgageId?: string;
  obligationId?: string;
  lenderId?: string;
  borrowerId?: string;
  createdAt: number;
  cumulativeDebits: bigint;
  cumulativeCredits: bigint;
  metadata?: Record<string, unknown>;
}
```

### Journal Entries

```ts
interface CashLedgerJournalEntry {
  id: string;
  ledger: "cash";
  sequenceNumber: bigint;
  entryType:
    | "OBLIGATION_ACCRUED"
    | "CASH_RECEIVED"
    | "CASH_APPLIED"
    | "LENDER_PAYABLE_CREATED"
    | "SERVICING_FEE_RECOGNIZED"
    | "LENDER_PAYOUT_SENT"
    | "OBLIGATION_WAIVED"
    | "OBLIGATION_WRITTEN_OFF"
    | "REVERSAL"
    | "CORRECTION";
  mortgageId?: string;
  obligationId?: string;
  attemptId?: string;
  dispersalEntryId?: string;
  lenderId?: string;
  borrowerId?: string;
  effectiveDate: string;
  timestamp: number;
  debitAccountId: string;
  creditAccountId: string;
  amount: bigint; // cents
  idempotencyKey: string;
  causedBy?: string;
  source: {
    type: "user" | "system" | "webhook" | "cron";
    actor?: string;
    channel?: string;
  };
  reason?: string;
  metadata?: Record<string, unknown>;
}
```

## Suggested Tables

- `cash_ledger_accounts`
- `cash_ledger_journal_entries`
- `cash_ledger_cursors`
- `cash_ledger_sequence_counters`

Keep these separate from `ledger_accounts` and `ledger_journal_entries`.

## Entry Semantics

### 1. Obligation Accrual

When a borrower obligation becomes due or is recognized as collectible:

- Debit `BORROWER_RECEIVABLE`
- Credit a control account representing recognized collectible value

This makes the receivable explicit and journal-backed.

### 2. Cash Receipt

When a collection attempt confirms:

- Debit `CASH_CLEARING` or `TRUST_CASH`
- Credit `BORROWER_RECEIVABLE`

This journals cash against the obligation instead of only patching
`amountSettled`.

### 3. Allocation to Lender Payables and Revenue

When settled cash is allocated:

- Debit allocation control
- Credit one or more `LENDER_PAYABLE` accounts
- Credit `SERVICING_REVENUE` for FairLend's fee share

This is the moment the system can answer "how much do we owe each lender?"

### 4. Payout Execution

When funds are actually pushed out:

- Debit `LENDER_PAYABLE`
- Credit `TRUST_CASH`

### 5. Waiver / Write-Off / Correction

Each of these is a new posting, never an overwrite.

## Invariants

### Obligation Balance Invariant

For a given obligation:

`net(BORROWER_RECEIVABLE postings) = outstanding obligation balance`

### Payable Invariant

For a given lender:

`net(LENDER_PAYABLE postings) = unpaid amount FairLend still owes that lender`

### Cash Traceability Invariant

Every confirmed external collection and every payout execution must map to at
least one journal entry with a stable idempotency key.

### Append-Only Correction Invariant

No money journal entry is ever mutated or deleted after posting.

## Event Mapping

| Upstream Event | Ledger Posting |
| --- | --- |
| Obligation generated or recognized | `OBLIGATION_ACCRUED` |
| Collection attempt confirmed | `CASH_RECEIVED` |
| Payment applied across one or more obligations | `CASH_APPLIED` |
| Dispersal entries created | `LENDER_PAYABLE_CREATED` and `SERVICING_FEE_RECOGNIZED` |
| Payout sent | `LENDER_PAYOUT_SENT` |
| Waiver approved | `OBLIGATION_WAIVED` |
| Write-off approved | `OBLIGATION_WRITTEN_OFF` |
| Operator repair | `CORRECTION` |

## API Surface

### Writes

- `postCashEntry`
- `accrueObligationReceivable`
- `postCashReceipt`
- `createLenderPayables`
- `postLenderPayout`
- `waiveObligationBalance`
- `writeOffObligationBalance`
- `postCashCorrection`

### Reads

- `getAccountBalance`
- `getAccountBalanceAt`
- `getObligationBalance`
- `getObligationHistory`
- `getMortgageCashState`
- `getLenderPayableBalance`
- `getUnappliedCash`
- `getSuspenseItems`

## Migration Strategy

### Phase 0: Decision and Boundary Lock

- Approve separate-ledger architecture
- Freeze ownership ledger scope as unit-only

### Phase 1: Ledger Skeleton

- Create cash-ledger schema and sequence
- Build posting pipeline and idempotency handling
- Add current-state and point-in-time queries

### Phase 2: Obligation and Collection Integration

- Journal obligation receivables
- Journal confirmed cash receipts
- Keep `amountSettled` as a convenience projection if needed

### Phase 3: Dispersal and Payables

- Journal lender payables and servicing revenue from settlement allocation
- Add payout posting

### Phase 4: Reconciliation and Controls

- Add queries for unapplied cash, suspense, orphaned obligations, and negative
  control states
- Add admin correction path

## Acceptance Criteria

- Cash-side balances are reconstructable from journal entries alone
- Obligation balances reconcile to receivable postings
- Lender payable balances reconcile to allocation and payout postings
- Confirmed money events are idempotent and append-only
- Ownership ledger logic remains unchanged except for integrations that publish
  or consume IDs

## Open Questions

1. Does FairLend want payable recognition at accrual time, settlement time, or
   both?
2. How should principal-return flows be represented relative to lender payables?
3. Is `UNAPPLIED_CASH` necessary in phase 1, or can all confirmed cash be
   matched immediately?
4. Which external account abstractions exist before VoPay is integrated?
5. Which ledger states must be visible in the first admin UI versus available
   only via queries and exports?
