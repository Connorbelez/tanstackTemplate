# 07. Expand Collection Rule Model and Complete Retry/Late-Fee Behaviors — Design

> Derived from: https://www.notion.so/337fc1b440248176af0ec126b8aac764

## Types & Interfaces

### Proposed Rule Envelope
```ts
type CollectionRuleKind =
	| "schedule"
	| "retry"
	| "late_fee"
	| "balance_pre_check"
	| "reschedule_policy"
	| "workout_policy";

type CollectionRuleStatus = "draft" | "active" | "disabled" | "archived";

type CollectionRuleScope =
	| { scopeType: "global" }
	| { scopeType: "mortgage"; mortgageId: Id<"mortgages"> };

type ScheduleRuleConfig = {
	kind: "schedule";
	delayDays: number;
};

type RetryRuleConfig = {
	kind: "retry";
	maxRetries: number;
	backoffBaseDays: number;
};

type LateFeeRuleConfig = {
	kind: "late_fee";
	feeCode: "late_fee";
	feeSurface: "borrower_charge";
};

type FutureRuleConfig =
	| { kind: "balance_pre_check"; mode: "placeholder" }
	| { kind: "reschedule_policy"; mode: "placeholder" }
	| { kind: "workout_policy"; mode: "placeholder" };

type CollectionRuleConfig =
	| ScheduleRuleConfig
	| RetryRuleConfig
	| LateFeeRuleConfig
	| FutureRuleConfig;

type CollectionRuleRecord = {
	kind: CollectionRuleKind;
	trigger: "schedule" | "event";
	status: CollectionRuleStatus;
	code: string;
	displayName: string;
	description?: string;
	scope: CollectionRuleScope;
	priority: number;
	version: number;
	effectiveFrom?: number;
	effectiveTo?: number;
	config: CollectionRuleConfig;
	createdAt: number;
	updatedAt: number;
	createdByActorId?: string;
	updatedByActorId?: string;
};
```

### Current-to-Target Mapping
- `name` becomes a compatibility slug or seed code, not the dispatch key
- `enabled` folds into typed `status`
- `parameters` is replaced by a typed `config` union
- `action` and freeform `condition` should not remain the primary engine contract

## Database Schema

### `collectionRules`
Current repo shape in `convex/schema.ts` is too generic:
- `name`
- `trigger`
- `condition`
- `action`
- `parameters`
- `priority`
- `enabled`

Planned page-07 direction:
- add typed fields for `kind`, `status`, `code`, `displayName`, `scope`, `version`, `effectiveFrom`, `effectiveTo`
- replace freeform `parameters` with a typed `config` validator
- keep migration/compatibility only as long as needed for seeds/tests and current dev data
- add indexes that support deterministic active-rule lookup by trigger and ordering metadata

Potential index direction:
- `by_trigger_status_priority` or equivalent active-rule lookup index
- optional scope-aware indexes if mortgage-scoped rules are introduced in the same pass

## Architecture

### Data Flow
Trigger input -> `evaluateRules` -> active typed rule query -> rule matching/filter helpers -> typed handler registry -> schedule/retry/late-fee side effects

### Component Structure
- No route/component work is expected in page 07
- Admin-readable metadata is added to the backend model now so page 12 can expose it later

### API Surface

#### Reads (Queries/GET)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `getEnabledRules` | trigger + possibly scope/asOf | typed active rules | Canonical active-rule selection with deterministic ordering |
| `getRetryEntryForPlanEntry` | `planEntryId` | existing retry entry or null | Retry idempotency guard |

#### Writes (Mutations/POST)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `seedCollectionRules` | none | created/skipped summary | Seeds canonical typed defaults idempotently |
| `createEntry` / `scheduleInitialEntries` | existing args | existing results | Downstream write seams preserved while rules become typed |
| obligation creation mutation | existing args | obligation id | Late-fee behavior remains downstream of typed rule dispatch |

#### Side Effects (Actions/Jobs)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `evaluateRules` | trigger + context | void | Loads active typed rules and dispatches by explicit kind |
| `scheduleRuleHandler.evaluate` | rule + mortgage context | void | Creates initial plan entries from typed schedule config |
| `retryRuleHandler.evaluate` | rule + failure payload | void | Creates retry entries from typed retry config |
| `lateFeeRuleHandler.evaluate` | rule + overdue payload | void | Creates late-fee obligations using typed rule config plus mortgage fee config |

### Routing
- None expected for page 07

## Implementation Decisions
- Preserve current business behavior even if the internal rule representation changes aggressively.
- Keep late-fee economic configuration in `mortgageFees` for now. Page 07 should type the collection-rule strategy boundary, not duplicate the fee product model.
- Prefer one typed rule contract used by schema, seeds, handlers, tests, and future admin surfaces.
- Use engine dispatch keyed by explicit `kind`, not by `name`.
- Keep page-07 scope backend-only unless code inspection proves page-12-like admin endpoints are required earlier.
- GitNexus did not resolve the handler exports cleanly in the current index, so implementation should rely on focused diff review plus regression tests around the engine, schema, seed helpers, and rule handlers.
