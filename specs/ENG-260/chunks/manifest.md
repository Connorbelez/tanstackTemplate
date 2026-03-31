# ENG-260 Chunk Manifest

| Chunk | Tasks | Status | Description |
|-------|-------|--------|-------------|
| chunk-01-helpers-metadata | T-001, T-002, T-003 | pending | Test harness + metadata compiler tests |
| chunk-02-record-crud | T-004, T-005 | pending | Record CRUD tests (create, update, delete, validation, audit) |
| chunk-03-view-engine | T-006, T-007 | pending | View engine tests (table, kanban, calendar, filters, integrity) |
| chunk-04-adapters-links-walkthrough | T-008, T-009, T-010, T-011 | pending | System adapter tests, link test scaffolds, walkthrough integration test, final quality gate |

Execution order: sequential (chunk-01 → chunk-02 → chunk-03 → chunk-04)
Each chunk depends on the test harness from chunk-01.
