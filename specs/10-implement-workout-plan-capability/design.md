# 10. Implement Workout Plan Capability — Design

> Derived from: https://www.notion.so/337fc1b4402481b59a5ecc19d8b22e13

## Recommended Direction
Use an explicit workout domain object rather than trying to encode page-10 behavior purely in the existing `collectionRules` placeholder model.

Repo-grounded rationale:
- `workout_policy` in `ruleContract.ts` is still a placeholder only
- page 09 introduced explicit reschedule lineage and auditability, which already points toward governed strategy objects rather than hidden rule mutations
- workout needs lifecycle states, rationale, scope, and operator workflow, which become opaque if everything is buried inside one rule config blob

## Types & Interfaces

### Proposed Workout Domain Model
```ts
type WorkoutPlanStatus =
	| "draft"
	| "active"
	| "suspended"
	| "completed"
	| "cancelled";

type WorkoutPlanScope =
	| { scopeType: "mortgage"; mortgageId: Id<"mortgages"> }
	| {
			scopeType: "obligation_set";
			mortgageId: Id<"mortgages">;
			obligationIds: Id<"obligations">[];
	  };

type WorkoutInstallment = {
	amount: number;
	method: string;
	scheduledDate: number;
};

type WorkoutPlanStrategy = {
	kind: "custom_schedule";
	installments: WorkoutInstallment[];
};

type WorkoutPlan = {
	status: WorkoutPlanStatus;
	scope: WorkoutPlanScope;
	strategy: WorkoutPlanStrategy;
	reason: string;
	summary?: string;
	createdByActorId: string;
	updatedByActorId: string;
	activatedAt?: number;
	completedAt?: number;
	cancelledAt?: number;
	suspendedAt?: number;
};
```

### Proposed Collection-Plan Ownership Shape
```ts
type CollectionPlanEntrySource =
	| "default_schedule"
	| "retry_rule"
	| "late_fee_rule"
	| "admin"
	| "admin_reschedule"
	| "admin_workout";

type WorkoutOwnedPlanEntryMetadata = {
	workoutPlanId?: Id<"workoutPlans">;
	workoutAction?: "created" | "superseded" | "replaced";
};
```

## Database Schema

### New `workoutPlans` Table
Planned first-version shape:
- lifecycle status
- scope
- explicit strategy config
- operator rationale
- created/updated/activated/suspended/completed/cancelled timestamps
- actor attribution fields

Likely indexing:
- by status
- by mortgage and status
- by scope mortgage

### `collectionPlanEntries`
Planned additions or clarifications:
- `source = "admin_workout"` for workout-created future entries
- `workoutPlanId` so operators can inspect the active strategy origin
- optional workout action metadata if lineage needs more precision than `rescheduledFromId`

Deliberate design choice:
- preserve page-09 reschedule lineage for entry-to-entry replacement
- add workout ownership separately so workout state is not inferred indirectly from entry source alone

## Architecture

### Canonical Flow
Operator creates workout draft -> operator activates workout -> covered future plan entries are rewritten or created under workout ownership -> due runner later executes those entries through the existing page-03 spine -> retry applies to the executed workout-owned entry if needed

### Integration Strategy
Two seams need to become workout-aware:
- existing future `planned` entries already generated for covered obligations
- future scheduling decisions made after workout activation

Recommended first-version behavior:
1. Activation rewrites existing covered future `planned` entries into workout-owned replacements.
2. Initial scheduling / schedule-rule evaluation consults active workouts and avoids creating competing default-schedule entries for covered obligations.

This keeps strategy explicit without requiring the mortgage or obligation machines to know about workout state.

### Precedence Rules to Lock
- Active workout takes precedence over default schedule generation for covered obligations.
- Retry still applies after execution failure of a workout-owned entry and links from the executed entry, not the superseded default entry.
- Manual reschedule of a workout-owned entry should be explicit:
  - simplest first-version rule is either reject it or preserve `workoutPlanId`
  - whichever choice ships must be encoded and tested, not left implicit
- Late-fee behavior remains obligation-driven unless page-10 explicitly introduces a workout-controlled fee override. Default assumption: no fee override in first version.

### Component Structure
- new workout domain module under `convex/payments/collectionPlan/`
  - contract/types
  - lifecycle helpers
  - rewrite/activation orchestration
  - inspection queries
- `schema.ts`
  - new table plus plan-entry linkage fields/source values
- `initialScheduling.ts` and/or `scheduleRule.ts`
  - consult active workout ownership before creating default-schedule entries
- `reschedule.ts`
  - verify interaction rules for workout-owned entries
- `runner.ts` / `execution.ts`
  - likely minimal changes if workout only affects which future entries exist

### API Surface

#### Reads (Queries/GET)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `getWorkoutPlan` | `workoutPlanId` | workout plan + linked entry summary | Operator inspection |
| `listWorkoutPlansForMortgage` | `mortgageId` | workout plans | Current/history view |
| minimal plan-entry/workout join query | mortgage or entry id | current workout ownership | Support later page-12/page-13 surfaces |

#### Writes (Mutations/POST)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `createWorkoutPlan` | scope + strategy + reason | draft plan | Create a governed draft |
| `activateWorkoutPlan` | plan id | activation result | Canonical strategy activation seam |
| `updateWorkoutPlan` | mutable draft/suspended fields | updated plan | Controlled modification |
| `suspendWorkoutPlan` / `completeWorkoutPlan` / `cancelWorkoutPlan` | plan id + reason | updated lifecycle state | Governed exit paths |

#### Side Effects (Actions/Jobs)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| activation rewrite helper | plan id | plan-entry rewrite summary | Replaces/supersedes covered future entries |
| schedule-rule or initial-scheduling overlay | mortgage / obligations | normal scheduling result | Prevents competing default entries while workout is active |

## Implementation Decisions
- Prefer an explicit `workoutPlans` domain object over a rule-only implementation.
- Keep workout admin-focused in page 10 and defer full operator UI to page 12 / page 13 unless the code forces a minimal query surface earlier.
- Preserve obligation truth and mortgage lifecycle boundaries as hard invariants.
- Use explicit precedence rules for interaction with reschedule and retry.
- Keep page-03 execution mostly unchanged by making workout decide which future entries exist, not how execution itself works.

## Risks & Open Points
- The exact first-version scope should be locked early:
  - mortgage-wide only is simpler
  - obligation-set scope is more flexible but raises precedence complexity
- Interaction with page-09 reschedule must be explicit to avoid two strategy features both trying to own the same future entry.
- GitNexus is still unreliable on some collection-plan handler exports in this index, so shared-risk edits should again be compensated with focused regression coverage and final diff review.
