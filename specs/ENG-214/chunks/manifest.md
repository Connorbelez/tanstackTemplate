# ENG-214 Chunk Manifest

| # | Chunk | Tasks | Status | Dependencies |
|---|-------|-------|--------|--------------|
| 1 | chunk-01-transfer-machine-provider-registry | T-001 to T-005 | pending | None |
| 2 | chunk-02-cashledger-bridge-mapping | T-006 to T-010 | pending | None |
| 3 | chunk-03-inbound-flow-integration | T-011 to T-014 | pending | Chunk 1, 2 |
| 4 | chunk-04-outbound-multileg-integration | T-015 to T-018 | pending | Chunk 1, 2 |
| 5 | chunk-05-financial-property-regression | T-019 to T-023 | pending | Chunk 3, 4 |

## Execution Order
Chunks 1 and 2 are independent and can run in parallel.
Chunks 3 and 4 depend on 1+2 (they use helpers/patterns established there).
Chunk 5 depends on 3+4 (financial property tests build on integration fixtures).

## Key Context Sources
- PaymentRailsSpec (Notion): Transfer type taxonomy, state machine, integration points
- Unified Payment Rails Goal: Event publishing contract, account families, migration strategy
- ENG-220 (Done): MockTransferProvider with 4 modes, webhook simulation
- ENG-197 (In Progress): Bridge from collection attempt → transfer request (D4 conditional)
- Existing test patterns: `convex-test` harness, `seedCoreEntities()`, `withIdentity()`, audit log registration
