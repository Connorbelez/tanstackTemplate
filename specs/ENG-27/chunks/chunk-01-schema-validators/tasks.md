# Chunk 01: Schema, Validators & Constants

## Tasks
- [ ] T-001: Add 3 reservation entry types (SHARES_RESERVED, SHARES_COMMITTED, SHARES_VOIDED) to `ledger_journal_entries.entryType` union in `convex/schema.ts`
- [ ] T-002: Add `reservationId: v.optional(v.string())` field to `ledger_journal_entries` in `convex/schema.ts`
- [ ] T-003: Add `pendingDebits: v.optional(v.int64())` and `pendingCredits: v.optional(v.int64())` to `ledger_accounts` in `convex/schema.ts`
- [ ] T-004: Update `entryTypeValidator` in `convex/ledger/validators.ts` to include 3 reservation types
- [ ] T-005: Add `reservationId: v.optional(v.string())` to `postEntryArgsValidator` in `convex/ledger/validators.ts`
- [ ] T-006: Add `AUDIT_ONLY_ENTRY_TYPES` set to `convex/ledger/constants.ts`
- [ ] T-007: Run `bunx convex codegen` and verify compilation with `bun check && bun typecheck`
