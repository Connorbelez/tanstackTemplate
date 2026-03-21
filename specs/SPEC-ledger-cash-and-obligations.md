# Ledger, Cash, and Obligations

## PRD

### Overview

FairLend currently has a strong ownership-unit ledger, but it does not yet model the full financial lifecycle that an auditor, accountant, or reconciliation process needs. This spec defines the expansion from a pure mortgage ownership ledger into a canonical financial ledger that can track cash movements, receivables, payables, accrued-but-unpaid amounts, wallet balances, and point-in-time reconstruction of the whole portfolio.

The goal is not to replace the ownership ledger. The goal is to add a second, financially coherent ledger layer that coexists with the current unit ledger and can be replayed deterministically from an append-only journal. The ownership ledger remains the source of truth for who owns which mortgage fractions. The new financial ledger becomes the source of truth for money movement, obligations, liabilities, and settlement state.

This spec also folds in the requirement to support lower-level primitives for simulated secondary trades. The simulation should drive the ledger directly, not through higher-level deal-closing workflows.

### Current Constraints And References

The implementation must preserve the current architectural shape and should align with these files:

- [convex/schema.ts](../convex/schema.ts)
- [convex/ledger/postEntry.ts](../convex/ledger/postEntry.ts)
- [convex/ledger/queries.ts](../convex/ledger/queries.ts)
- [convex/ledger/types.ts](../convex/ledger/types.ts)
- [convex/dispersal/createDispersalEntries.ts](../convex/dispersal/createDispersalEntries.ts)
- [convex/accrual/ownershipPeriods.ts](../convex/accrual/ownershipPeriods.ts)
- [docs/fluent-convex/middleware.md](../docs/fluent-convex/middleware.md)
- [docs/fluent-convex/reusable-chains.md](../docs/fluent-convex/reusable-chains.md)

The design must respect the existing ledger principles already in place:

- append-only journal
- single mutation path for postings
- deterministic replay
- atomic write of journal plus account state
- idempotency at the write boundary
- auditability and point-in-time reconstruction

### Problem Statement

Today the system can reconstruct ownership units and some dispersal records, but it cannot honestly represent:

- cash received from borrowers
- cash owed but not yet paid
- cash already earned but not yet distributed
- lender wallets or investor cash balances
- settlement timing across accrual, payment receipt, and payout posting
- a complete accounting trail for receivables, liabilities, and clearing flows

That means the system is not yet ready for a full financial audit story, even if the ownership ledger is correct.

### Goals

1. Add a canonical money ledger that models cash and obligations without weakening the unit ledger.
2. Keep one atomic posting path for all financial movements.
3. Make accrual, receivable recognition, liability creation, cash receipt, and payout posting flow through the same composable rails.
4. Allow point-in-time reconstruction of both ownership and money state.
5. Support auditor-grade export of a complete financial trail.
6. Support simulation-driven replay of secondary trades using direct ledger primitives.

### Non-Goals

1. Do not redesign the business workflows around deal closing.
2. Do not integrate every external payments provider in this phase.
3. Do not replace the existing ownership ledger.
4. Do not require UI work beyond what is needed to expose the new queries later.
5. Do not attempt to solve tax reporting or bank reconciliation automation beyond the ledger model.

### Domain Model

#### Ledgers

The system should have two distinct but linked ledger domains:

- Ownership ledger: mortgage units, positions, transfers, treasury movements.
- Financial ledger: money, receivables, payables, accruals, receipts, wallet balances, payout liabilities.

The two ledgers must be able to reference each other through explicit foreign keys or linkage fields, but their invariants must remain independent.

#### Financial Account Types

The financial ledger should at minimum support these account categories:

- `WORLD_CASH` for global balancing and issuance/burn style bookkeeping
- `TREASURY_CASH` for platform-controlled funds
- `BORROWER_WALLET` or borrower-facing cash account
- `INVESTOR_WALLET` or lender-facing cash account
- `RECEIVABLE`
- `PAYABLE`
- `ACCRUED_INCOME`
- `ACCRUED_EXPENSE`
- `PAYOUT_CLEARING`
- `SERVICING_FEE`
- `CORRECTION`

Exact account naming can vary, but the model must be able to distinguish asset, liability, equity, and clearing-like balances.

#### Financial Event Types

The money ledger must support events such as:

- cash received
- cash disbursed
- accrual recognized
- receivable created
- receivable settled
- payable created
- payable settled
- payout posted
- payout reversed
- fee recognized
- correction posted

The event model must support linking a money event to an ownership event, mortgage, obligation, settlement batch, simulation day, and originating actor.

### Core Use Cases

#### UC-1: Borrower payment is received and allocated

The system records a cash receipt, allocates cash to the proper clearing account, recognizes any accrued receivable, updates any liability or payable state, and makes the money available for downstream payout accounting in one atomic workflow.

#### UC-2: Daily accrual updates receivable and payable state

At the end of a day, the system can recognize new accruals, move them into receivable or payable buckets, and preserve exact replay order for later reconstruction.

