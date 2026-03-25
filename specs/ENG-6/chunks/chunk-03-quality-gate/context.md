# Chunk Context: quality-gate

Source: Linear ENG-6, CLAUDE.md quality requirements.

## Quality Commands (from CLAUDE.md)
```bash
bun check        # Lint, format, and check errors (Biome) — also auto-fixes
bun typecheck    # TypeScript type checking
bunx convex codegen  # Regenerate Convex types
```

## Files Created/Modified in This Issue
- `convex/auth/resourceChecks.ts` — new file with all canAccess* functions
- `convex/auth/__tests__/resourceChecks.test.ts` — new test file
- Various files — naming renames (investor→lender, isPlatformAdmin→isFairLendAdmin, uw_manager→sr_underwriter)

## Acceptance Criteria to Verify
- [ ] `canAccessMortgage` — admin✓, borrower(own)✓, broker(assigned)✓, lender(position)✓, lawyer(assignment)✓, other→false
- [ ] `canAccessDeal` — admin✓, broker(theirs)✓, lender(party)✓, lawyer(dealAccess)✓
- [ ] `canAccessLedgerPosition` — admin✓, lender(own)✓, broker(client)✓
- [ ] `canAccessAccrual` / `canAccessDispersal` — admin✓, lender(own)✓
- [ ] `canAccessApplicationPackage` — sr_underwriter(all)✓, jr/uw(pool or own claim)✓
- [ ] `closingTeamAssignments` table exists with indexes
- [ ] Zero references to `investor` role — all `lender`
- [ ] Zero references to `isPlatformAdmin` — all `isFairLendAdmin`
- [ ] Zero references to `uw_manager` — all `sr_underwriter`
- [ ] All checks return boolean (not throw) — caller decides error handling
- [ ] `bun check`, `bun typecheck`, and `bunx convex codegen` pass
- [ ] Unit tests pass for all ownership checks
