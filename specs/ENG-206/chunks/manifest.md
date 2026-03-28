# ENG-206 Chunk Manifest

## Execution Order

| # | Chunk | Tasks | Status | Description |
|---|-------|-------|--------|-------------|
| 01 | chunk-01-bridge-core | T-001 → T-005 | pending | Core bridge module: types, entry selection, per-entry processing, batch orchestrator, failed entry reset |
| 02 | chunk-02-effects-cron | T-006 → T-009 | pending | Modify transfer effects for dispersal status lifecycle + add daily alert cron |
| 03 | chunk-03-tests | T-010 → T-015 | pending | Unit + integration tests for the full disbursement flow |

## Dependencies
- Chunk 02 depends on Chunk 01 (effects reference dispersalEntryId set by bridge)
- Chunk 03 depends on Chunks 01 + 02 (integration tests exercise full lifecycle)

## Quality Gate Commands
```bash
bun check        # lint + format
bun typecheck    # TypeScript
bunx convex codegen  # Convex code generation
```
