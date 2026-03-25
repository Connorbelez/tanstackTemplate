# Mortgage Ownership Ledger — Tasks

> Spec: https://www.notion.so/Mortgage-Ownership-Ledger-30ffc1b4402480bf9315e2e04fbeaab4
> Generated: 2026-03-12
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer

- [x] T-001: Add `ledger_accounts`, `ledger_journal_entries`, `ledger_cursors` tables to `convex/schema.ts` with all indexes per design.md (REQ-64, REQ-71, REQ-72, REQ-85, F-1)
- [x] T-002: Create `convex/ledger/constants.ts` — UNITS_PER_MORTGAGE (10,000n), MIN_POSITION_UNITS (1,000n) (REQ-64, REQ-84)
- [x] T-003: Create `convex/ledger/validators.ts` — shared Convex validators for entryType, accountType, eventSource, all mutation args including Tier 2 (REQ-68)
- [x] T-004: Run `bunx convex codegen` — verify schema compiles

## Phase 2: Backend — Core Write Path

### Tier 1: Strict Primitives
- [x] T-010: Create `convex/ledger/internal.ts` — internal helper functions (REQ-64, REQ-68, F-1)
  - `getOrCreateWorldAccount(ctx)`: Lazy singleton — query by_type_and_mortgage for WORLD, create if missing
  - `nextSequenceNumber(ctx)`: Query by_sequence desc take 1, return latest + 1 or 1n
  - `computeBalance(account)`: cumulativeDebits - cumulativeCredits
  - `getOrCreatePositionAccount(ctx, mortgageId, investorId)`: Find via by_mortgage_and_investor or create new POSITION
  - `getPositionAccount(ctx, mortgageId, investorId)`: Find existing, throw if not found
  - `getTreasuryAccount(ctx, mortgageId)`: Find TREASURY for mortgage, throw if not found
- [x] T-011: Create `convex/ledger/mutations.ts` — implement `postEntry` mutation (REQ-64, REQ-84, REQ-85, F-1, F-5)
  - **Common validation**:
    - amount > 0
    - Both accounts exist — **throw if either doesn't exist**
    - debitAccountId !== creditAccountId
    - Idempotency: query by_idempotency, return existing if found
    - Entry type → account type mapping enforcement
  - **Per-entry-type validation** (see design.md "postEntry Validation Pipeline"):
    - MORTGAGE_MINTED: WORLD→TREASURY, amount == 10,000
    - SHARES_ISSUED: TREASURY→POSITION, same mortgageId, treasury balance >= amount, resulting position >= 1,000
    - SHARES_TRANSFERRED: POSITION→POSITION, same mortgageId, seller balance >= amount, seller result 0 or >= 1,000, buyer result >= 1,000
    - SHARES_REDEEMED: POSITION→TREASURY, same mortgageId, position balance >= amount, result 0 or >= 1,000
    - MORTGAGE_BURNED: TREASURY→WORLD, amount == 10,000, treasury == 10,000, no non-zero positions
    - CORRECTION: source.type == "user", actor present, causedBy required, reason required, balance checks still apply
  - **Post-write**: Update cumulative debits/credits on both accounts, assign sequence number
- [x] T-012: Implement `mintMortgage` mutation (UC-40, REQ-64, F-1)
  - Get or create WORLD account
  - Verify no existing TREASURY for this mortgageId (prevents double-mint)
  - Create TREASURY account (cumulativeDebits: 0n, cumulativeCredits: 0n, mortgageId)
  - Call postEntry logic with MORTGAGE_MINTED, WORLD → TREASURY, 10,000
  - Return { treasuryAccountId, journalEntry }
- [x] T-013: Implement `burnMortgage` mutation (F-1)
  - Find TREASURY for mortgageId
  - Verify TREASURY balance == 10,000
  - Verify no POSITION accounts with non-zero balance (query by_mortgage, filter POSITION type, check balance)
  - Call postEntry logic with MORTGAGE_BURNED, TREASURY → WORLD, 10,000

### Tier 2: Convenience Mutations (primary orchestrator API)
- [x] T-015: Implement `issueShares` mutation (UC-40, F-1, F-5, REQ-84)
  - Args: mortgageId, investorId, amount, effectiveDate, idempotencyKey, source, metadata?
  - Find TREASURY via getTreasuryAccount (throw if not found — mortgage must be minted first)
  - Find or create POSITION account via getOrCreatePositionAccount(mortgageId, investorId)
  - Delegate to postEntry with SHARES_ISSUED, TREASURY → POSITION
  - Return { positionAccountId, journalEntry }
