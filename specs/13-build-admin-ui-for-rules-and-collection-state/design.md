# 13. Build Admin UI for Rules and Collection State — Design

> Derived from: https://www.notion.so/337fc1b440248137a4a1f11a164dae02

## Recommended Direction
Do not implement page 13 UI work yet. The repo already has a generic admin shell and generic record-detail surface, but the current execution decision is to defer all UI work until the end of the AMPS realignment and keep the remaining near-term sequence backend-first.

Repo-grounded rationale:
- [route.tsx](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/routes/admin/route.tsx) is just a shell with an outlet and generic detail sheet.
- [admin-entity-queries.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/lib/admin-entity-queries.ts) currently only wires the generic entity rows query.
- [entity-registry.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/components/admin/shell/entity-registry.ts) models broad admin navigation, but does not yet define collection-plan, attempt, or rule areas.
- [admin.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/payments/collectionPlan/admin.ts) now exposes the dedicated backend contracts page 13 should consume.
- [RecordSidebar.tsx](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/components/admin/shell/RecordSidebar.tsx) provides a useful shell pattern for detail panes, but not the actual AMPS information architecture.

Current execution decision:
- treat this file as a deferred UI handoff design
- make no route/component changes during the current execution sequence
- resume the route/component work only in dedicated end-of-sequence UI execution pages under the parent Notion index

## IA Direction
This section remains as future-state handoff guidance for the later UI pages. It is not an instruction to start implementation now.

### Primary Views
Recommended first-cut route structure:
- mortgage detail `Payments` workspace inside the existing mortgage detail page
- global `Rules` view for collection rule management
- global `Collection Plan` queue
- global `Collection Attempts` queue

Recommended UX stance:
- mortgage-centric case work for understanding one loan
- global queues for operational oversight
- the same underlying component system reused for page 16

### Three-Layer Presentation
The UI should consistently separate:
- obligations: what is contractually owed
- plan entries: what strategy has scheduled
- attempts: what execution actually tried or completed

This distinction should be explicit in:
- section titles
- badges and status chips
- timeline group labels
- row cards and detail headers
- empty states and explanatory helper text

### Visual Direction
Recommended aesthetic: editorial operations console.

Why:
- the page needs to be business-readable, not only engineering-readable
- an editorial, high-contrast admin style can make layered payment state legible without turning into a gray CRUD grid
- it fits the project’s need for a credible stakeholder-facing surface better than generic table-heavy scaffolding

Implementation notes:
- preserve the existing admin shell chrome
- introduce stronger hierarchy inside the content area through denser cards, bolder section labels, and differentiated layer color tokens
- avoid overusing default table UIs when queue cards or split-pane lists communicate state better

## Proposed Component Structure
Deferred handoff only. No components from this section should be built in the current sequence.

### Route-Level
- `src/routes/admin/rules/route.tsx`
- `src/routes/admin/rules/$ruleId.tsx`
- `src/routes/admin/collection-plan/route.tsx`
- `src/routes/admin/collection-plan/$planEntryId.tsx`
- `src/routes/admin/collection-attempts/route.tsx`
- `src/routes/admin/collection-attempts/$attemptId.tsx`
- mortgage detail enhancement under `src/routes/admin/mortgages/$recordid.tsx`

### Shared UI Components
- payments workspace shell for mortgage detail
- collection queue list surface
- collection detail panel
- rule card/list/detail components
- attempt status / reconciliation summary components
- operator action drawer/dialog system
- timeline/event grouping components

### Data Hooks
- query hooks around page-12 admin reads
- mutation hooks around page-12 admin writes
- shared mapping helpers that convert backend result shapes into presentational sections without re-deriving business rules

## API Surface
These contracts remain the intended backend inputs for the later UI phase. They are documented here so the eventual dedicated UI pages can start from the already-aligned page-12 surface.

### Reads
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `api.payments.collectionPlan.admin.listCollectionRules` | filters TBD | rule rows | Rules queue |
| `api.payments.collectionPlan.admin.getCollectionRule` | `ruleId` | rule detail | Rule detail/editor |
| `api.payments.collectionPlan.admin.listCollectionPlanEntries` | filters TBD | plan entry rows | Global plan queue |
| `api.payments.collectionPlan.admin.getCollectionPlanEntry` | `planEntryId` | plan entry detail | Plan entry detail |
| `api.payments.collectionPlan.admin.listCollectionAttempts` | filters TBD | attempt rows | Global attempts queue |
| `api.payments.collectionPlan.admin.getCollectionAttempt` | `attemptId` | attempt detail | Attempt detail |
| `api.payments.collectionPlan.admin.getMortgageCollectionOperationsSummary` | `mortgageId` | mortgage operations summary | Mortgage payments workspace |

### Writes
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `api.payments.collectionPlan.admin.executeCollectionPlanEntry` | plan entry action payload | execution result | Manual execute flow |
| `api.payments.collectionPlan.admin.rescheduleCollectionPlanEntry` | reschedule payload | reschedule result | Reschedule flow |
| `api.payments.collectionPlan.admin.createWorkoutPlan` | workout payload | create result | Workout create flow |
| `api.payments.collectionPlan.admin.activateWorkoutPlan` | `workoutPlanId` | activation result | Workout activation flow |
| `api.payments.collectionPlan.admin.createCollectionRule` | rule payload | create result | Rule create flow |
| `api.payments.collectionPlan.admin.updateCollectionRule` | rule update payload | update result | Rule update flow |

## Routing Strategy
Deferred handoff only. No new routes should be added in the current sequence.

### Global Admin Navigation
Recommended addition to admin nav:
- add payments-domain navigation items for `Rules`, `Collection Plan`, and `Collection Attempts`
- keep them first-class routes, not hidden secondary tabs

### Mortgage Detail
Recommended approach:
- keep the mortgage detail route
- replace the generic-only experience with a payments workspace section or dedicated tab
- show obligations, plan entries, attempts, and timeline in one coherent mortgage-centric page

Preferred first cut:
- a dedicated `Payments` section inside mortgage detail rather than splitting into separate `Plan` and `Attempts` tabs immediately
- reason: it better supports case work and the spec explicitly wants business-readable three-layer understanding

## Testing Direction
- no frontend or browser tests should be added in the current sequence
- when the dedicated UI pages are activated later, component/integration tests should carry most of the load initially
- browser e2e for the later UI phase should cover:
  - mortgage payments workspace
  - rules inspection/update
  - plan-entry queue and manual execute/reschedule
  - attempts queue/detail

## Implementation Decisions To Lock
- Consume page-12 backend contracts directly when the later UI pages are executed; do not expand `src/lib/admin-entity-queries.ts` into a collection-domain join layer.
- Reuse the admin shell and sidebar patterns later, but do not add collection routes/components in the current sequence.
- Favor mortgage-centric operations UI plus global queues in the later UI phase, not one universal “payments table”.
- Use explicit dialogs/drawers for governed writes with reason capture and confirmation in the later UI phase.
- Keep future production UI and demo UI on the same eventual route/component foundation rather than building a parallel prototype surface.
