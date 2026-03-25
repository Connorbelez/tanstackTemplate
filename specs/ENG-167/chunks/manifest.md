# ENG-167: Chunk Manifest

## Chunk Execution Order

| # | Chunk | Tasks | Status |
|---|-------|-------|--------|
| 1 | chunk-01-integration-mutation | T-001 through T-005 | pending |

## Notes
- Single chunk — the scope is small (1 integration function, 1 admin mutation, 1 helper, tests)
- No schema changes needed (OBLIGATION_WRITTEN_OFF, WRITE_OFF family already exist)
- No GT state machine changes (write-offs are cash-ledger-only)
- ENG-166 (waiver) is NOT yet implemented — skip shared `validateAdminAdjustment` per YAGNI
