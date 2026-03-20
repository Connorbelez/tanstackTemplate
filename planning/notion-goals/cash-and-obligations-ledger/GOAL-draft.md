# Cash & Obligations Ledger

> Drafted for the FairLend Product Planning System.
> Notion write access was unavailable in this environment, so this is saved as a
> local markdown draft for copy/paste.

## Suggested Goal Properties

| Property | Suggested Value |
| --- | --- |
| Goal | Cash & Obligations Ledger |
| Type | Technical |
| Priority | P0 - Critical |
| Status | Proposed |
| Description | Append-only money ledger and obligation-control subledger that tracks how much is owed to FairLend, how much FairLend owes to lenders and platform revenue accounts, and how cash moves through collection, settlement, dispersal, payout, waiver, write-off, and correction flows. Complements the existing Mortgage Ownership Ledger without changing its unit-position boundary. |
| Success Metric | For any mortgage, obligation, lender, and timestamp, FairLend can answer three questions deterministically from journaled facts: how much is owed to us and by whom, how much we owe out and to whom, and where every collected dollar currently sits. Every confirmed money event has a balanced journal entry, every obligation balance reconciles to journal state, and corrections are append-only. |
| Depends On | Mortgage Ownership Ledger; Active Mortgage Payment System; Three-Layer Payment Architecture |
| Depended On By | Dispersal Accounting; future payout execution; reconciliation and audit reporting; investor wallet/liability reporting |

## Goal Summary

FairLend already has an ownership ledger that answers "who owns what mortgage
fraction and when did that change?" It does not answer the money questions the
platform also needs:

- How much does a borrower currently owe us on each obligation?
- How much cash have we collected but not yet allocated?
- How much do we owe each lender right now?
- How much of a settled payment is FairLend revenue versus lender payable?
- What correction path exists when obligations, collections, or payouts are
  wrong?

This goal introduces a second ledger boundary for dollars and obligations. It is
not a replacement for the ownership ledger. It is the financial control plane
that sits beside it.

## Why This Goal Exists

Today the codebase has an asymmetry:

- Ownership is journaled and reconstructable.
- Obligations are stateful domain records with numeric fields like
  `amount` and `amountSettled`.
- Dispersal accounting creates derived payout rows after settlement.
- Payment architecture docs already assume ledger postings for receivables and
  cash receipts, but that ledger layer does not exist yet in the codebase.

That leaves FairLend without a canonical append-only source of truth for
cash-side financial state.

## Recommendation

Build this as a second ledger, not as an in-place extension of the current
ownership ledger tables.

### Why

The existing ownership ledger is specialized around unit movement:

- Account types are hard-coded to `WORLD`, `TREASURY`, and `POSITION`.
- Entry types are hard-coded to share issuance, transfer, redemption, burn, and
  reservation flows.
- `postEntry` enforces mortgage/unit-specific constraints such as the 10%
  minimum position and mortgage-matching rules.
- The current ledger has a critical blast radius into ownership, accrual period
  derivation, demos, and tests.

Trying to force cash flows into that boundary now would mix two separate
invariants:

- Ownership invariant: `TREASURY + positions = 10,000 units`
- Cash invariant: balances in cents reconcile across receivables, cash, payables,
  revenue, suspense, and write-offs

Those should be separate goals and separate ledgers, even if they later share a
common posting kernel.

## What This Ledger Owns

- Borrower receivables by obligation and mortgage
- Cash receipt postings when collection attempts confirm
- Unapplied cash and suspense balances
- Lender payables created from settled borrower cash
- FairLend servicing fee and fee-revenue recognition
- Adjustments, waivers, write-offs, reversals, and corrections
- Point-in-time reconstruction of cash-side state
- Reconciliation surfaces for "owed to us", "owed by us", and "cash on hand"

## What This Ledger Does Not Own

- Mortgage fractional ownership positions
- Marketplace ownership transfers
- Collection strategy rules
- Payment method execution adapters
- Mortgage lifecycle state transitions themselves

