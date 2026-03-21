# ENG-149: CONTROL Subaccount Taxonomy — Master Task List

## Chunk 1: Types & Schema (chunk-01-types-and-schema)

- [x] T-001: Add `ENTRY_TYPE_CONTROL_SUBACCOUNT` mapping to `types.ts`
- [x] T-002: Add `TRANSIENT_SUBACCOUNTS` set to `types.ts`
- [x] T-003: Add `by_family_and_subaccount` composite index to schema

## Chunk 2: Queries & Reconciliation (chunk-02-queries-and-reconciliation)

- [x] T-004: Add `getControlAccountsBySubaccount` to `accounts.ts`
- [x] T-005: Add `getControlBalanceBySubaccount` to `reconciliation.ts`
- [x] T-006: Add `validateControlNetZero` to `reconciliation.ts`
- [x] T-007: Export new queries as public Convex queries in `queries.ts`

## Chunk 3: Tests (chunk-03-tests)

- [x] T-008: Test `ENTRY_TYPE_CONTROL_SUBACCOUNT` mapping correctness
- [x] T-009: Test `getControlAccountsBySubaccount` returns correct subset
- [x] T-010: Test `getControlBalanceBySubaccount` sums correctly
- [x] T-011: Test `validateControlNetZero` for complete posting group (net-zero)
- [x] T-012: Test `validateControlNetZero` for incomplete posting group (non-zero)
- [x] T-013: Test WAIVER subaccount is exempt from net-zero validation
- [x] T-014: Test CONTROL account creation requires subaccount