#### UC-3: Payout is posted after settlement

When cash becomes distributable, the system can post a payout ledger movement that reduces clearing balances and increases investor wallet or receivable settlement balances.

#### UC-4: Secondary trade replays directly through ledger primitives

A simulation or batch harness can execute mortgage fraction trades using the ledger primitives directly, with no dependency on a higher-level deal-closing workflow.

#### UC-5: Auditor reconstructs portfolio cash state at an arbitrary day

Given the journal export and opening state, an auditor can reproduce balances for every mortgage, account, wallet, receivable, and payable as of any day in the simulation window.

### Acceptance Criteria

1. The system can represent both ownership and money movements without mixing the two into a single ambiguous account model.
2. Every financial posting is append-only and idempotent.
3. No posting path bypasses the canonical posting mutation.
4. Cash receipts, accrual recognition, receivable creation, and payout posting can be executed atomically through a unified chain.
5. Point-in-time queries can reconstruct balances for both ledgers on any day.
6. Audit exports contain enough data to reproduce the final state from the opening state and event stream.
7. The simulation harness can execute lower-level ledger primitives for secondary trades.
8. Existing ownership invariants continue to hold.
9. The system can clearly distinguish settled cash from merely accrued or owed amounts.
10. The design remains implementable in Convex with deterministic replay and no hidden mutable state.

## TDD

### Summary Of The Technical Approach

Implement a dedicated financial ledger alongside the existing ownership ledger, using the same Convex design patterns: append-only journals, atomic mutations, deterministic replay, and explicit read models. The financial ledger should not be implemented as ad hoc fields on existing business tables. It should be a first-class ledger subsystem with its own accounts, journal entries, queries, invariants, and posting pipeline.

The main technical requirement is a unified rail that can compose:

1. business event intake
2. authorization and actor context
3. accrual recognition
4. receivable/payable creation
5. cash receipt or disbursement
6. ledger posting
7. audit trail emission
8. downstream reconciliation

The design should follow the reusable middleware and chain style already documented in the Fluent Convex docs.

### Architecture

#### Boundary Between Ledgers

The ownership ledger remains the canonical source for unit balances and mortgage fraction ownership. The new financial ledger is the canonical source for money balances and obligation settlement.

The ledgers may reference the same mortgage, investor, lender, borrower, and obligation identifiers, but they must not share a single account enum if that would blur semantics. Instead:

- ownership postings remain under the current ledger module
- money postings live under a new financial ledger module
- cross-ledger workflows are orchestrated by a composed chain that posts to each ledger in order or within a single transaction

#### Proposed Module Layout

Add a new financial ledger area, for example:

- `convex/financialLedger/constants.ts`
- `convex/financialLedger/types.ts`
- `convex/financialLedger/postEntry.ts`
- `convex/financialLedger/queries.ts`
- `convex/financialLedger/validation.ts`
- `convex/financialLedger/chains.ts`
- `convex/financialLedger/mutations.ts`

The exact filenames can vary, but the functional separation should exist.

### Data Model

#### Schema Tables

Add tables in `convex/schema.ts` for the financial ledger. At minimum:

1. `financial_accounts`
2. `financial_journal_entries`
3. `financial_cursors`
4. `financial_settlement_batches` or equivalent batch metadata
5. `financial_audit_links` if a separate linkage table is required

#### Financial Account Fields

Each account should capture:

- `type`
- `mortgageId` or other linkage scope
- `borrowerId`, `lenderId`, or `investorId` when relevant
- `currency`
- `cumulativeDebits`
- `cumulativeCredits`
- `balanceDirection` if required for clarity
- `createdAt`
- optional metadata

#### Financial Journal Entry Fields

Each entry should capture:

- monotonic sequence number
- entry type
- amount
- currency
- debit account id
- credit account id
- mortgageId
- obligationId if relevant
- investorId / lenderId / borrowerId if relevant
- source metadata
- actor metadata
- channel
- sessionId
- requestId or correlationId
- idempotency key
- causedBy for corrections or derived entries
- effective date
- timestamp
- optional settlement batch id
- optional simulation day
- optional audit link id

#### Required Indexes

The financial ledger should support these access patterns:

- by idempotency key
- by mortgage and time
- by sequence
- by debit account and time
- by credit account and time
- by obligation and time
- by actor and time
- by source channel and time
- by entry type and time
- by batch id if batches are used

### Posting Pipeline

#### Canonical Financial Post Entry

The financial ledger should have a single primitive equivalent to `postEntry`. It must:

- validate amount
- validate account existence
- validate account type pairing
- validate scope links such as mortgage or obligation ownership
- enforce idempotency
- write the journal entry
- update cumulative account balances atomically
- optionally emit audit links or downstream cursors in the same transaction

#### Unified Fluent Rails

Use a chain or middleware style to compose business steps without scattering imperative control flow. The intended pattern is:

1. enrich context with actor/session/request data
2. normalize the business event into a canonical financial intent
3. optionally derive accrual or receivable/payable entries
4. optionally derive cash movement entries
5. post ownership and money entries in a single orchestrated transaction boundary
6. emit audit artifacts

