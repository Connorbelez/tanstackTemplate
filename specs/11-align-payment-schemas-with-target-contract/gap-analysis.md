# 11. Align Payment Schemas with Target Contract — Gap Analysis

## Final status

Implemented.

The page-11 schema-alignment work is complete on the local tree. The canonical payment schema now distinguishes business ownership, lineage, and typed rule modeling cleanly enough for the current AMPS execution spine, reconciliation seam, and admin follow-on work.

## What changed

### `collectionPlanEntries`
- Added required `mortgageId` snapshots.
- Renamed rule provenance to `createdByRuleId`.
- Split retry lineage into explicit `retryOfId` while keeping `rescheduledFromId` for true reschedules/workout replacements.
- Added `cancelledAt`.
- Added indexes for mortgage/status scheduling, retry lineage, and rule provenance.

### `collectionAttempts`
- Added required `mortgageId` and `obligationIds` snapshots.
- Added lifecycle timestamps for `confirmedAt`, `cancelledAt`, and `reversedAt`.
- Added indexes for transfer linkage and mortgage/status inspection.

### `collectionRules`
- Removed the legacy dual-shape fields `name`, `action`, `parameters`, and `enabled` from the canonical schema.
- Kept the typed/admin-operable envelope as the only supported contract: `kind`, `code`, `displayName`, `description`, `status`, `scope`, `config`, `version`, and authorship metadata.
- Simplified default rule seeding and rule-contract helpers to the typed model only.

### Consumer migration
- Updated collection-plan scheduling, execution, retry, balance-precheck, seed, and test helpers to the new field names and snapshots.
- Migrated retry behavior and assertions from overloaded `rescheduledFromId` to `retryOfId`.
- Updated external payment/cash-ledger/webhook test fixtures that hand-insert `collectionPlanEntries` or `collectionAttempts` so they use the canonical schema shape.

## Notion revalidation

Re-fetched through the Notion connector during closeout:
- `11. Align Payment Schemas with Target Contract` at `https://www.notion.so/337fc1b44024814c9598f556312c62e9`
- `📋 Implementation Plan — Align Payment Schemas with Target Contract` at `https://www.notion.so/337fc1b44024810892ddf10b0cc2b281`

The connector returned page snapshots stamped:
- `2026-04-03T22:50:40.764Z` for the execution page
- `2026-04-03T22:50:30.614Z` for the implementation plan

Those pages still match the implemented scope: finish the contract, do not add redundant transfer aliases, make rules typed/admin-operable, and align plan-entry / attempt lineage with the current execution model.

## Verification

Passed:
- `bun check`
- `bun typecheck`
- `bunx convex codegen`
- `bun run test convex/payments/__tests__/rules.test.ts convex/payments/collectionPlan/__tests__/engine.test.ts src/test/convex/seed/seedPaymentData.test.ts convex/payments/collectionPlan/__tests__/execution.test.ts convex/payments/collectionPlan/__tests__/runner.test.ts convex/payments/collectionPlan/__tests__/reschedule.test.ts convex/payments/collectionPlan/__tests__/workout.test.ts src/test/convex/payments/crossEntity.test.ts src/test/convex/payments/endToEnd.test.ts`

Additional confidence:
- A broader payments regression slice no longer produced page-11 schema validator failures for missing `mortgageId` / `obligationIds` on manually seeded plan entries and attempts after the fixture migration.

## GitNexus

- Pre-edit `impact` lookups against the shared schema file-path targets did not resolve cleanly in the current index, so I used the documented fallback: focused regression coverage plus final `detect_changes`.
- `gitnexus_detect_changes(scope=\"all\", repo=\"fairlendapp\")` reported `risk_level: low`.

## Residuals

No blocking page-11 implementation gaps remain.

The remaining failures in the broader non-page-11 test sweep are unrelated harness/runtime issues, not schema-alignment regressions:
- older audit-log harnesses missing `auditLog/aggregateBySeverity`
- workflow/workpool limitations in `paymentReversalIntegration` under `convex-test` (`setTimeout` / `process` issues)
- existing scheduled-function transaction issues in older `cashReceiptIntegration` webhook-style flows
- one pre-existing reconciliation assertion drift in `reconciliationSuite`

Those should be handled as separate test-harness cleanup work, not as unfinished page-11 schema work.