- [x] T-016: Implement `transferShares` mutation (UC-42, F-1, F-5, REQ-84, REQ-85)
  - Args: mortgageId, sellerInvestorId, buyerInvestorId, amount, effectiveDate, idempotencyKey, source, metadata?
  - Find seller POSITION via getPositionAccount (throw if doesn't exist — can't sell from nonexistent position)
  - Find or create buyer POSITION via getOrCreatePositionAccount(mortgageId, buyerInvestorId)
  - Delegate to postEntry with SHARES_TRANSFERRED, buyer POSITION (debit) ← seller POSITION (credit)
  - Return { buyerAccountId, journalEntry }
- [x] T-017: Implement `redeemShares` mutation (F-1, F-5, REQ-84)
  - Args: mortgageId, investorId, amount, effectiveDate, idempotencyKey, source, reason?, metadata?
  - Find POSITION via getPositionAccount (throw if doesn't exist)
  - Find TREASURY via getTreasuryAccount
  - Delegate to postEntry with SHARES_REDEEMED, TREASURY (debit) ← POSITION (credit)
  - Return journalEntry
- [x] T-018: Run `bun check` and `bun typecheck`

## Phase 3: Backend — Read Queries

- [x] T-020: Create `convex/ledger/queries.ts` — implement `getBalance` query (F-1, REQ-71)
  - Load account, return cumulativeDebits - cumulativeCredits
- [x] T-021: Implement `getPositions` query (UC-42, UC-46, F-1, REQ-71)
  - Query ledger_accounts by_mortgage, filter type == POSITION, filter balance > 0
  - Return array of { investorId, accountId, balance }
- [x] T-022: Implement `getInvestorPositions` query (F-1, REQ-71)
  - Query by_investor, filter type == POSITION, filter balance > 0
  - Return array of { mortgageId, accountId, balance }
- [x] T-023: Implement `getBalanceAt` point-in-time query (UC-46, F-4, REQ-72)
  - Query journal entries where debitAccountId == accountId OR creditAccountId == accountId, timestamp <= asOf
  - Replay to compute balance at that point
- [x] T-024: Implement `getPositionsAt` point-in-time query (UC-46, F-4, REQ-72)
  - Query journal entries by_mortgage_and_time where timestamp <= asOf
  - Replay all entries, tracking per-account balances
  - Filter to POSITION accounts, return { investorId, balance } for non-zero
- [x] T-025: Implement `getAccountHistory` query (F-4, REQ-72)
  - Query by_debit_account and by_credit_account with date range
  - Merge, sort by sequenceNumber, apply limit
- [x] T-026: Implement `getMortgageHistory` query (UC-46, F-4, REQ-72)
  - Query by_mortgage_and_time with date range, apply limit
- [x] T-027: Run `bun check` and `bun typecheck`

## Phase 4: Backend — Validation & Cursors

- [x] T-030: Create `convex/ledger/validation.ts` — implement `validateSupplyInvariant` query (REQ-64, F-1, F-4)
  - Find TREASURY for mortgageId, compute balance
  - Find all POSITION accounts for mortgageId, compute each balance
  - Check: treasury + Σ positions == 10,000
  - Return { valid, treasuryBalance, positions: Array<{investorId, balance}>, total }
- [x] T-031: Create `convex/ledger/cursors.ts` — consumer cursor mutations/queries (F-1)
  - `getCursor(consumerId)`: Query by_consumer, return cursor or null
  - `advanceCursor(consumerId, lastProcessedSequence)`: Upsert cursor
  - `resetCursor(consumerId, toSequence?)`: Reset to 0 or specified sequence
- [x] T-032: Run `bun check` and `bun typecheck`
- [x] T-033: Run `bunx convex codegen` — full codegen pass

## Phase 5: Integration Tests (convex-test)

### Test Setup
- [x] T-040: Create `convex/ledger/__tests__/ledger.test.ts` with test helpers (F-1)
  - Set up convex-test environment
  - Factory: `mintAndIssue(mortgageId, investorId)` — calls mintMortgage + issueShares for full 10,000 issuance
  - Factory: `mintAndIssuePartial(mortgageId, investorId, amount)` — mint + partial issuance

### Lifecycle Tests
- [x] T-041: Test full lifecycle via Tier 2 API: mintMortgage → issueShares → transferShares → redeemShares → burnMortgage (UC-40, UC-42, F-1, REQ-64)
  - Mint mortgage, verify TREASURY = 10,000, WORLD = -10,000
  - issueShares all to investor A, verify TREASURY = 0, A = 10,000
  - transferShares 5,000 from A to B, verify A = 5,000, B = 5,000
  - redeemShares B's 5,000, verify TREASURY = 5,000, B = 0
  - redeemShares A's 5,000, verify TREASURY = 10,000
  - Burn mortgage, verify TREASURY = 0, WORLD back to 0
  - Validate supply invariant at each step

### Transfer Validation Tests (via transferShares)
- [x] T-042: Test transferShares creates buyer POSITION account on first purchase (UC-42, F-5)
  - Buyer has no existing POSITION — transferShares should create it and succeed
- [x] T-043: Test transferShares rejects cross-mortgage transfer (F-5, REQ-85)
  - Mint two mortgages, issue to investor A on both, try transferShares on mortgage A with sellerInvestorId who only has position on mortgage B — must reject
- [x] T-044: Test transferShares seller full exit (balance → 0) is allowed (REQ-84, F-5)
  - Seller has 5,000, transfers all 5,000 — should succeed (0 is valid)
- [x] T-045: Test transferShares rejects seller remainder between 1-999 (REQ-84, F-5)
  - Seller has 5,000, transfers 4,500 — should reject (remainder 500 < 1,000)
- [x] T-046: Test transferShares rejects buyer position below 1,000 (REQ-84, F-5)
  - Transfer 500 units to new buyer — should reject (500 < 1,000)
- [x] T-047: Test transferShares rejects insufficient seller balance (REQ-85)
  - Seller has 5,000, tries to transfer 6,000 — must reject
- [x] T-048: Test transferShares reuses existing buyer POSITION if investor buys back in (F-5)
  - Buyer had position, sold to 0, buys back in — same POSITION account reused

### Issuance & Redemption Tests (via issueShares/redeemShares)
- [x] T-049: Test issueShares creates POSITION account on first purchase (UC-40, F-1)
- [x] T-050: Test issueShares rejects when TREASURY balance insufficient (REQ-64)
- [x] T-051: Test issueShares rejects resulting position < 1,000 (REQ-84)
- [x] T-052: Test redeemShares full exit (position → 0) allowed (REQ-84)
- [x] T-053: Test redeemShares rejects remainder between 1-999 (REQ-84)
- [x] T-054: Test redeemShares throws if investor has no POSITION account (F-5)

### Tier 1 postEntry Strict Behavior
- [x] T-055: Test postEntry throws when debitAccountId doesn't exist (F-5)
- [x] T-056: Test postEntry throws when creditAccountId doesn't exist (F-5)
- [x] T-057: Test postEntry works correctly when caller provides pre-resolved account IDs (F-1)

### Mint & Burn Tests
- [x] T-058: Test mintMortgage rejects double-mint for same mortgageId (F-1)
- [x] T-059: Test burnMortgage rejects when POSITION accounts still have balance (F-1)
- [x] T-060: Test burnMortgage rejects when TREASURY != 10,000 (F-1)

### CORRECTION Tests
- [x] T-061: Test CORRECTION requires source.type == "user" with actor (F-1)
- [x] T-062: Test CORRECTION requires causedBy reference to existing entry (F-1)
- [x] T-063: Test CORRECTION requires reason string (F-1)
- [x] T-064: Test CORRECTION still enforces balance checks — can't create illegal state (F-1, REQ-64)

### Idempotency & Sequencing Tests
- [x] T-065: Test idempotency — same idempotencyKey returns existing entry, no double-post (REQ-85)
- [x] T-066: Test sequence numbers are monotonic and gap-free across multiple entries (REQ-85)

### Point-in-Time & History Tests
- [x] T-067: Test getPositionsAt — mint at T1, transfer at T2, query at T1 shows pre-transfer state (UC-46, REQ-72)
- [x] T-068: Test getBalanceAt — verify balance reconstruction matches expected values at various timestamps (REQ-72)
- [x] T-069: Test getMortgageHistory — returns entries in sequence order with date filtering (F-4, REQ-72)
- [x] T-070: Test getAccountHistory — returns entries touching an account (both debit and credit sides) (F-4)

### Validation & Cursor Tests
- [x] T-071: Test validateSupplyInvariant returns valid=true for healthy mortgage (REQ-64, F-4)
- [x] T-072: Test consumer cursor lifecycle: create, advance, reset (F-1)

### Common Rejection Tests
- [x] T-073: Test amount <= 0 is rejected (REQ-68)
- [x] T-074: Test self-transfer (debit == credit account) is rejected
- [x] T-075: Test wrong account types for entry type — e.g., SHARES_ISSUED from POSITION instead of TREASURY (REQ-85)

### Test Execution
- [x] T-076: Run full test suite — all tests pass
- [x] T-077: Run `bun check`, `bun typecheck`, `bunx convex codegen` — all pass

## Phase 6: Verification

- [x] T-080: Re-fetch Notion spec via notion-fetch and perform gap analysis
- [x] T-081: Create gap-analysis.md with coverage matrix
- [x] T-082: Present gap analysis to user
- [x] T-083: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass
