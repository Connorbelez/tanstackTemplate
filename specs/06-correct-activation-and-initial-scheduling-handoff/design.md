# 06. Correct Activation and Initial Scheduling Handoff — Design

> Derived from: https://www.notion.so/337fc1b4402481738c5ecc14f4e08da9

## Types & Interfaces

### Existing orchestration split
The repo already contains the important pieces, but they are not wired through a
single handoff:
- `convex/payments/obligations/generate.ts` and `generateImpl.ts` own
  obligation generation from mortgage terms
- `convex/payments/collectionPlan/rules/scheduleRule.ts` owns the intended
  schedule-rule semantics for initial plan creation
- `convex/seed/seedPaymentData.ts` still bypasses that rule logic and inserts
  initial `collectionPlanEntries` directly
- `convex/seed/seedAll.ts` calls `seedPaymentData`, but does not currently seed
  default collection rules before doing so

### Shared scheduling orchestration seam
Because `scheduleRuleHandler` runs under an `ActionCtx` and `seedPaymentDataImpl`
is currently a mutation implementation, page 06 should not try to make the
mutation call `evaluateRules` directly. The repo-grounded shape is:
- extract a shared initial-scheduling implementation module that encapsulates
  schedule-rule semantics
- let `scheduleRuleHandler` delegate to that shared implementation
- let bootstrap/activation orchestration call that same shared implementation
  through context-appropriate wrappers

This keeps the semantics rule-driven without forcing bootstrap to bypass Convex
context constraints.

## Database Schema

### No schema changes expected
Page 06 is orchestration convergence work. Existing tables are sufficient:
- `obligations`
- `collectionRules`
- `collectionPlanEntries`

### Existing provenance fields should be reused
- `collectionPlanEntries.source` should continue to use `"default_schedule"` for
  initial schedule-rule-derived entries
- `collectionPlanEntries.ruleId` should remain populated when the schedule rule
  is the source of the entry
- idempotency should continue to rely on existing obligation coverage checks
  rather than introducing new tables or flags

## Architecture

### Data Flow
bootstrap or activation orchestration
-> ensure default collection rules exist
-> generate or reuse obligations from mortgage terms
-> shared initial scheduling orchestration applies schedule-rule semantics
-> `collectionPlanEntries` are created through canonical rule-owned logic
-> page-03 execution consumes due `planned` entries
-> page-07 retry and late-fee rules continue to operate on the same model

### Component Structure
Likely code surface:
- `convex/seed/seedPaymentData.ts`
- `convex/seed/seedAll.ts`
- `convex/payments/collectionPlan/seed.ts`
- `convex/payments/collectionPlan/engine.ts`
- `convex/payments/collectionPlan/rules/scheduleRule.ts`
- `convex/payments/collectionPlan/mutations.ts`
- `convex/obligations/queries.ts`
- `convex/payments/obligations/generate.ts`
- new shared orchestration/helper module for initial schedule generation
- focused backend tests in payments/collectionPlan plus seed integration tests

### API Surface

#### Reads (Queries/GET)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `getUpcomingInWindow` | `mortgageId?`, `dueBefore` | obligations | Existing rule input for upcoming obligations due in the scheduling window. |
| `getPlannedEntriesForObligations` | `obligationIds[]` | obligation coverage map | Existing idempotency lookup for initial plan coverage. |
| `getEnabledRules` | `trigger` | `collectionRules[]` | Existing rule lookup; page 06 may add wrapper usage rather than change the contract. |

#### Writes (Mutations/POST)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `generateObligations` / `generateObligationsImpl` | mortgage-derived inputs | obligation IDs | Existing obligation-first generation path that must remain canonical. |
| `createEntry` | plan-entry fields | plan entry ID | Existing plan-entry creation primitive reused by the shared scheduling seam. |
| `seedPaymentData` | `mortgageId` | bootstrap summary | Existing bootstrap entrypoint to be refactored onto canonical scheduling. |
| `seedCollectionRules` | none | created/skipped counts | Existing default-rule seeding path that bootstrap/activation prerequisites should use. |

#### Side Effects (Actions/Jobs)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `evaluateRules` | trigger + mortgage/event scope | void | Existing rules-engine entrypoint; page 06 should keep it canonical while moving schedule semantics into a shared implementation seam. |
| shared initial scheduling wrapper | mortgage scope + schedule parameters | created/reused summary | New or extracted orchestration seam used by both schedule-rule evaluation and bootstrap/activation. |

### Routing
No route changes are planned. This is backend orchestration and test work only.

## Implementation Decisions

### Extract shared schedule semantics instead of duplicating logic
The Notion plan explicitly prefers a shared scheduling orchestration seam over
letting bootstrap call rule internals directly. The repo also requires this,
because a mutation cannot simply invoke the existing internal action as an
implementation detail.

### Keep obligation generation canonical and separate
`generateObligationsImpl` already expresses the contractual truth of mortgage
terms producing obligations. Page 06 should preserve that separation and avoid
making collection-plan generation the driver of mortgage truth.

### Bootstrap should ensure rule prerequisites, not invent plan entries
`seedAll` and `seedPaymentData` should be responsible for:
- making sure default rules exist
- invoking canonical obligation generation
- invoking canonical initial scheduling

They should not remain special-case architectural exceptions.

### Idempotency should remain obligation-coverage based
The existing schedule-rule path already checks for planned-entry coverage per
obligation. Page 06 should reuse that approach instead of inventing new
idempotency metadata.

### Browser e2e is not the right verification surface here
This page changes backend lifecycle orchestration and bootstrap behavior. The
highest-signal verification should come from unit and integration tests around:
- shared scheduling semantics
- bootstrap reruns
- downstream page-03/page-07 compatibility
