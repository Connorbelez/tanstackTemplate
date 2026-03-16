# ENG-27 — postEntry Pipeline: Master Task List

## Chunk 1: Schema, Validators & Constants
- [ ] T-001: Add 3 reservation entry types (SHARES_RESERVED, SHARES_COMMITTED, SHARES_VOIDED) to `ledger_journal_entries.entryType` union in `convex/schema.ts`
- [ ] T-002: Add `reservationId: v.optional(v.string())` field to `ledger_journal_entries` in `convex/schema.ts`
- [ ] T-003: Add `pendingDebits: v.optional(v.int64())` and `pendingCredits: v.optional(v.int64())` to `ledger_accounts` in `convex/schema.ts`
- [ ] T-004: Update `entryTypeValidator` in `convex/ledger/validators.ts` to include 3 reservation types
- [ ] T-005: Add `reservationId: v.optional(v.string())` to `postEntryArgsValidator` in `convex/ledger/validators.ts`
- [ ] T-006: Add `AUDIT_ONLY_ENTRY_TYPES` set to `convex/ledger/constants.ts`
- [ ] T-007: Run `bunx convex codegen` and verify compilation

## Chunk 2: Core postEntry Pipeline
- [ ] T-008: Create `convex/ledger/postEntry.ts` — export `PostEntryInput` interface and `postEntry` async function signature
- [ ] T-009: Implement `validateInput()` — amount > 0, different accounts. Throw structured `ConvexError`
- [ ] T-010: Implement `checkIdempotency()` — query by_idempotency index, return existing if found
- [ ] T-011: Implement `resolveAccounts()` — load both accounts, throw `ConvexError` if missing
- [ ] T-012: Implement `typeCheck()` with `TYPE_CHECK_MATRIX` — 9 entry types validated against account type pairs. CORRECTION allows any pair but requires causedBy
- [ ] T-013: Implement `balanceCheck()` — use available balance (posted - pendingCredits), WORLD exempt, audit-only types exempt
- [ ] T-014: Implement `constraintCheck()` with strategy map — MORTGAGE_MINTED amount=10k, MORTGAGE_BURNED treasury=10k, min position checks, CORRECTION requires admin+causedBy+reason
- [ ] T-015: Implement `persist()` — skip cumulative updates for AUDIT_ONLY types, insert journal entry with all fields including reservationId
- [ ] T-016: Implement `nudge()` — fire-and-forget scheduler call, safe to fail
- [ ] T-017: Wire all 9 steps in `postEntry()` function. Import `computeBalance` from `./internal`, implement local `getAvailableBalance` helper
- [ ] T-018: Run `bunx convex codegen && bun check && bun typecheck` to verify

## Chunk 3: Mutations Refactor
- [ ] T-019: Remove `postEntryInternal` function and ALL validation helpers (assertAccountType, assertMortgageMatch, checkMinPosition, validateEntryType, all validate* functions, VALIDATORS record) from `convex/ledger/mutations.ts`
- [ ] T-020: Remove the public `postEntry` export from `convex/ledger/mutations.ts`
- [ ] T-021: Add `import { postEntry } from "./postEntry"` to `convex/ledger/mutations.ts`
- [ ] T-022: Create `postEntryDirect` as `internalMutation` in `convex/ledger/mutations.ts` for test access (wraps postEntry with postEntryArgsValidator)
- [ ] T-023: Update all convenience mutations (mintMortgage, burnMortgage, issueShares, transferShares, redeemShares) to call imported `postEntry` instead of `postEntryInternal`
- [ ] T-024: Migrate remaining `throw new Error(...)` in convenience mutations to structured `ConvexError` where appropriate
- [ ] T-025: Remove `PostEntryInput` interface and `EntryType`/`AccountType` types from mutations.ts (now in postEntry.ts)
- [ ] T-026: Run `bunx convex codegen && bun check && bun typecheck` to verify

## Chunk 4: Tests
- [ ] T-027: Update existing tests in `ledger.test.ts` — change `api.ledger.mutations.postEntry` calls to `internal.ledger.mutations.postEntryDirect`
- [ ] T-028: Create `convex/ledger/__tests__/postEntry.test.ts` — test harness setup + happy path tests for original 6 entry types (MORTGAGE_MINTED, SHARES_ISSUED, SHARES_TRANSFERRED, SHARES_REDEEMED, MORTGAGE_BURNED, CORRECTION)
- [ ] T-029: Add happy path tests for 3 reservation types (SHARES_RESERVED, SHARES_COMMITTED, SHARES_VOIDED) — verify cumulatives unchanged for audit-only types
- [ ] T-030: Add rejection tests — INVALID_AMOUNT, SAME_ACCOUNT, ACCOUNT_NOT_FOUND, TYPE_MISMATCH, INSUFFICIENT_BALANCE, MIN_FRACTION_VIOLATED, MORTGAGE_MISMATCH, CORRECTION_REQUIRES_*
- [ ] T-031: Add idempotency test — same key returns existing entry with zero side effects
- [ ] T-032: Add sequence number monotonicity test — entries get sequential numbers
- [ ] T-033: Add sell-all exception test — POSITION can go to exactly 0
- [ ] T-034: Add WORLD exemption test — WORLD can go negative on balance
- [ ] T-035: Run full quality gate: `bunx convex codegen && bun check && bun typecheck && bun run test`
