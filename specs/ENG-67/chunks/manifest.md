# ENG-67 Chunk Manifest

| Chunk | Tasks | Status | Description |
|-------|-------|--------|-------------|
| chunk-01-ownership-periods | T-001 → T-004 | partial | Reconstruct ownership timelines from ledger history and lock down proration semantics with tests |
| chunk-02-accrual-queries | T-005 → T-009 | complete | Implement the four accrual query surfaces and wire auth/identifier handling to real repo conventions |
| chunk-03-accrual-tests | T-010 → T-013 | partial | Add integration coverage, run quality gates, and finish with CodeRabbit review |

## Execution Order
1. **chunk-01-ownership-periods** — everything else depends on deterministic ownership periods and the corrected identifier model.
2. **chunk-02-accrual-queries** — all user-facing accrual APIs build on chunk 1.
3. **chunk-03-accrual-tests** — integration verification only makes sense once the helper and query layers exist.

## Context Sources
- Linear issue: `ENG-67`
- Linear comments: implementation audit + dependency notes from 2026-03-19
- Notion implementation plan: `327fc1b440248132915cc8f51dd09a92`
- Notion spec: `323fc1b440248153889dd0d242c243c4`
- Notion feature page: `323fc1b4402481938978e3c68cb722e8`
- Notion goal page: `30ffc1b44024808782d2cdc586640ae3`
- Local code: `convex/accrual/*`, `convex/ledger/*`, `convex/fluent.ts`, `convex/auth/resourceChecks.ts`, `convex/schema.ts`
