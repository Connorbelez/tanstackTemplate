# ENG-184 Chunk Manifest

| # | Chunk | Tasks | Status | Dependencies |
|---|-------|-------|--------|-------------|
| 1 | chunk-01-schema-types | T-001 – T-003 | pending | None |
| 2 | chunk-02-machine-registration | T-004 – T-008 | pending | Chunk 1 (types/validators) |
| 3 | chunk-03-provider-interface | T-009 – T-012 | pending | Chunk 1 (types) |
| 4 | chunk-04-effects-ledger | T-013 – T-016 | pending | Chunk 2 (machine), Chunk 3 (provider interface) |
| 5 | chunk-05-mutations-bridge | T-017 – T-019 | pending | Chunk 4 (effects) |
| 6 | chunk-06-webhook-reconciliation | T-020 – T-024 | pending | Chunk 5 (mutations) |
| 7 | chunk-07-tests | T-025 – T-030 | pending | All prior chunks |

## Execution Order
```
Chunk 1 (schema/types) ──→ Chunk 2 (machine/registration) ──→ Chunk 4 (effects/ledger)
                       └──→ Chunk 3 (provider interface)  ──┘         │
                                                                      ↓
                                                            Chunk 5 (mutations/bridge)
                                                                      │
                                                                      ↓
                                                            Chunk 6 (webhook/recon)
                                                                      │
                                                                      ↓
                                                            Chunk 7 (tests/verify)
```

## Quality Gate (after each chunk)
```bash
bunx convex codegen
bun check
bun typecheck
```
