# ENG-250 Chunk Manifest

| Chunk | Tasks | Status | Description |
|-------|-------|--------|-------------|
| chunk-01-pure-functions | T-001, T-002 | pending | Value router + field validation (no DB, pure functions) |
| chunk-02-record-crud | T-003–T-006 | pending | CRUD mutations with fan-out writes and audit |
| quality-gate | T-007 | pending | bun check, typecheck, codegen |

## Execution Order
1. chunk-01-pure-functions → quality gate
2. chunk-02-record-crud → quality gate
