# ENG-254 Chunk Manifest

| Chunk | Name | Tasks | Status | Dependencies |
|-------|------|-------|--------|--------------|
| 01 | Calendar Query Backend | T-001 | pending | ENG-251 (recordQueries), ENG-252 (viewDefs/viewFilters) |
| 02 | FilterBuilder Component | T-002, T-003 | pending | Chunk 01 (for types), ENG-252 (viewFilters mutations) |

## Execution Order
1. Chunk 01 first (backend query)
2. Chunk 02 second (frontend component — depends on backend being in place for type imports)
