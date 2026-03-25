# ENG-27 — postEntry Pipeline: Master Task List

## Chunk 1: Create `postEntry.ts` Pipeline ✅
- [x] T-001: Create `convex/ledger/postEntry.ts` — export `PostEntryInput` interface and `postEntry` async function skeleton
- [x] T-002: Implement `validateInput()` — finite, integer, safe integer, positive amount; different accounts. All ConvexError.
- [x] T-003: Implement `checkIdempotency()` — query `by_idempotency` index, return existing if found
- [x] T-004: Implement `resolveAccounts()` — load debit + credit accounts, throw ConvexError if missing
- [x] T-005: Implement `typeCheck()` — use `ENTRY_TYPE_ACCOUNT_MAP` from `./types`. Enforce mortgage match for same-mortgage entry types. CORRECTION requires causedBy.
- [x] T-006: Implement `balanceCheck()` — use `getAvailableBalance()` for credit account. WORLD exempt. AUDIT_ONLY types exempt.
- [x] T-007: Implement `constraintCheck()` strategy map — MORTGAGE_MINTED/BURNED amount checks, min position checks, CORRECTION admin/causedBy/reason
- [x] T-008: Implement `persist()` — skip cumulative updates for AUDIT_ONLY types. Insert journal entry with all fields.
- [x] T-009: Implement `nudge()` — no-op stub for now
- [x] T-010: Wire all 9 steps together in `postEntry()`. Add `AUDIT_ONLY_ENTRY_TYPES` to `constants.ts`.
- [x] T-011: Run `bunx convex codegen && bun check && bun typecheck`

## Chunk 2: Refactor `mutations.ts` ✅
- [x] T-012: Remove `postEntryInternal` function and ALL validation helpers from `mutations.ts`
- [x] T-013: Remove the public `postEntry` export
- [x] T-014: Import `postEntry` from `./postEntry`, add `postEntryDirect` internalMutation
- [x] T-015: Update all convenience mutations to call imported `postEntry`
- [x] T-016: Migrate convenience mutation errors to ConvexError
- [x] T-017: Clean up unused imports, remove `PostEntryInput` interface (now in postEntry.ts)
- [x] T-018: Run `bunx convex codegen && bun check && bun typecheck`

## Chunk 3: Tests ✅
- [x] T-019: Update existing tests in `ledger.test.ts` — replace `api.ledger.mutations.postEntry` with `internal.ledger.mutations.postEntryDirect`
- [x] T-020: Create `postEntry.test.ts` with harness + happy path tests for 6 original entry types
- [x] T-021: Add happy path tests for 3 reservation types (verify AUDIT_ONLY cumulatives unchanged)
- [x] T-022: Add rejection tests — all ConvexError codes
- [x] T-023: Add idempotency, sequence monotonicity, sell-all, WORLD exemption tests
- [x] T-024: Run `bunx convex codegen && bun check && bun typecheck && bun run test`
