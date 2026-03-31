# ENG-258 Chunk Manifest

| Chunk | Label | Tasks | Status |
|-------|-------|-------|--------|
| 01 | Backend — Activity Timeline Query | T-001 → T-003 | partial (`bunx convex codegen` blocked by missing `CONVEX_DEPLOYMENT`) |
| 02 | Frontend — LinkedRecordsPanel | T-004 → T-007 | completed |
| 03 | Frontend — ActivityTimeline | T-008 → T-011 | completed |

## Execution Order
Chunks execute sequentially: 01 → 02 → 03
- Chunk 01 provides the `getRecordActivity` query that Chunk 03 consumes
- Chunk 02 is independent of 01 but ordered first so backend is fully ready
- Chunk 03 depends on the query from Chunk 01
