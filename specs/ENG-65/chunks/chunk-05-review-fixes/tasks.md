# Chunk 5: Code Review + Drift Fixes + Final Pass

## Tasks

### T-024: Check Drift D2 — evaluateRules wiring
- Read `convex/engine/effects/obligation.ts` (emitObligationOverdue handler)
- Check: Does it call `internal.payments.collectionPlan.engine.evaluateRules` (correct) or `internal.payments.collectionPlan.stubs.evaluateRules` (stub)?
- ENG-64 description says this was fixed — verify
- If still calling stub, fix it to call the real engine

### T-025: Check Drift D4 — by_obligation index
- Read `convex/schema.ts`, find `collectionPlanEntries` table definition
- Check: Does it have `by_obligation` index on `["obligationIds"]`?
- Note: Convex may not support indexing array fields — if so, document as a known limitation
- If the index is possible and missing, add it

### T-026: Run code quality review
```bash
bun run review
```
- Document findings

### T-027: Fix code quality issues
- Fix any `any` types found (replace with proper validators)
- Fix any missing validators (no `v.any()` where stricter types possible)
- Fix any import issues or dead code
- Ensure all functions use fluent-convex middleware chains (no raw `ctx.auth.getUserIdentity()`)

### T-028: Final verification
```bash
bun run test && bun check && bun typecheck && bunx convex codegen
```
- ALL must pass
- This is the final gate before marking DoD complete

### T-029: Create verification report
- Create `specs/ENG-65/verification-report.md` with:
  - DoD checklist: pass/fail for each of 14 items
  - Drift items: status (resolved/accepted/needs-fix)
  - Code quality: issues found and fixed
  - Test results: total tests, pass count, coverage highlights
  - Remaining open items (if any)
