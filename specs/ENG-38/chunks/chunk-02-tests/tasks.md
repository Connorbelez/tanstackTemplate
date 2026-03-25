# Chunk 02: Test Expansion

## Tasks

- [x] T-005: Add T-070 test — "multi-step transfer sequence, query at intermediate points" — mint+issue to lender-a, transfer to lender-b, transfer to lender-c, then query getPositionsAt at each intermediate timestamp and verify correct ownership snapshots
- [x] T-006: Add T-071 test — "determinism — same query returns identical results across multiple calls" — create entries, then call getPositionsAt 5 times with same asOf and assert all results are identical
- [x] T-007: Add T-072 test (skipped with `.skip`) — "SHARES_RESERVED entries excluded from point-in-time replay (requires ENG-34)" — placeholder for when reservation mutations are implemented
- [x] T-008: Add T-073 test — "getBalanceAt tracks balance evolution across lifecycle" — mint, issue, redeem, then query getBalanceAt at each intermediate timestamp for both position and treasury accounts
