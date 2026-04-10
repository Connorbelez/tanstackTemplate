# 09. Implement Borrower Reschedule Capability — Design

> Derived from: https://www.notion.so/337fc1b44024814f9c99ff923baa8ae7

## Types & Interfaces

### Proposed Command Contract
```ts
type ReschedulePlanEntryCommand = {
	planEntryId: Id<"collectionPlanEntries">;
	newScheduledDate: number;
	reason: string;
	requestedByUserId?: Id<"users">;
	requestedByRole: "admin" | "borrower" | "system";
	source: "admin_reschedule";
};

type ReschedulePlanEntryResult =
	| {
			status: "rescheduled";
			originalPlanEntryId: Id<"collectionPlanEntries">;
			replacementPlanEntryId: Id<"collectionPlanEntries">;
	  }
	| {
			status: "rejected";
			reason:
				| "not_found"
				| "not_reschedulable"
				| "already_executing"
				| "already_terminal"
				| "already_rescheduled"
				| "invalid_date";
	  };
```

### Proposed Entry Metadata Shape
```ts
type PlanEntryRescheduleMetadata = {
	rescheduleReason: string;
	rescheduledAt: number;
	rescheduledByRole: "admin" | "borrower" | "system";
	rescheduledByUserId?: Id<"users">;
};
```

## Database Schema

### `collectionPlanEntries`
Existing repo scaffolding:
- `status` already supports `"rescheduled"`
- `rescheduledFromId` already exists
- `by_rescheduled_from` index already exists

Planned page-09 additions or clarifications:
- extend `source` to include a canonical reschedule-created source such as `"admin_reschedule"`
- add explicit reschedule attribution metadata if audit trail alone is not sufficient for operator inspection
- preserve the original entry row and mark it `rescheduled`
- create exactly one replacement `planned` row linked to the original via `rescheduledFromId`

Deliberate design choice:
- prefer lineage over in-place mutation
- avoid a separate reschedule table unless later operator surfaces prove the entry-level metadata plus audit trail is insufficient

## Architecture

### Canonical Flow
Operator/admin reschedule request -> eligibility guard -> original entry patched to `rescheduled` -> replacement `planned` entry created -> lineage persisted -> due runner later executes replacement entry

### Eligibility Model
Entry is reschedulable only when:
- it exists
- it is still `planned`
- it is scheduled for the future or otherwise still safely strategy-owned
- it has not already been replaced by a prior reschedule
- it is not already bound to live execution state in a way that would create ambiguity

Planned explicit rejection cases:
- `executing`
- `completed`
- `cancelled`
- `rescheduled`
- replacement already exists
- invalid replacement date
- any execution linkage that indicates the entry is no longer strategy-only

### Component Structure
- `convex/payments/collectionPlan/`
  - new reschedule contract/helper module for eligibility and lineage creation
  - mutation entrypoint for the governed reschedule command
- `mutations.ts`
  - likely home for the first canonical mutation unless a dedicated module is cleaner
- `queries.ts`
  - may need small inspection helpers for operator/admin views and lineage lookup
- `executionGuards.ts` / `execution.ts`
  - confirm rescheduled originals remain ineligible and replacement entries remain normal execution targets
- `rules/retryRule.ts`
  - confirm retries attach to the executed replacement entry and do not conflict with reschedule lineage

### API Surface

#### Reads (Queries/GET)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `getPlanEntryById` or existing query reuse | `planEntryId` | entry + lineage metadata | Verify operator-facing inspectability if needed |
| lineage helper | `planEntryId` | replacement or original linkage | Minimal support for audit/review use cases |

#### Writes (Mutations/POST)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `reschedulePlanEntry` | command | typed result | Canonical governed reschedule command |

#### Side Effects (Actions/Jobs)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `executePlanEntry` | execution command | typed result | Must keep original rescheduled entries ineligible and allow replacement entries to execute normally |
| `processDuePlanEntries` | due-runner batch | summary | Should naturally skip superseded originals because they are no longer `planned` |

## Implementation Decisions
- Ship an admin-governed first version, but shape the command contract so borrower channels can reuse it later.
- Use lineage and replacement entry creation instead of editing a live plan entry in place.
- Keep obligation truth untouched; reschedule is a collection-strategy operation only.
- Reject in-flight or ambiguous execution states instead of trying to heal them inside the reschedule command.
- Prefer one canonical reschedule-created `source` value for clarity rather than overloading `admin`.
- Use backend integration tests rather than browser e2e unless code review proves page 09 cannot satisfy acceptance without UI work.

## Risks & Open Points
- The repo already has a placeholder `reschedule_policy` rule kind, but page 09 may not need to activate rule-based automatic rescheduling yet; the first delivery can stay command-driven.
- The right source taxonomy needs care:
  - `"admin_reschedule"` is explicit for first delivery
  - `"borrower_reschedule"` may be better later when a borrower surface exists
  - if both are needed eventually, the entry source and actor role should stay separable
- If current audit infrastructure already captures enough operator context, extra schema fields should stay minimal to avoid duplication.
- GitNexus has been unreliable on some AMPS handler exports in the current index, so shared-surface edits should be compensated with focused regression coverage.
