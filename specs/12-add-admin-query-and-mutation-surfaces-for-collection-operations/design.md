# 12. Add Admin Query and Mutation Surfaces for Collection Operations — Design

> Derived from: https://www.notion.so/337fc1b440248119a4b9eb469e201b27

## Recommended Direction
Do not try to stretch the existing generic admin entity-table query into the collection operations backend. The repo already has a meaningful collection domain with governed execution and mutation seams; page 12 should add a dedicated collection admin boundary that reads from the canonical payment tables and delegates writes back into the canonical collection-domain mutations.

Repo-grounded rationale:
- [convex/admin/queries.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/admin/queries.ts) currently serves generic entity rows for mortgages, properties, listings, and deals only.
- [src/lib/admin-entity-queries.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/lib/admin-entity-queries.ts) and [src/lib/admin-entities.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/src/lib/admin-entities.ts) mirror that generic-table posture and are not a good primary home for collection-domain contracts.
- The collection domain already has governed write seams in page-02/page-03/page-09/page-10 modules, so admin writes should wrap those seams, not duplicate them.
- Page 11 already aligned the core payment schema around admin-friendly business snapshots and lineage fields, so page 12 can build stable read models without awkward schema drift workarounds.

## Contract Direction To Lock

### Dedicated Collection Admin Module
Recommended long-term direction:
- add a dedicated backend admin surface for collection operations instead of overloading the current generic entity-list query
- keep the collection admin contract close to the payment domain, likely under `convex/payments/collectionPlan/` or a neighboring payment-admin module, while still using the shared admin/auth builders from `convex/fluent.ts`
- treat the existing generic admin entity table as a separate concern that page 13 can continue to use for non-collection tables

Reason:
- collection operations need richer joins, lineage summaries, and governed mutation delegation than the entity-table abstraction is designed to support

### Read Model Shape
Recommended query surfaces:
- `listCollectionRules` / `getCollectionRule`
- `listCollectionPlanEntries` / `getCollectionPlanEntry`
- `listCollectionAttempts` / `getCollectionAttempt`
- `getMortgageCollectionOperationsSummary` or equivalent mortgage-scoped aggregate view

Recommended properties on read models:
- explicit domain identifiers and timestamps
- typed rule summaries with status, scope, config previews, and effective windows
- plan-entry source, lineage, balance gate status, execution linkage, workout ownership, and linked attempt summary
- attempt lifecycle, transfer linkage, provider refs, failure/reconciliation summaries, and upstream plan-entry context
- operator-facing actor and reason metadata where already present in canonical domain records

Boundary rule:
- read models may reshape data for operator use, but they should not invent new business state outside canonical collection-domain truth

### Governed Mutation Shape
Recommended mutation surfaces:
- manual execute plan entry
- reschedule plan entry
- create/update/suspend/cancel workout operations only if already supported by the canonical workout module
- rule activation / disable / update operations where the typed rule contract already has a safe domain mutation path

Mutation rule:
- admin surfaces must delegate to the canonical mutation/execution modules
- no direct `db.patch` / `db.insert` paths that bypass governed transitions or typed rule invariants

### RBAC & Audit
Recommended direction:
- enforce permission checks structurally with the shared fluent/admin middleware
- require operator-facing reason strings where the underlying canonical mutation needs them
- preserve actor metadata and lineage rather than stripping it off in admin wrappers

Repo-grounded note:
- this repo already has payment-aware fluent builders and permission middleware in [convex/fluent.ts](/Users/connor/Dev/tanstackFairLend/fairlendapp/convex/fluent.ts), so page 12 should extend that pattern rather than inventing a parallel auth style

## Proposed Backend Contract Sketch

### Rule Query Model
```ts
type AdminCollectionRuleRow = {
  _id: Id<"collectionRules">;
  kind: CollectionRuleKind;
  status: CollectionRuleStatus;
  scope: CollectionRuleScope;
  effectiveFrom?: number;
  effectiveTo?: number;
  createdAt: number;
  updatedAt: number;
  createdByActorId?: string;
  updatedByActorId?: string;
  configSummary: string;
};
```

### Plan Entry Query Model
```ts
type AdminCollectionPlanEntryRow = {
  _id: Id<"collectionPlanEntries">;
  mortgageId: Id<"mortgages">;
  status: CollectionPlanEntryStatus;
  source: CollectionPlanEntrySource;
  scheduledDate: number;
  amount: number;
  createdByRuleId?: Id<"collectionRules">;
  retryOfId?: Id<"collectionPlanEntries">;
  rescheduledFromId?: Id<"collectionPlanEntries">;
  workoutPlanId?: Id<"workoutPlans">;
  collectionAttemptId?: Id<"collectionAttempts">;
  balancePreCheckDecision?: BalancePreCheckDecision;
  balancePreCheckNextEvaluationAt?: number;
  executionSummary?: {
    executedAt?: number;
    executionReason?: string;
    triggerSource?: string;
  };
};
```

### Attempt Query Model
```ts
type AdminCollectionAttemptRow = {
  _id: Id<"collectionAttempts">;
  mortgageId: Id<"mortgages">;
  planEntryId: Id<"collectionPlanEntries">;
  status: string;
  amount: number;
  initiatedAt: number;
  transferRequestId?: Id<"transferRequests">;
  providerRef?: string;
  failureReason?: string;
  reconciliationState?: string;
  requestedByActorType?: string;
  requestedByActorId?: string;
  executionReason?: string;
};
```

## Architecture Impact

### Collection Domain
- page 12 should not change the canonical collection business logic; it should expose it safely
- the main risk is accidental duplication of domain decisions inside read-model composition or admin wrappers

### Admin UI Follow-on
- page 13 should be able to build against page-12 surfaces without issuing raw multi-table joins from the frontend
- page 12 should therefore prefer explicit, stable response shapes over thin raw-doc passthroughs

### Generic Admin Infrastructure
- the current generic entity-table query likely remains for mortgages/properties/listings/deals
- collection operations should get their own dedicated contract instead of bending the generic table abstraction beyond recognition

## Integration Strategy
1. inventory the existing governed collection write seams and shared admin/auth builders
2. define the collection admin query contract and choose a backend module boundary
3. implement admin query read models on top of canonical payment tables and aligned page-11 schema
4. add admin mutation wrappers that delegate to canonical execution/reschedule/workout/rule mutations
5. add backend contract/integration coverage for read surfaces, mutation delegation, and permission behavior
6. leave browser/UI work to page 13 unless implementation forces minimal frontend updates

## Risks & Open Points
- The biggest design risk is trying to make `convex/admin/queries.ts` own collection operations. That would produce a brittle abstraction because collection state is more relational and operational than the current entity-table listing contract.
- The current repo likely has partial domain mutations for workouts and rules but not a polished admin API yet. Page 12 should expose only supported governed operations; it should not promise CRUD where the domain does not actually support it.
- Page 13 and page 16 want stable contracts. Page 12 should err toward operator-friendly read models and explicit mutation inputs/results instead of overly thin wrappers.
