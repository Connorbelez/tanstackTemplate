# ENG-178 Chunk Manifest

| Chunk | Label | Tasks | Status |
|-------|-------|-------|--------|
| 01 | Chaos Tests | T-001 → T-007 (7 tasks) | pending |
| 02 | Regression & Stress Tests | T-008 → T-014 (7 tasks) | pending |
| 03 | Quality Gate & Verification | T-015 → T-017 (3 tasks) | pending |

## Execution Order
1. **chunk-01-chaos-tests** — Creates `chaosTests.test.ts` with all 5 chaos scenarios from Tech Design §11.5
2. **chunk-02-regression-stress-tests** — Creates `regressionVerification.test.ts` + `financialInvariantStress.test.ts`
3. **chunk-03-quality-gate** — Runs lint, typecheck, codegen, full test suite, and ownership ledger diff verification
