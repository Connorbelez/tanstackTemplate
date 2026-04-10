# Gap Analysis — 07. Expand Collection Rule Model and Complete Retry/Late-Fee Behaviors

## Verification Date
- Re-fetched against the live Notion execution page and linked implementation plan on April 4, 2026.

## Spec Verdict
- Implemented.

## Coverage Matrix

### Features
| ID | Status | Evidence |
| --- | --- | --- |
| F-1 Typed Rule Contract | Implemented | `convex/payments/collectionPlan/ruleContract.ts`, `convex/schema.ts`, `convex/payments/collectionPlan/defaultRules.ts` |
| F-2 Behavior Preservation | Implemented | `convex/payments/collectionPlan/rules/scheduleRule.ts`, `convex/payments/collectionPlan/rules/retryRule.ts`, `convex/payments/collectionPlan/rules/lateFeeRule.ts`, `convex/payments/__tests__/rules.test.ts` |
| F-3 Deterministic Rule Evaluation | Implemented | `convex/payments/collectionPlan/queries.ts`, `convex/payments/collectionPlan/engine.ts`, `convex/payments/collectionPlan/__tests__/engine.test.ts` |
| F-4 Future Extension Readiness | Implemented | placeholder kinds/config in `convex/payments/collectionPlan/ruleContract.ts` and typed schema support in `convex/schema.ts` |

### Requirements
| ID | Status | Evidence |
| --- | --- | --- |
| REQ-1 Existing schedule, retry, and late-fee behavior continues to work | Implemented | rule-handler regressions in `convex/payments/__tests__/rules.test.ts`; downstream flow coverage in `src/test/convex/payments/crossEntity.test.ts` and `src/test/convex/payments/endToEnd.test.ts` |
| REQ-2 Rule type is explicit and machine-verifiable | Implemented | discriminated typed config and kind helpers in `convex/payments/collectionPlan/ruleContract.ts`; engine dispatch now keys off `kind` in `convex/payments/collectionPlan/engine.ts` |
| REQ-3 Rule configuration is understandable and operable by admins | Implemented | shared metadata fields `code`, `displayName`, `description`, `status`, `scope`, `version`, `effectiveFrom`, `effectiveTo` in `convex/schema.ts` and default seeds in `convex/payments/collectionPlan/defaultRules.ts` |
| REQ-4 Future balance pre-check, reschedule, and workout capabilities are supported | Implemented | placeholder rule kinds/config validators and registry readiness in `convex/payments/collectionPlan/ruleContract.ts` and `convex/payments/collectionPlan/engine.ts` |
| REQ-5 Rule evaluation order and enablement remain deterministic | Implemented | active/effective/scope matching plus stable sort in `convex/payments/collectionPlan/queries.ts` and `convex/payments/collectionPlan/ruleContract.ts`; regression in `convex/payments/collectionPlan/__tests__/engine.test.ts` |
| REQ-6 Seed/default rule creation and migration stay idempotent | Implemented | legacy-aware backfill and typed default seeding in `convex/payments/collectionPlan/defaultRules.ts`; seed regressions in `src/test/convex/seed/seedPaymentData.test.ts` and `convex/payments/collectionPlan/__tests__/engine.test.ts` |
| REQ-7 Rules remain strategy-layer configuration, not debt truth | Implemented | no change to plan entry, attempt, or obligation truth paths; rules only select scheduling/retry/late-fee actions through existing seams |
| REQ-8 Late-fee behavior remains compatible with `mortgageFees` | Implemented | `convex/payments/collectionPlan/rules/lateFeeRule.ts` still resolves fee economics via `fees/queries:getActiveMortgageFee`; covered in `convex/payments/__tests__/rules.test.ts` |
| REQ-9 No page-12 admin UI/route work is required here | Implemented | backend-only delivery; no route/component changes were needed |

