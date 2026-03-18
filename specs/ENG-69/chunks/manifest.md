# ENG-69 Chunk Manifest

| Chunk | Tasks | Status | Description |
|-------|-------|--------|-------------|
| chunk-01-types-and-math | T-001 → T-005 | pending | All types, date helpers, interest math, and unit tests |

## Execution Order
1. **chunk-01-types-and-math** — Single chunk; scope is small enough (2 source files + 1 test file)

## Context Sources
- Implementation Plan: Notion (327fc1b440248140a218c5ef985ff0e3)
- REQ: Actual/365 day-count convention (323fc1b44024817ab419cedcee0caa94)
- REQ: Deterministic computation (323fc1b44024814cb193fe2571cecb0b)
- Feature: Interest Accrual Computation Engine (323fc1b4402481938978e3c68cb722e8)
- Schema: `convex/schema.ts` — confirmed `lenders`, `mortgages`, `principal`, `interestRate`
