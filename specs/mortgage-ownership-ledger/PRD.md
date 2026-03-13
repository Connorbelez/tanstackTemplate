# Mortgage Ownership Ledger

> **Canonical Source of Truth**: https://www.notion.so/Mortgage-Ownership-Ledger-30ffc1b4402480bf9315e2e04fbeaab4
>
> This PRD is a compressed working context snapshot extracted from the Notion spec.
> Always defer to the Notion page for the latest requirements. This file serves as
> a local reference to reduce Notion API calls during implementation.

## Overview

A pure primitive that tracks **who owns what fraction of each mortgage, and when that changed.** Double-entry ledger with WORLD/TREASURY/POSITION accounts, 10,000 units per mortgage, append-only journal with monotonic gap-free sequencing. Every downstream system — accrual engine, payout orchestration, marketplace, audit — READS positions from this ledger. This ledger is the authoritative source for ownership.

### Design Philosophy (from spec)

1. **The journal is the source of truth.** Balances are derived, never stored as primary data. Reconstruct ownership at any point in time by replaying journal entries.
2. **Every unit movement is a balanced entry.** Units are never created or destroyed — only moved. Every journal entry debits one account and credits another by the same amount.
3. **Immutable once written.** Append-only. Corrections are new entries that offset mistakes, never mutations.
4. **Zero knowledge of downstream consumers.** No interest accrual, payouts, VoPay, marketplaces. Tracks ownership only.

## Features

| ID  | Feature                                    | Description                                                                                                                 | Priority  | In Scope                         |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------- |
| F-1 | Fractional Ownership Position Tracking     | Track mortgage share positions (10,000 units = 100%) across treasury and investor accounts. Issuance, transfer, redemption. | Must Have | Yes — core ledger                |
| F-2 | Daily Interest Accrual Engine              | Compute ACT/365 interest accruals daily with pro-rata splits. Deterministic BigInt arithmetic.                              | Must Have | No — downstream consumer         |
| F-3 | Payout State Machine (Ledger-Level)        | Encode payout lifecycle (ENTITLED→WALLET→PENDING→PAID_OUT) as ledger transactions.                                          | Must Have | No — downstream consumer         |
| F-4 | Audit Export & Reconciliation Engine       | Generate exportable records for CPA audit and FSRA compliance. Point-in-time queries, validation.                           | Should    | Partial — query API              |
| F-5 | Ownership Transfer w/ Pre-Accrual Boundary | Atomic ownership transfers with full validation (min fraction, balance, same-mortgage). Pre-accrual sequencing is orchestrator's job. | Must Have | Yes — transfers are core ledger  |

### Scope Boundary

**Atomic ownership transfers are core ledger operations.** The ledger owns:
- SHARES_ISSUED (TREASURY → POSITION): Initial allocation / primary purchase
- SHARES_TRANSFERRED (POSITION → POSITION): Secondary market trades
- SHARES_REDEEMED (POSITION → TREASURY): Buyback / investor exit
- All validation: minimum fraction, balance checks, same-mortgage enforcement, atomicity, idempotency

What's out of scope is only upstream orchestration: RBAC controls, audit log decoration, "accrue-then-transfer" sequencing, interest computation, and payout lifecycle.

## Requirements

