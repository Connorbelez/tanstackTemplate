# Chunk 3: Auth Gate Tests + Final Verification

## Tasks

### T-009: Add auth rejection tests for admin-only mutations
**File:** `convex/ledger/__tests__/convenienceMutations.test.ts` (or new file `auth.test.ts`)

Test scenarios:

1. **No identity → rejected for admin mutations**
   - Call `mintMortgage` without any identity → should throw auth error
   - Call `burnMortgage` without identity → should throw auth error
   - Call `postCorrection` without identity → should throw auth error

2. **Non-admin role → rejected for admin mutations**
   - Create identity with `role: "member"` (not admin)
   - Call `mintMortgage` with member identity → should throw auth error

3. **No identity → rejected for ledger queries**
   - Call `getBalance` without identity → should throw auth error
   - Call `getPositions` without identity → should throw auth error
   - Call `validateSupplyInvariant` without identity → should throw auth error

4. **Authenticated user CAN access ledger queries**
   - Call queries with valid identity → should succeed

### T-010: Add auth rejection tests for read queries
Same file as T-009. Verify `getBalanceAt`, `getPositionsAt`, `getAccountHistory`, `getMortgageHistory` all require auth.

### T-011: Run full test suite
```bash
bun run test
```
All test files must pass:
- postEntry.test.ts
- queries.test.ts
- convenienceMutations.test.ts (now includes postCorrection)
- cursors.test.ts
- mintAndIssue.test.ts
- reservation.test.ts
- ledger.test.ts
- accounts.test.ts
- bootstrap.test.ts
- sequenceCounter.test.ts
- concurrency.test.ts
- lifecycle.test.ts (NEW)
- pointInTime.test.ts (NEW)

### T-012: Run quality checks
```bash
bun check          # lint + format (auto-fixes first)
bun typecheck      # TypeScript strict check
bunx convex codegen  # Convex schema codegen
```
Fix any issues found.
