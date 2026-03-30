# ENG-251: Record Queries & Search (EAV Fan-Out Assembly)

## Tasks

- [x] T-001: Add `searchIndex("search_label")` to `records` table in `convex/schema.ts`
- [x] T-002: Create `convex/crm/types.ts` — UnifiedRecord, RecordFilter, RecordSort, LinkedRecord types
- [x] T-003: Create `readValuesFromTable` helper in `convex/crm/recordQueries.ts` (switch pattern, by_record index)
- [x] T-004: Create `assembleRecordFields` and `assembleRecords` helpers
- [x] T-005: Create `applyFilters` helper with `matchesFilter` function
- [x] T-006: Create `applySort` helper
- [x] T-007: Implement `queryRecords` query (dual code path: native paginate vs collect+filter+sort)
- [x] T-008: Implement `getRecord` query (single record + linked records via recordLinks)
- [x] T-009: Implement `searchRecords` query (Convex search index on labelValue)
- [x] T-010: Run quality gate — `bun check`, `bun typecheck`, `bunx convex codegen`
