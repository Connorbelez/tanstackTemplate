# Chunk 02: Core postEntry Pipeline

## Tasks
- [ ] T-008: Create `convex/ledger/postEntry.ts` — export `PostEntryInput` interface and `postEntry` async function signature
- [ ] T-009: Implement `validateInput()` — amount > 0, different accounts. Throw structured `ConvexError`
- [ ] T-010: Implement `checkIdempotency()` — query by_idempotency index, return existing if found
- [ ] T-011: Implement `resolveAccounts()` — load both accounts, throw `ConvexError` if missing
- [ ] T-012: Implement `typeCheck()` with `TYPE_CHECK_MATRIX` — 9 entry types validated against account type pairs. CORRECTION allows any pair but requires causedBy
- [ ] T-013: Implement `balanceCheck()` — use available balance (posted - pendingCredits), WORLD exempt, audit-only types exempt
- [ ] T-014: Implement `constraintCheck()` with strategy map — MORTGAGE_MINTED amount=10k, MORTGAGE_BURNED treasury=10k, min position checks, CORRECTION requires admin+causedBy+reason
- [ ] T-015: Implement `persist()` — skip cumulative updates for AUDIT_ONLY types, insert journal entry with all fields including reservationId
- [ ] T-016: Implement `nudge()` — fire-and-forget scheduler call, safe to fail
- [ ] T-017: Wire all 9 steps in `postEntry()` function. Import `computeBalance` from `./internal`, implement local `getAvailableBalance` and `getPostedBalance` helpers
- [ ] T-018: Run `bunx convex codegen && bun check && bun typecheck` to verify
