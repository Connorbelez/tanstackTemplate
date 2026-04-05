# 08. Implement Balance Pre-Check Capability — Design

> Derived from: https://www.notion.so/337fc1b440248194a6e6dd923b82acc9

## Types & Interfaces

### Proposed Balance Rule Config
```ts
type BalancePreCheckDecision =
	| "proceed"
	| "defer"
	| "suppress"
	| "require_operator_review";

type BalancePreCheckReasonCode =
	| "no_recent_nsf_signal"
	| "recent_nsf_failure"
	| "recent_insufficient_funds_failure"
	| "rule_config_missing"
	| "manual_review_required";

type BalanceSignalSource =
	| "recent_transfer_failures"
	| "none";

type BalancePreCheckRuleConfig = {
	kind: "balance_pre_check";
	signalSource: BalanceSignalSource;
	lookbackDays: number;
	failureCountThreshold: number;
	blockingDecision: Exclude<BalancePreCheckDecision, "proceed">;
	deferDays?: number;
};

type BalancePreCheckSnapshot = {
	decision: BalancePreCheckDecision;
	reasonCode: BalancePreCheckReasonCode;
	reasonDetail?: string;
	evaluatedAt: number;
	ruleId?: Id<"collectionRules">;
	signalSource: BalanceSignalSource;
	blockedUntil?: number;
	operatorReviewRequired?: boolean;
};
```

### Execution Integration Shape
```ts
type ExecutionGateResult =
	| { decision: "proceed"; snapshot: BalancePreCheckSnapshot }
	| { decision: "defer"; snapshot: BalancePreCheckSnapshot }
	| { decision: "suppress"; snapshot: BalancePreCheckSnapshot }
	| { decision: "require_operator_review"; snapshot: BalancePreCheckSnapshot };
```

## Database Schema

### `collectionRules`
Current page-07 shape already supports a `balance_pre_check` kind, but its config is still:
- `{ kind: "balance_pre_check", mode: "placeholder" }`

Planned page-08 direction:
- replace placeholder config with a real typed decision contract
- keep future compatibility for richer signal sources
- preserve page-07 typed rule envelope as the only rule-model foundation

### `collectionPlanEntries`
Current repo shape is too thin for page 08:
- `scheduledDate`
- `status`
- `source`
- `ruleId`
- execution linkage fields only

Planned additions:
- one latest balance-pre-check snapshot on the plan entry
- fields to distinguish operator-visible gating from normal execution state
- `blockedUntil` or equivalent timing metadata so deferred entries stop re-triggering prematurely

Deliberate design choice:
- prefer one latest snapshot on `collectionPlanEntries` plus audit-log history
- avoid introducing a separate decision-history table unless later admin pages prove that the snapshot + audit trail is insufficient

## Architecture

### Decision Flow
Due plan entry -> execution guards -> balance pre-check evaluation -> snapshot persisted on plan entry -> proceed into attempt creation OR return structured `not_eligible`

### Signal Source Strategy
- First shipping signal source: recent transfer failure history for the borrower/counterparty, especially `failureCode = "NSF"` and `failureReason = "insufficient_funds"`
- This is repo-grounded and already persisted in `transferRequests`
- It remains a heuristic only; it does not become provider settlement truth
- External balance integrations can extend `signalSource` later without reopening the AMPS execution contract

### Component Structure
- `ruleContract.ts`
  - replace placeholder `BalancePreCheckRuleConfig`
- new balance pre-check module under `convex/payments/collectionPlan/`
  - pure decision helpers
  - signal loading helpers
  - snapshot builder
- `executionGuards.ts` / `execution.ts`
  - call the balance pre-check before attempt creation
  - persist snapshot and block execution when needed
- `queries.ts`
  - keep due-runner selection compatible with deferred and review-blocked entries

### API Surface

#### Reads (Queries/GET)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `getEnabledRules` | trigger + scope/asOf | typed active rules | Already exists; page 08 will let it return real `balance_pre_check` rules |
| `listRecentTransfersByCounterpartyInternal` or equivalent | borrower/counterparty + lookback | recent failure signal candidates | New/internal helper for page-08 signal evaluation |
| collection-plan inspection queries | TBD/minimal | plan entries with balance snapshot | Only if needed to satisfy operator-inspection acceptance without waiting for page 12 |

#### Writes (Mutations/POST)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| plan-entry snapshot patch helper | planEntryId + snapshot | updated row | Persists latest balance pre-check result |
| optional defer mutation helper | planEntryId + blockedUntil | updated row | Encodes defer semantics without creating an attempt |

#### Side Effects (Actions/Jobs)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `executePlanEntry` | execution command | typed result | Adds balance pre-check gating before attempt creation |
| `processDuePlanEntries` | due-runner batch | summary | Must naturally skip deferred/suppressed/review-blocked entries |

## Implementation Decisions
- Keep balance pre-check in AMPS execution eligibility, not in provider adapters or transfer validation.
- Use recent NSF / insufficient-funds transfer history as the first real signal source because the repo does not yet expose a richer bank-balance service.
- Store the latest gating snapshot on `collectionPlanEntries` and use audit logs for historical traceability.
- Prefer keeping blocked entries visible through explicit metadata over silently dropping them from AMPS.
- Do not mutate obligations, collection attempts, or transfer truth when the pre-check blocks execution.
- Avoid full admin UI work in page 08; persist the data so pages 12 and 13 can surface it cleanly.

## Risks & Open Points
- `collectionPlanEntries.status` currently has no dedicated deferred or blocked states. The implementation must choose between:
  - extending status values, or
  - keeping status stable and using explicit gate metadata plus due-query filtering
- GitNexus has not reliably resolved the shared execution symbols in the current index, so implementation must rely on focused regression coverage and final diff review.
- If recent NSF history proves too weak as a signal, page 08 should still ship the decision framework and leave richer data ingestion as an extension rather than baking in fake certainty.
