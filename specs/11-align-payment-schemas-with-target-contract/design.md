# 11. Align Payment Schemas with Target Contract — Design

> Derived from: https://www.notion.so/337fc1b44024814c9598f556312c62e9

## Recommended Direction
Treat page 11 as a canonical contract cleanup across the three payment tables, not as an excuse to add every target-field noun literally.

Repo-grounded rationale:
- `collectionPlanEntries` already has meaningful execution and strategy metadata from pages 02, 06, 08, 09, and 10.
- `collectionAttempts` already uses the transfer-mediated execution model from pages 03 and 04.
- `collectionRules` is already materially typed from page 07, but still carries the older generic shape alongside the typed one.
- The remaining drift is mostly naming, snapshot ownership, lineage clarity, and consumer cleanup.

## Contract Decisions To Lock

### `collectionPlanEntries`
Recommended long-term direction:
- add direct `mortgageId` as a business-context snapshot so admin and orchestration consumers do not always have to derive it from obligations
- keep `collectionAttemptId`, `executedAt`, and `executionIdempotencyKey` as the canonical execution-consumption linkage
- decide whether retry lineage should remain overloaded on `rescheduledFromId` or move to an explicit `retryOfId`
- rename or converge `ruleId` toward a clearer origin field such as `createdByRuleId`
- add explicit terminal timestamps where useful, especially `cancelledAt`

Repo-grounded note:
- page 09 and page 10 already distinguish reschedule and workout lineage conceptually
- page 11 is the right place to stop relying on one overloaded lineage field if the code now needs sharper semantics

### `collectionAttempts`
Recommended long-term direction:
- add direct `mortgageId` and `obligationIds` snapshots so attempts are self-describing business execution records
- keep `planEntryId` as the canonical upstream business link
- keep `transferRequestId` as the canonical downstream transfer link unless a distinct `transferId` meaning actually exists in this repo
- preserve `providerRef` / `providerData` if they are still the meaningful provider-facing reconciliation facts
- consider richer lifecycle timestamps such as `confirmedAt`, `cancelledAt`, and `reversedAt` where the attempt machine and reconciliation story benefit from them

Boundary rule:
- do not add duplicate fields that say the same thing with different names just to mirror stale target wording
- if target `externalId` is semantically just the existing `providerRef`, converge the docs and consumers instead of introducing an alias

### `collectionRules`
Recommended long-term direction:
- keep `kind`, `status`, `scope`, `config`, `effectiveFrom`, `effectiveTo`, and authorship fields as canonical
- evaluate whether `name`, `condition`, `action`, `parameters`, and `enabled` should be removed, fenced as transitional, or backfilled deterministically
- make seeds, admin consumers, and tests rely on the typed contract only

Repo-grounded note:
- page 07 already introduced typed config and status/scope semantics
- page 11 should finish the convergence rather than preserving permanent dual-shape rules

## Proposed Schema Direction

### `collectionPlanEntries`
```ts
type CollectionPlanEntry = {
	mortgageId: Id<"mortgages">;
	obligationIds: Id<"obligations">[];
	amount: number;
	method: string;
	scheduledDate: number;
	status: "planned" | "executing" | "completed" | "cancelled" | "rescheduled";
	source:
		| "default_schedule"
		| "retry_rule"
		| "late_fee_rule"
		| "admin"
		| "admin_reschedule"
		| "admin_workout";
	createdByRuleId?: Id<"collectionRules">;
	retryOfId?: Id<"collectionPlanEntries">;
	rescheduledFromId?: Id<"collectionPlanEntries">;
	workoutPlanId?: Id<"workoutPlans">;
	collectionAttemptId?: Id<"collectionAttempts">;
	executedAt?: number;
	cancelledAt?: number;
	executionIdempotencyKey?: string;
	createdAt: number;
};
```

### `collectionAttempts`
```ts
type CollectionAttempt = {
	mortgageId: Id<"mortgages">;
	obligationIds: Id<"obligations">[];
	planEntryId: Id<"collectionPlanEntries">;
	amount: number;
	method: string;
	status: string;
	triggerSource?: "system_scheduler" | "admin_manual" | "workflow_replay" | "migration_backfill";
	executionRequestedAt?: number;
	executionIdempotencyKey?: string;
	requestedByActorType?: "system" | "admin" | "workflow";
	requestedByActorId?: string;
	executionReason?: string;
	transferRequestId?: Id<"transferRequests">;
	providerRef?: string;
	providerData?: Record<string, unknown>;
	initiatedAt: number;
	confirmedAt?: number;
	failedAt?: number;
	cancelledAt?: number;
	reversedAt?: number;
	failureReason?: string;
};
```

### `collectionRules`
```ts
type CollectionRule = {
	kind: CollectionRuleKind;
	code?: string;
	displayName?: string;
	description?: string;
	trigger: "schedule" | "event";
	status: "draft" | "active" | "disabled" | "archived";
	scope: CollectionRuleScope;
	config: CollectionRuleConfig;
	version?: number;
	effectiveFrom?: number;
	effectiveTo?: number;
	createdByActorId?: string;
	updatedByActorId?: string;
	priority: number;
	createdAt: number;
	updatedAt: number;
};
```

## Architecture Impact

### Execution Spine
- plan-entry execution should no longer need to recover core business context indirectly from the first obligation when the plan entry itself can carry `mortgageId`
- attempt creation should snapshot `mortgageId` and `obligationIds` so downstream consumers and reconciliation logic can inspect one attempt record without always rejoining back through the plan entry

### Retry / Reschedule / Workout
- if retry gets its own lineage field, page-07/page-09/page-10 behavior becomes easier to inspect and less ambiguous
- workout ownership remains orthogonal to retry/reschedule lineage; page 11 should preserve that separation

### Admin Surfaces
- page-12/page-13 query surfaces should consume the canonical names immediately after this cleanup
- if legacy names remain during migration, they should be strictly fenced and not presented as peer semantics

## Integration Strategy
1. inventory current fields already in use
2. add or rename the remaining canonical fields in `schema.ts`
3. update execution, reconciliation, rules, seeds, tests, and admin query surfaces
4. run codegen and fix the resulting type fallout immediately
5. add focused regression coverage around the changed schema meanings

## Risks & Open Points
- GitNexus did not resolve the targeted shared schema/collection-plan files cleanly in the current index, so this pass should assume focused regression coverage is the reliable guardrail.
- The sharpest design choice is whether to introduce explicit `retryOfId` and `createdByRuleId` or keep overloading the current fields. My default recommendation is to sharpen the names now because the repo is still greenfield.
- `collectionAttempts` target wording includes fields like `transferId` and `externalId`, but the repo already has a canonical `transferRequestId` plus provider-facing refs. The implementation should prefer one stable meaning over duplicate aliases.
