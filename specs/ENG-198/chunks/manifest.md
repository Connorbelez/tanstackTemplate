# ENG-198 Chunk Manifest

Generated: 2026-03-27
Source: Linear ENG-198, Notion implementation plan

| # | Chunk | Tasks | Status | Dependencies |
|---|-------|-------|--------|-------------|
| 1 | chunk-01-schema-shared-core | T-001 – T-003 | completed | Existing `webhookEvents` table, `transferRequests.by_provider_ref`, webhook verification actions |
| 2 | chunk-02-vopay-eft | T-004 – T-006 | completed | Chunk 1 |
| 3 | chunk-03-rotessa-tests | T-007 – T-010 | completed | Chunks 1-2 |

## Execution Order
```text
chunk-01-schema-shared-core -> chunk-02-vopay-eft -> chunk-03-rotessa-tests
```

## Quality Gate
```bash
bun check
bun typecheck
bunx convex codegen
```
