# ENG-150 Chunk Manifest

## Chunks

| Chunk | Tasks | Status | Description |
|-------|-------|--------|-------------|
| chunk-01-remaining-queries | T-001 through T-007 | `pending` | Add cashLedgerQuery middleware, date range query, borrower balance, family aggregation, internal variants, quality gate |

## Notes
- ENG-148 already implemented 12+ query functions. This chunk fills the remaining gaps from the implementation plan.
- Single chunk because all tasks are in the same file (queries.ts) with sequential dependencies.
- Total: 7 tasks, ~200 lines of new code.
