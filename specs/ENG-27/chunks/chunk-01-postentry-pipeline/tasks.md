# Chunk 01: Core postEntry Pipeline

- [ ] T-001: Create `convex/ledger/postEntry.ts` — export `PostEntryInput` interface and `postEntry` async function skeleton
- [ ] T-002: Implement `validateInput()` — finite, integer, safe integer, positive amount; different accounts. All ConvexError.
- [ ] T-003: Implement `checkIdempotency()` — query `by_idempotency` index, return existing if found
- [ ] T-004: Implement `resolveAccounts()` — load debit + credit accounts, throw ConvexError if missing
- [ ] T-005: Implement `typeCheck()` — use `ENTRY_TYPE_ACCOUNT_MAP` from `./types`. Enforce mortgage match for same-mortgage entry types. CORRECTION requires causedBy.
- [ ] T-006: Implement `balanceCheck()` — use `getAvailableBalance()` for credit account. WORLD exempt. AUDIT_ONLY types exempt.
- [ ] T-007: Implement `constraintCheck()` strategy map — MORTGAGE_MINTED/BURNED amount checks, min position checks, CORRECTION admin/causedBy/reason
- [ ] T-008: Implement `persist()` — skip cumulative updates for AUDIT_ONLY types. Insert journal entry with all fields.
- [ ] T-009: Implement `nudge()` — no-op stub for now
- [ ] T-010: Wire all 9 steps together in `postEntry()`. Add `AUDIT_ONLY_ENTRY_TYPES` to `constants.ts`.
- [ ] T-011: Run `bunx convex codegen && bun check && bun typecheck`