### Use Cases
| ID | Status | Evidence |
| --- | --- | --- |
| UC-1 Schedule Rule Creates Initial Entries Through Typed Configuration | Implemented | `convex/payments/collectionPlan/rules/scheduleRule.ts`, `convex/seed/seedPaymentData.ts`, `convex/payments/__tests__/rules.test.ts`, `src/test/convex/seed/seedPaymentData.test.ts` |
| UC-2 Retry Rule Schedules Deterministic Replacement Entries | Implemented | `convex/payments/collectionPlan/rules/retryRule.ts`, `convex/payments/__tests__/rules.test.ts`, `src/test/convex/payments/crossEntity.test.ts`, `src/test/convex/payments/endToEnd.test.ts` |
| UC-3 Late-Fee Rule Creates Fee Obligations Through Typed Rule Semantics | Implemented | `convex/payments/collectionPlan/rules/lateFeeRule.ts`, `convex/payments/__tests__/rules.test.ts`, `src/test/convex/payments/crossEntity.test.ts` |
| UC-4 Future Rule Kinds Can Be Added Without Reopening Generic Model Drift | Implemented | future placeholder kinds/config plus deterministic active-rule matching coverage in `convex/payments/collectionPlan/ruleContract.ts` and `convex/payments/collectionPlan/__tests__/engine.test.ts` |

## What Changed
- Added one canonical typed collection-rule contract in `convex/payments/collectionPlan/ruleContract.ts`.
- Expanded `collectionRules` in `convex/schema.ts` with typed metadata, scope, status, config, and effective-window fields while keeping legacy fields for compatibility.
- Reworked default rule seeding in `convex/payments/collectionPlan/defaultRules.ts` to backfill legacy rows, preserve existing behavior, and emit typed defaults idempotently.
- Refactored active-rule selection in `convex/payments/collectionPlan/queries.ts` so canonical enablement comes from typed status/effective/scope logic rather than the legacy `enabled` bit.
- Refactored `convex/payments/collectionPlan/engine.ts` to dispatch handlers by explicit rule kind instead of `rule.name`.
- Migrated schedule, retry, and late-fee handlers onto typed rule config while preserving their existing downstream side effects.
- Moved shared test fixtures onto the canonical seed path in `src/test/convex/payments/helpers.ts`.

## Spec Changes Since Extraction
- No material changes were found between the local PRD/design snapshot and the live Notion pages re-fetched on April 4, 2026.

## Intentional Scope Boundaries Preserved
- Browser e2e was intentionally not added. This page is backend model, seed, engine, and regression-test work.
- No admin UI or route surface was introduced ahead of page 12.
- Future rule kinds are represented as typed extension points only; balance pre-check, borrower reschedule, and workout behavior remain deferred to later pages.

## Residual Notes
- `enabled`, `name`, `action`, and `parameters` remain in the schema as compatibility fields for legacy rows and current development data, but the canonical contract is now `kind` + typed `config` + typed metadata.
- The `collectionRules` table still uses the legacy `by_trigger` index shape. Page 07 keeps active-rule selection correct by querying by trigger and applying canonical typed filtering in memory, which avoids another schema rewrite while the project is still greenfield.
- GitNexus did not resolve the shared handler exports cleanly in the current index, so final confidence relies on focused regression coverage plus final diff/change review rather than complete symbol-level blast-radius output.

## Test Evidence
- Focused typed-rule coverage passed:
  - `bun run test convex/payments/collectionPlan/__tests__/engine.test.ts convex/payments/__tests__/rules.test.ts src/test/convex/seed/seedPaymentData.test.ts`
- Downstream compatibility coverage passed:
  - `bun run test convex/payments/collectionPlan/__tests__/execution.test.ts convex/payments/collectionPlan/__tests__/runner.test.ts src/test/convex/seed/seedAll.test.ts src/test/convex/payments/crossEntity.test.ts src/test/convex/payments/endToEnd.test.ts`
- Final repository verification gates passed:
  - `bun check`
  - `bun typecheck`
  - `bunx convex codegen`

## Final Assessment
- No blocking page-07 gaps remain.
