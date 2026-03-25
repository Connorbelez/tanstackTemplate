# Chunk 03 Context: Quality Gate & Verification

## Quality Commands (from CLAUDE.md)
```bash
bun check          # Biome: auto-fix formatting + lint
bun typecheck      # TypeScript type checking
bunx convex codegen  # Regenerate Convex types
bun run test       # Run all vitest tests
```

## Files Created by This Issue
1. `convex/payments/cashLedger/__tests__/chaosTests.test.ts`
2. `convex/payments/cashLedger/__tests__/regressionVerification.test.ts`
3. `convex/payments/cashLedger/__tests__/financialInvariantStress.test.ts`

## Hard Constraints
- `git diff main -- convex/ledger/` must show ZERO changes
- No modifications to existing test files
- No modifications to production source code
- All existing tests pass without modification

## Expected Test Inventory
**Ownership Ledger** (15 files in `convex/ledger/__tests__/`)
**Dispersal** (7 files in `convex/dispersal/__tests__/`)
**Payments** (1 file in `convex/payments/__tests__/`)
**Accrual** (5 files in `convex/accrual/__tests__/`)
**Cash Ledger** (25+ files in `convex/payments/cashLedger/__tests__/`)
**Engine** (9 files across `convex/engine/__tests__/` and subdirectories)