Those systems publish business events. This ledger journals the money meaning of
those events.

## Core Design Principle

Ownership and money are separate primitives:

- The Ownership Ledger answers "who owns the mortgage units?"
- The Cash & Obligations Ledger answers "who owes money, who is owed money, and
  where is the cash?"

The two ledgers are joined by orchestration and shared identifiers such as
`mortgageId`, `obligationId`, `lenderId`, `attemptId`, and `dispersalEntryId`,
not by collapsing them into one table model.

## Proposed Account Model

Use a dedicated chart of accounts for cents, not units.

### Account Families

| Family | Example Purpose |
| --- | --- |
| `BORROWER_RECEIVABLE` | Amount owed by borrower for a specific obligation or mortgage |
| `CASH_CLEARING` | External cash in transit before final allocation |
| `TRUST_CASH` | Cash held in platform trust or settlement accounts |
| `UNAPPLIED_CASH` | Cash received but not yet matched to obligations |
| `LENDER_PAYABLE` | Amount owed to a lender after collection/dispersal |
| `SERVICING_REVENUE` | FairLend fee revenue |
| `FEE_RECEIVABLE` | Optional explicit receivable for assessed fees |
| `WRITE_OFF` | Loss recognition for uncollectible balances |
| `SUSPENSE` | Exception holding bucket pending operator resolution |

## Example Journal Events

| Event Type | Debit | Credit |
| --- | --- | --- |
| `OBLIGATION_ACCRUED` | `BORROWER_RECEIVABLE` | `OBLIGATION_CONTROL` or accrued-liability control |
| `CASH_RECEIVED` | `CASH_CLEARING` or `TRUST_CASH` | `BORROWER_RECEIVABLE` |
| `PAYMENT_APPLIED` | `UNAPPLIED_CASH` or control | `BORROWER_RECEIVABLE` or obligation control |
| `SERVICING_FEE_RECOGNIZED` | settlement control | `SERVICING_REVENUE` |
| `LENDER_PAYABLE_CREATED` | settlement control | `LENDER_PAYABLE` |
| `LENDER_PAYOUT_SENT` | `LENDER_PAYABLE` | `TRUST_CASH` |
| `OBLIGATION_WAIVED` | waiver/expense account | `BORROWER_RECEIVABLE` |
| `OBLIGATION_WRITTEN_OFF` | `WRITE_OFF` | `BORROWER_RECEIVABLE` |
| `CORRECTION` | depends on error | depends on error |

The exact control-account naming is an implementation detail. The goal is that
every event posts balanced entries in cents and preserves reconstructability.

## Key Invariants

- The journal is the source of truth. Derived balances are projections, not
  primary data.
- Every posted money event is balanced in cents.
- No obligation can show a lower outstanding amount than the net balance of its
  receivable postings.
- No payout can reduce a lender payable below zero.
- Corrections are append-only and reference the original erroneous posting.
- The system can reconstruct balances by mortgage, obligation, lender,
  borrower, and account as of any timestamp.

## Integration Boundaries

### Upstream Producers

- Active Mortgage Payment System
- Collection Attempts / Payment Rails
- Obligation state transitions
- Dispersal engine
- Admin correction and waiver workflows

### Downstream Consumers

- Reconciliation reporting
- Audit exports
- Lender payable views
- Investor wallet and payout orchestration
- Exception operations

## Why Not Extend the Ownership Ledger In Place

The repo already shows that the ownership ledger is specialized and in active
use:

- `convex/ledger/types.ts` hard-codes ownership-specific account and entry types.
- `convex/ledger/postEntry.ts` enforces mortgage and minimum-fraction rules that
  are correct for units but wrong for dollars.
- `convex/schema.ts` defines ownership-ledger tables and indexes around
  `WORLD/TREASURY/POSITION`.
