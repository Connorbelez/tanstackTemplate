# 13. Build Active Mortgage Payment System Demo Workspace (/demo) — Design

> Derived from: https://www.notion.so/13-Build-Active-Mortgage-Payment-System-Demo-Workspace-demo-337fc1b440248137a4a1f11a164dae02?source=copy_link
>
> Linked implementation plan: https://www.notion.so/337fc1b4402481aea2baf5ef53f155ec

## Types & Interfaces

### Canonical backend contracts to consume
- `CollectionRuleRow` from `convex/payments/collectionPlan/admin.ts`
- `CollectionPlanEntryRow` from `convex/payments/collectionPlan/admin.ts`
- `CollectionAttemptRow` from `convex/payments/collectionPlan/admin.ts`
- the result of `getMortgageCollectionOperationsSummary`
- canonical action result unions from:
  - `executePlanEntry`
  - `reschedulePlanEntry`
  - `createWorkoutPlan`
  - `activateWorkoutPlan`
  - `completeWorkoutPlan`
  - `cancelWorkoutPlan`
  - `createCollectionRule`
  - `updateCollectionRule`

### Demo-local frontend types
- `AmpsDemoNavItem`
  - route, label, description, icon
- `AmpsDemoScenarioKey`
  - a finite key set for the review stories the demo supports
- `AmpsDemoScenarioDefinition`
  - scenario key, label, narrative, mortgage id or selector strategy, status badges, and expected focal views
- `AmpsRuleViewModel`
  - display-friendly rule status, scope, and config summary derived from `CollectionRuleRow`
- `AmpsPlanEntryViewModel`
  - display-friendly strategy row including lineage, balance pre-check state, and workout context derived from `CollectionPlanEntryRow`
- `AmpsAttemptViewModel`
  - execution-focused row including transfer and reconciliation context derived from `CollectionAttemptRow`
- `AmpsMortgageWorkspaceModel`
  - summary card data composed from `getMortgageCollectionOperationsSummary`

## Database Schema

No canonical payment-schema expansion is expected for page 13. The workspace should
reuse the existing realigned payment tables and contracts. If deterministic demo
scenarios require additive support, prefer demo-specific seed/reset orchestration
over introducing new production business tables.

Likely acceptable additive backend pieces:
- demo-only scenario seed/reset functions under a demo-scoped module
- demo query aggregation that composes the page-12 collection admin contracts

Not acceptable:
- new production-only AMPS data shapes created solely for demo presentation
- bypassing canonical collection queries or writes with custom table reads/writes in the UI

## Architecture

### Data Flow
1. User enters `/demo/amps`.
2. Demo workspace loads scenario metadata and AMPS read models.
3. Read models come from page-12 backend collection admin contracts.
4. User drills into rules, collection plan, attempts, or mortgage payments.
5. Governed demo actions call canonical backend collection actions or explicit demo wrappers that delegate to them.
6. Query invalidation refreshes the workspace so the resulting backend state is visible immediately.

### Component Structure
- `src/routes/demo/amps/route.tsx`
  - AMPS demo shell, workspace framing, scenario picker, top-level navigation
- `src/routes/demo/amps/index.tsx`
  - command-center style overview with scenario cards and summary cues
- `src/routes/demo/amps/rules.tsx`
  - rule list, filters, and rule detail entry point
- `src/routes/demo/amps/collection-plan.tsx`
  - plan-entry queue view with lineage and balance pre-check emphasis
- `src/routes/demo/amps/collection-attempts.tsx`
  - attempt queue view with transfer and reconciliation emphasis
- `src/routes/demo/amps/mortgages/$mortgageId/payments.tsx`
  - mortgage-level payments workspace joining rules, plan entries, attempts, and workout state
- `src/components/demo/amps/*`
  - shared cards, tables, timelines, filters, scenario selectors, and governed action dialogs

### API Surface