| ID     | Requirement                                                 | Type           | MoSCoW    | Acceptance Criteria                                                                                                                                       | Ledger Scope  |
| ------ | ----------------------------------------------------------- | -------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| REQ-64 | Share supply invariant must hold at all times                | Constraint     | Must Have | Invariant check runs after every ownership-modifying transaction; violations block further transactions on that mortgage                                   | Core          |
| REQ-65 | Interest accrued before any ownership transfer               | Business Rule  | Must Have | No share transfer without preceding accrual (enforced by orchestrator, not ledger)                                                                        | Downstream    |
| REQ-68 | Deterministic integer arithmetic for all financial calcs     | Non-Functional | Must Have | Identical results for same inputs across environments; BigInt throughout; no floating point                                                               | Core          |
| REQ-69 | ACT/365 day count convention for all interest calculations   | Business Rule  | Must Have | computeAccrualForInterval correct for known test vectors (downstream — accrual engine)                                                                    | Downstream    |
| REQ-71 | Ledger is single source of truth for all financial state     | Constraint     | Must Have | No code path uses cached/derived data for financial logic; reconciliation detects drift                                                                   | Core          |
| REQ-72 | 6-year record retention for all ledger transactions          | Constraint     | Must Have | No automated deletion within 6 years per O.Reg 189/08 s.31; export in legible format; retrieval < 24h                                                    | Core          |
| REQ-73 | Monthly reconciliation: ledger balances match trust account  | Functional     | Must Have | Automated monthly report comparing ledger vs bank; discrepancies > $1 flagged                                                                             | Partial       |
| REQ-74 | Payout state transitions are ledger transactions             | Functional     | Must Have | Every payout lifecycle event produces ledger transaction (downstream — payout system)                                                                     | Downstream    |
| REQ-84 | Minimum 10% fraction enforced on all mortgage positions      | Constraint     | Must Have | Post-transaction position >= 1,000 units for all affected investors; sub-threshold rejected; 0 (full exit) allowed                                        | Core          |
| REQ-85 | All ownership transfers are atomic and auditable             | Constraint     | Must Have | Concurrent transfers serialized via OCC; invariant check within transaction; single append-only entry with full provenance; no query observes ownership != 10k | Core          |

## Use Cases

### UC-40: Investor funds new mortgage and receives ownership position
- **Actor**: System
- **Precondition**: Mortgage approved through underwriting; initial investor identified
- **Flow**:
  1. Call `mintMortgage(mortgageId)` — creates TREASURY account, posts MORTGAGE_MINTED (WORLD → TREASURY, exactly 10,000 units)
  2. Call `issueShares(mortgageId, investorId, 10_000n)` — finds/creates POSITION account for investor×mortgage pair, posts SHARES_ISSUED (TREASURY → POSITION)
  3. Treasury balance = 0, investor position = 10,000
- **Postcondition**: Mortgage fully owned by initial investor; supply invariant holds (TREASURY 0 + POSITION 10,000 = 10,000)
- **Validation enforced by ledger**:
  - Mint is always exactly 10,000 — no partial mints
  - No existing TREASURY for this mortgageId (prevents double-mint)
  - SHARES_ISSUED: TREASURY balance >= amount
  - Resulting POSITION balance >= 1,000 (minimum fraction)

### UC-41: Daily interest accrual cron processes all active mortgages
- **Actor**: System
- **Precondition**: Active mortgages with current positions
- **Ledger's role**: Provide `getPositions(mortgageId)` API for downstream accrual engine to read
- **Note**: Accrual computation, pro-rata splitting, and posting to VoPay are entirely out of scope. The ledger is read-only for this use case.