- `convex/dispersal/createDispersalEntries.ts` reads ownership balances directly
  to compute lender splits.

This is a good reason to keep ownership stable and add a separate money ledger
beside it.

## Features

| ID | Feature | Description | Priority |
| --- | --- | --- | --- |
| F-1 | Obligation Receivable Journal | Journal borrower receivables in cents per obligation and mortgage | Must Have |
| F-2 | Cash Receipt Posting | Post confirmed collections into trust/clearing accounts and reduce receivables | Must Have |
| F-3 | Lender Payable Journal | Create lender liabilities from settled cash after ownership-based allocation | Must Have |
| F-4 | Fee Revenue Recognition | Journal FairLend servicing and fee revenue explicitly | Must Have |
| F-5 | Waiver / Write-Off / Correction | Append-only adjustment workflows for bad debt and operator mistakes | Must Have |
| F-6 | Point-in-Time Queries | Reconstruct balances and journal history as of any timestamp | Must Have |
| F-7 | Reconciliation Surfaces | Show unapplied cash, outstanding receivables, undisbursed lender payables, and suspense balances | Should Have |

## Requirements

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| REQ-1 | Obligation ledger state must be journal-backed | Outstanding obligation balance can be derived from postings, not only from patched numeric fields |
| REQ-2 | Every confirmed collection attempt must create a balanced cash posting | No confirmed collection exists without a matching journal entry |
| REQ-3 | Lender payables must be attributable | For any lender and timestamp, the system can show why a payable exists and which obligation(s) created it |
| REQ-4 | Corrections must be append-only | No original journal entry is mutated or deleted; correction links back to source entry |
| REQ-5 | Point-in-time reconstruction must be deterministic | Same timestamp and same sequence ordering always produce the same balances |
| REQ-6 | Money ledger must not weaken ownership ledger guarantees | Ownership posting paths remain bounded to unit movement and existing invariants |
| REQ-7 | Reconciliation must surface control gaps | Unapplied cash, negative payables, orphaned obligations, and suspense items are queryable |

## Use Cases

### UC-1: System accrues a scheduled borrower obligation

The system records that a borrower now owes FairLend for a mortgage-specific
obligation. A receivable is journaled in cents with traceability to the
obligation.

### UC-2: Collection attempt confirms and cash is received

When a payment rail confirms collection, FairLend posts cash received against
the borrower receivable and can answer how much of the obligation remains
outstanding.

### UC-3: System allocates settled cash into lender payables and platform revenue

After settlement and ownership-based allocation, FairLend posts lender payables
and servicing revenue so it can answer how much is owed out to each lender and
how much belongs to FairLend.

### UC-4: Admin waives or writes off an obligation balance

An operator resolves an uncollectible or forgiven amount through append-only
entries that preserve the audit trail and explain why the receivable changed.

### UC-5: Auditor requests point-in-time money state

Given a mortgage, obligation, lender, or date range, FairLend can export the
full money-side journal and derived balances without depending on mutable
read-model state.

## Open Questions

1. Should lender payable recognition happen at obligation accrual time, at cash
   settlement time, or in two stages?
2. Should principal repayment live in this same cash ledger or in a dedicated
   capital-return flow that still journals through the same tables?
3. What is the canonical cash account before VoPay is integrated: trust cash,
   clearing, or both?
4. Should `amountSettled` remain a convenience projection, or should it become a
   fully derived field from the money ledger?
5. Should the first implementation use a dedicated `convex/cashLedger/*` module,
   or extract a shared posting kernel after both ledgers exist?

## Definition of Done

- A dedicated money ledger design is approved without weakening the ownership
  ledger boundary.
- The account model, journal model, and posting events are defined and linked to
  obligations, collections, dispersals, and payouts.
- The implementation plan identifies a path from today's patched obligation and
  dispersal data to journal-backed money state.
- The goal clearly states that the current ownership ledger remains the unit
  ledger, while the new goal owns the cash-side ledger.
