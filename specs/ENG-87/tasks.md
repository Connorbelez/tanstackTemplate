# ENG-87 Tasks — E2E Tests: Seed → Accrue → Settle → Dispersal

## Task List

- [ ] **T-001**: Write `convex/dispersal/__tests__/integration.test.ts` — create test file with all imports, type definitions, test harness factory, admin identity, lender identity helper, and seedMortgage helper
- [ ] **T-002**: Write Test 1 (`fullChain`) — seed $100K @ 10% mortgage with A(60%) B(40%), query accrual for 30-day period, settle obligation, verify dispersal entries and undisbursed balances
- [ ] **T-003**: Write Test 2 (`dealCloseProration`) — seed mortgage A(100%), day 15 deal closes transferring 50% to B, verify proration in accrual queries and 50/50 dispersal
- [ ] **T-004**: Write Test 3 (`multipleSettlements`) — seed A(60%) B(40%), settle 3 sequential obligations, verify 3 sets of dispersal entries with correct accumulation
- [ ] **T-005**: Run `bun check`, `bun typecheck`, `bunx convex codegen`, `bun test convex/dispersal/__tests__/integration.test.ts`

## Acceptance Criteria (from Linear)

### Test 1: Full chain
1. Seed mortgage ($100K @ 10%, 1% servicing) with investors A (60%) and B (40%)
2. Query accrual for 30-day period → A earns $493.15, B earns $328.77
3. Settle obligation for $833.33 → servicing fee $83.33
4. Dispersal entries created: A = $450.00, B = $300.00
5. Undisbursed balance: A = $450.00, B = $300.00

### Test 2: Deal close with proration + subsequent dispersal
1. Seed mortgage with A (100%)
2. Day 15: deal closes, 50% transferred to B
3. Query A's accrual for full month → covers 15 days at 100% + 16 days at 50%
4. Query B's accrual for full month → covers 16 days at 50%
5. Settle obligation → dispersal based on current positions (A=50%, B=50%)

### Test 3: Multiple obligation settlements
1. Seed with A(60%) B(40%)
2. Settle 3 obligations sequentially
3. Verify 3 sets of dispersal entries, each with correct amounts
4. Undisbursed balance accumulates correctly

## Key Constraints

- **GT scheduler doesn't run in tests** — call `createDispersalEntries._handler(ctx, args)` directly
- **Days are inclusive** — `daysBetween("2026-01-01", "2026-01-31")` = 31 days
- **Servicing fee is monthly** — `(annualServicingRate × principal) / 12`, NOT % of payment
- **Dates as YYYY-MM-DD strings** throughout
- **No `any` types** — explicit interfaces for all query returns
- **Schema names**: `interestRate`, `principal` (not `annualRate`, `principalBalance`)

## Verification Checklist

- [ ] Test 1 passes: A accrual ≈ $493.15, B ≈ $328.77, dispersal A = $450, B = $300, undisbursed A = $450, B = $300
- [ ] Test 2 passes: A accrual covers 15 days @ 100% + 16 days @ 50%, B accrual covers 16 days @ 50%, dispersal 50/50 split
- [ ] Test 3 passes: 3 sequential obligations, 3 sets of entries, accumulation correct
- [ ] `bun check` passes
- [ ] `bun typecheck` passes
- [ ] `bunx convex codegen` passes
- [ ] `bun test convex/dispersal/__tests__/integration.test.ts` passes
- [ ] No `any` types introduced
