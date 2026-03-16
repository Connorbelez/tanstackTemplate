# Chunk 03: Mutations Refactor

## Tasks
- [ ] T-019: Remove `postEntryInternal` function and ALL validation helpers (assertAccountType, assertMortgageMatch, checkMinPosition, validateEntryType, all validate* functions, VALIDATORS record, ValidationContext interface) from `convex/ledger/mutations.ts`
- [ ] T-020: Remove the public `postEntry` export from `convex/ledger/mutations.ts`
- [ ] T-021: Add `import { postEntry } from "./postEntry"` to `convex/ledger/mutations.ts`
- [ ] T-022: Create `postEntryDirect` as `internalMutation` in `convex/ledger/mutations.ts` for test access (wraps postEntry with postEntryArgsValidator)
- [ ] T-023: Update all convenience mutations (mintMortgage, burnMortgage, issueShares, transferShares, redeemShares) to call imported `postEntry` instead of `postEntryInternal`
- [ ] T-024: Migrate remaining `throw new Error(...)` in convenience mutations to structured `ConvexError` where appropriate
- [ ] T-025: Remove `PostEntryInput` interface and `EntryType`/`AccountType` types from mutations.ts (now exported from postEntry.ts)
- [ ] T-026: Run `bunx convex codegen && bun check && bun typecheck` to verify