This should follow the same general middleware composition ideas used in the Fluent Convex docs, especially reusable chains and context enrichment.

#### Important Sequencing Rule

Receivable or payable recognition must occur before the actual cash movement if the business semantics require owed state to be recorded first. The chain should make that ordering explicit.

### Business Workflows

#### Cash Receipt Flow

When cash is received:

1. create or reuse a clearing account
2. recognize the cash receipt
3. allocate against receivable or payable balances
4. create or settle any obligation entries
5. post payout allocations when eligible
6. write audit metadata with actor and source

#### Accrual Recognition Flow

When accrual is recognized:

1. derive accrued amount from the accrual engine
2. post receivable or accrued income entries
3. optionally create liability entries if the business model requires it
4. preserve effective date and valuation date

#### Payout Posting Flow

When a payout becomes distributable:

1. validate that the source obligation or receipt has cleared
2. post the payout movement to the relevant clearing and wallet accounts
3. mark the payout as settled in the financial read model
4. keep the ownership ledger unchanged unless there is a business reason to couple the actions

#### Secondary Trade Simulation Flow

For simulation and correctness testing, secondary trades should call the lower-level ownership ledger primitives directly. Do not route them through a broader deal-closing workflow. The simulation harness can then compose money and ownership postings explicitly and verify both ledgers in lockstep.

### Invariants

#### Ownership Ledger Invariants

These must continue to hold:

- one treasury account per mortgage
- position balances never go negative
- mortgage supply invariant remains intact
- idempotent postings do not duplicate state

#### Financial Ledger Invariants

Add the following:

- every money posting is balanced
- balances derive from cumulative debits minus cumulative credits
- cash cannot be created or destroyed except through explicitly modeled world or treasury accounts
- receivable and payable balances must reconcile to their source obligations
- accrued-but-unpaid amounts must not be counted as cash
- wallet balances must agree with posted payouts and receipts
- every posting must reference a valid business context

#### Cross-Ledger Invariants

1. An ownership transfer must not silently imply a cash movement unless explicitly modeled.
2. A cash movement must reference the originating business event or settlement reason.
3. Settlement state across ledgers must be reconcilable from the journal stream alone.
4. If the same business event creates both ownership and financial entries, the pair must be atomically linked.

### Queries And Read Models

The new financial query surface should support:

- current balance by account
- point-in-time balance by account
- mortgage-wide balance sheet
- obligation status and settlement history
- wallet balance by investor or lender
- receivables and payables outstanding
- daily trial balance
- audit-ready journal export
- reconstruction from a given day or sequence number

The existing ownership queries in [convex/ledger/queries.ts](../convex/ledger/queries.ts) should remain available and can be extended with cross-ledger helpers only if needed.

### Audit And Export Requirements

The financial ledger must support exports that include:

- full posting journal
- opening balances
- effective dates
- timestamps
- actor and source metadata
- idempotency keys
- correlation ids
- linked mortgage / obligation / batch identifiers
- account types and balances
- enough information to rebuild the final balance sheet from a CSV or JSON export

The export format should be deterministic and stable enough for legal or accounting review.

### Migration Strategy

Implement in phases:

1. add schema and types for financial accounts and entries
2. add a narrow primitive post mutation and a minimal query layer
3. wire accrual and payout flows into the new ledger
4. link audit export and reconstruction queries
5. migrate simulation and tests
6. expand to additional obligation cases and edge conditions

During migration, the current ownership ledger must continue to function without behavior change.

### Test Plan

Add tests at three levels:

#### Unit Tests

- validate posting rules
- validate idempotency
- validate account type mapping
- validate balanced-entry guarantees
- validate point-in-time replay

#### Integration Tests

- cash receipt creates the expected receivable/payable and wallet changes
- accrual posting and payout posting reconcile
- ownership and money postings can be combined atomically
- reconstruction from journal output matches live state

#### End-To-End Tests

- simulation of a multi-day sequence with ownership trades, cash receipts, and accruals
- export and replay of the full journal
- comparison of reconstructed balances against the live read model

The existing issue around dispersal accounting should be included as a regression target, even if the implementation path changes.

### Rollout Gates

1. `bun check` passes.
2. `bun typecheck` passes.
3. `bunx convex codegen` passes.
4. New ledger tests pass.
5. Existing ownership tests still pass.
6. Replay/reconstruction tests confirm deterministic results.
7. Audit export tests confirm that the exported data can reproduce the final balances.
8. Simulation tests confirm that lower-level trade and money primitives work as intended.

### Open Design Decisions

1. Whether financial accounts live in a completely separate namespace or share a top-level prefix with the ownership ledger.
2. Whether receivable and payable balances are stored as distinct account types or inferred from journal semantics.
3. Whether payout batches need their own durable entity table in phase one.
4. Whether cross-ledger atomicity is best handled by a shared chain helper or by a higher-level orchestrator mutation.

The implementation should choose the simplest model that preserves correctness and replayability.