### UC-42: Marketplace investor purchases mortgage fraction
- **Actor**: Lender (buyer), System (on behalf of seller)
- **Precondition**: Seller (e.g., MIC) holds shares; buyer identified; deal confirmed
- **Flow**:
  1. (Orchestrator ensures accrual is current — out of scope for ledger)
  2. Call `transferShares(mortgageId, sellerInvestorId, buyerInvestorId, amount)` — finds/creates buyer POSITION account, posts SHARES_TRANSFERRED (seller POSITION → buyer POSITION)
  3. Ledger validates (inside postEntry):
     - Both accounts are POSITION type on the **same mortgageId** (units can't leak between mortgages)
     - Seller balance >= amount (can't sell units you don't own)
     - Resulting seller balance is **0 (full exit) or >= 1,000** (minimum fraction)
     - Resulting buyer balance >= 1,000 (minimum fraction)
- **Postcondition**: Ownership transferred atomically; no intermediate state observable
- **Concurrency**: If two buyers try to acquire the last available units simultaneously, Convex OCC retries one against updated state — second buyer sees insufficient balance and is rejected

### UC-44: Admin reviews pre-disbursement CSV before investor payouts
- **Actor**: Admin
- **Precondition**: Distribution complete; wallet balances settled
- **Ledger's role**: Provide `getPositions()`, `getInvestorPositions()`, `getMortgageHistory()` APIs
- **Note**: CSV generation and review UI are downstream features

### UC-46: CPA auditor exports ownership and transaction records for annual review
- **Actor**: Admin (on behalf of CPA/CA firm)
- **Precondition**: Fiscal year closed; all distributions complete
- **Flow**:
  1. `getPositionsAt(mortgageId, yearEndTimestamp)` — point-in-time ownership snapshot for Dec 31
  2. `getMortgageHistory(mortgageId, { from: yearStart, to: yearEnd })` — full transaction log
  3. `validateSupplyInvariant(mortgageId)` — integrity verification
  4. `getAccountHistory(accountId)` — chain of custody for specific investors
- **Postcondition**: Complete ownership history and transaction logs available; every unit traceable from origination through every transfer
- **Regulatory context**: Satisfies O.Reg 189/08 anti-falsification (append-only journal), 6-year retention (every entry has timestamp, retention is a query filter), and "promptly retrievable in legible electronic format"

## Core Data Model

### Account Types

| Type     | Scope                         | Purpose                                                                    | Can Go Negative? |
| -------- | ----------------------------- | -------------------------------------------------------------------------- | ---------------- |
| WORLD    | Global (one per system)       | Source/sink for minting and burning units                                  | **Yes** — only account that can |
| TREASURY | Per mortgage                  | Unissued units. Starts at 10,000 on mint. Credited as units are issued.    | No               |
| POSITION | Per mortgage, per investor    | An investor's ownership stake.                                             | No               |

**Key rules:**
- WORLD balance = -(total units outstanding across all active mortgages). If 5 mortgages active, WORLD = -50,000.
- **One POSITION account per investor × mortgage pair. Always.** Never deleted — balance 0 is valid (historical record). Same account reused if investor buys back in.
- Balance = cumulativeDebits - cumulativeCredits (derived, verifiable)

### Entry Types

| EntryType          | From → To                      | When                                                       |
| ------------------ | ------------------------------ | ---------------------------------------------------------- |
| MORTGAGE_MINTED    | WORLD → TREASURY               | New mortgage. Always exactly 10,000 units.                 |
| SHARES_ISSUED      | TREASURY → POSITION            | Investor acquires units (primary purchase / initial alloc) |
| SHARES_TRANSFERRED | POSITION(seller) → POSITION(buyer) | Secondary market trade between investors              |
| SHARES_REDEEMED    | POSITION → TREASURY            | Buyback, investor exit, mortgage approaching discharge     |
| MORTGAGE_BURNED    | TREASURY → WORLD               | Mortgage fully paid off / foreclosure. Always exactly 10,000. |
| CORRECTION         | Whatever fixes the error       | Admin correction — new entry offsetting the mistake        |

### Invariants

**Supply invariant** (per mortgage): `TREASURY.balance + Σ POSITION.balance = 10,000`
- Holds from mint to burn. Mechanically impossible to violate because entries only move units between accounts within the same mortgage.

**Global integrity**: `WORLD.balance + Σ TREASURY.balance + Σ POSITION.balance = 0`

**Mint/burn rules**:
- Mint always 10,000. No partial mints.
- Burn always 10,000. No partial burns. Requires TREASURY.balance = 10,000 (all positions redeemed first).
- A mortgage is either fully alive or fully dead.

**Minimum fraction**: Every non-zero POSITION must hold >= 1,000 units (10%). Position is either 0 (full exit) or >= 1,000. Checked on SHARES_ISSUED, SHARES_TRANSFERRED (both buyer AND seller), and SHARES_REDEEMED.

### Validation Rules by Entry Type (from spec)

**Every entry (common checks):**
- amount > 0 — no zero or negative transfers
- Both debitAccountId and creditAccountId exist
- idempotencyKey is unique — if exists, return existing entry (no double-post)
- Entry type matches account types (e.g., SHARES_ISSUED must be TREASURY → POSITION)

**MORTGAGE_MINTED (WORLD → TREASURY):**
- Amount is exactly 10,000
- No TREASURY account already exists for this mortgageId (prevents double-mint)
- Creates the TREASURY account in the same transaction

**MORTGAGE_BURNED (TREASURY → WORLD):**
- Amount is exactly 10,000
- TREASURY balance is exactly 10,000 (all positions redeemed first)
- No POSITION accounts for this mortgage have non-zero balance

**SHARES_ISSUED (TREASURY → POSITION):**
- TREASURY balance >= amount
- Resulting POSITION balance >= 1,000 (minimum fraction)
- `postEntry` throws if POSITION account doesn't exist — use `issueShares` for auto-creation

**SHARES_TRANSFERRED (POSITION(seller) → POSITION(buyer)):**
- Both accounts on **same mortgageId** (units can't leak between mortgages)
- Seller balance >= amount
- Resulting seller balance is 0 (full exit) or >= 1,000
- Resulting buyer balance >= 1,000
- `postEntry` throws if buyer POSITION doesn't exist — use `transferShares` for auto-creation

**SHARES_REDEEMED (POSITION → TREASURY):**
- POSITION balance >= amount
- Resulting POSITION balance is 0 (full exit) or >= 1,000

**CORRECTION:**
- Requires source.type = 'user' with an admin actor (no system-generated corrections)
- Must reference a causedBy entry ID (the entry being corrected)
- Must include a reason (human-readable explanation)
- Same balance checks apply — a correction can't create an illegal state

## Schemas

See design.md for full Convex schema definitions. Core tables:
- `ledger_accounts` — WORLD/TREASURY/POSITION with cumulative debits/credits, per-account indexes
- `ledger_journal_entries` — Append-only journal with monotonic sequencing, idempotency key, full provenance
- `ledger_cursors` — Consumer-owned cursors for downstream subscription

## Consumer Subscription Pattern

The journal_entries table IS the event stream. Downstream systems maintain their own cursor (last processed sequenceNumber) and poll for new entries. No separate outbox, no event bus.

Pattern: each consumer tracks `lastProcessedSequence`. Cron job reads entries > cursor, processes them, advances cursor. Backfill = reset cursor to 0.

## Open Questions (from Notion)

| #    | Question                                                                                | Context / Suggested Answer                                                                                           |
| ---- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| OQ-1 | Does FSRA consider fractional marketplace trading to trigger additional record-keeping?  | Legal (Joel) needs to confirm. Ledger design accommodates either answer.                                             |
| OQ-2 | Rounding residual handling strategy: absorb or redistribute?                             | Options: (a) rounding account, (b) largest holder, (c) servicing fee. Downstream concern.                            |
| OQ-3 | Should ledger-to-read-model reconciliation run continuously or on a schedule?            | Options: (a) every write, (b) hourly, (c) month-end. Depends on acceptable drift window.                            |
| OQ-4 | What is the ledger implementation strategy for production?                               | This implementation: custom Convex module. Viable at FairLend's expected volume (hundreds of mortgages, few changes/month). |

## Out of Scope

- **MIC Cap Table**: ITA s.130.1 constraints, 25% ownership cap, 20-shareholder minimum, MIC distribution runs
- **Interest accrual engine** (F-2): ACT/365 computation, pro-rata splits, servicing fee calculation
- **Payout state machine** (F-3): ENTITLED→WALLET→PENDING→PAID_OUT lifecycle
- **Pre-accrual boundary orchestration**: The "accrue-then-transfer" sequencing logic
- **RBAC / authorization**: Who is allowed to call which mutation (upstream orchestrator concern)
- **Audit log decoration**: convex-audit-log integration for admin actions (upstream concern)
- **Trade matching / order book**: Marketplace system
- **Tax reporting / T5 generation**: Future goal
- **Trust account reconciliation**: VoPay domain (REQ-73 bank comparison side)
- **Frontend UI**: Pure backend primitive; admin UI for audit/export is a separate feature