#### Reads (Queries/GET)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `listCollectionRules` | `kind?`, `status?`, `mortgageId?`, `limit?` | `CollectionRuleRow[]` | Load the rules surface and mortgage-scoped rule views. |
| `getCollectionRule` | `ruleId` | rule detail payload | Load rule detail drill-down and related entries. |
| `listCollectionPlanEntries` | `mortgageId?`, `status?`, `source?`, `workoutPlanId?`, `limit?` | `CollectionPlanEntryRow[]` | Load strategy queue views. |
| `getCollectionPlanEntry` | `planEntryId` | plan-entry detail payload | Load entry lineage and audit drill-down. |
| `listCollectionAttempts` | `mortgageId?`, `planEntryId?`, `status?`, `limit?` | `CollectionAttemptRow[]` | Load execution queue views. |
| `getCollectionAttempt` | `attemptId` | attempt detail payload | Load execution detail, transfer, reconciliation, and journal context. |
| `getMortgageCollectionOperationsSummary` | `mortgageId`, `recentAttemptLimit?`, `upcomingEntryLimit?` | mortgage summary payload | Drive the mortgage payments workspace. |

#### Writes (Mutations/POST)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `executeCollectionPlanEntry` | `planEntryId`, `reason?`, `dryRun?`, `idempotencyKey?` | `ExecutePlanEntryResult` | Manual execution from demo workflows. |
| `rescheduleCollectionPlanEntry` | `planEntryId`, `newScheduledDate`, `reason` | `ReschedulePlanEntryResult` | Reschedule from queue or mortgage views. |
| `createWorkoutPlan` | `mortgageId`, `name`, `rationale`, `installments` | `CreateWorkoutPlanResult` | Create a workout from the demo. |
| `activateWorkoutPlan` | `workoutPlanId` | `ActivateWorkoutPlanResult` | Activate a draft workout plan. |
| `completeWorkoutPlan` | `workoutPlanId` | `CompleteWorkoutPlanResult` | Exit an active workout as completed. |
| `cancelWorkoutPlan` | `workoutPlanId`, `reason?` | `CancelWorkoutPlanResult` | Exit a draft or active workout as cancelled. |
| `createCollectionRule` | typed rule payload | create result union | Add demo-visible rules through the canonical backend. |
| `updateCollectionRule` | typed rule update payload | update result union | Update rules through the canonical backend. |

#### Side Effects (Actions/Jobs)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| demo scenario seed/reset action(s) | scenario key or reset args | deterministic demo state | Optional demo-only orchestration if existing seed data is insufficient. |
| canonical collection actions above | action-specific args | action-specific result unions | Existing AMPS backend flows already own the real side effects. |

### Routing
- `/demo/amps`
  - AMPS workspace overview and scenario entry point
- `/demo/amps/rules`
  - rules-focused surface
- `/demo/amps/collection-plan`
  - collection plan entry queue
- `/demo/amps/collection-attempts`
  - collection attempt queue
- `/demo/amps/mortgages/$mortgageId/payments`
  - mortgage-scoped payments workspace

### Testing
- Unit/component tests should live near new AMPS demo components following existing repo patterns.
- Playwright tests should live under `e2e/amps/` because `playwright.config.ts` uses `./e2e` as `testDir`.
- E2E coverage should focus on:
  - workspace navigation
  - scenario loading/reset behavior
  - rule review/update flows
  - collection plan and attempt review flows
  - manual execute, reschedule, and workout action flows

## Implementation Decisions
- Use `/demo/amps` as the stable route prefix because it is concise, AMPS-specific, and consistent with existing `/demo/*` route patterns.
- Prefer existing neutral demo shell patterns from routes like `/demo/crm` and `/demo/governed-transitions` instead of the production admin shell.
- Keep the page-12 backend collection admin contracts as the canonical read/write boundary; frontend adapters should shape them for presentation instead of expanding backend API surface prematurely.
- If scenario determinism requires extra backend help, add narrowly scoped demo orchestration instead of new production-domain tables or fake client-side state.
- Defer production admin information architecture and final visual polish to later pages; page 13 is for a strong demo workspace, not a production admin commitment.
