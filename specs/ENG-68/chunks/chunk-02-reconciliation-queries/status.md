# Chunk 02: reconciliation-queries — Status

Completed: 2026-03-19

## Tasks Completed
- [x] T-006: Added lender-facing undisbursed balance and disbursement history queries under `convex/dispersal/queries/`.
- [x] T-007: Added mortgage-scoped and obligation-scoped dispersal lookup queries with lender breakdown data.
- [x] T-008: Added servicing fee history lookup using the existing `servicingFeeEntries.by_mortgage` index plus in-memory date filtering.

## Tasks Incomplete
- [ ] None in chunk scope.

## Quality Gate
- `bun check`: pass
- `bun typecheck`: fail — repo has pre-existing unrelated type errors outside the ENG-68 dispersal files
- `bunx convex codegen`: fail — missing `CONVEX_DEPLOYMENT` / local Convex project configuration in this environment

## Notes
- The schema indexes already exist, so the queries use indexed base reads and then apply date filtering in memory where Convex’s composite index shape does not support both lender/mortgage equality and arbitrary date windows in the same range.
- Query outputs preserve integer-cent amounts and expose the persisted `calculationDetails` for downstream reconciliation screens.
