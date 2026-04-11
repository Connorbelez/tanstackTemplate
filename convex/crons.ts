import { cronJobs, makeFunctionReference } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
const providerManagedSchedulePollingRef = makeFunctionReference<
	"action",
	{ asOf?: number; limit?: number },
	Promise<unknown>
>("payments/recurringSchedules/poller:pollProviderManagedSchedules");

// Audit trail crons (outbox processor + retention) are managed by the
// auditTrail component — see convex/components/auditTrail/crons.ts

// Daily reconciliation: verify entity status matches journal entries.
// Discrepancies are logged as P0 errors.
// Runs at 07:00 UTC (one hour after obligation transitions) to avoid
// reading mid-transition data — see Tech Design §7.1.
crons.daily(
	"daily reconciliation check",
	{ hourUTC: 7, minuteUTC: 0 },
	internal.engine.reconciliationAction.dailyReconciliation
);

// Daily obligation lifecycle: BECAME_DUE + GRACE_PERIOD_EXPIRED transitions.
// Runs at 6:00 UTC (1am ET) to advance obligations through their lifecycle.
crons.daily(
	"daily obligation transitions",
	{ hourUTC: 6, minuteUTC: 0 },
	internal.payments.obligations.crons.processObligationTransitions
);

// Collection plan execution spine: discover due planned entries and execute
// them through the canonical page-02 contract. Runs in bounded batches and
// relies on plan-entry consumption plus business-layer idempotency for replay
// safety across cron reruns.
crons.interval(
	"collection plan execution spine",
	{ minutes: 15 },
	internal.payments.collectionPlan.runner.processDuePlanEntries,
	{}
);

// Provider-managed schedule polling spine: keeps externally managed recurring
// schedules in sync, materializes missed webhooks, and never initiates draws
// itself. This runs alongside the app-owned execution spine and only polls
// schedules that have already been delegated to a provider-managed rail.
crons.interval(
	"provider-managed schedule polling spine",
	{ minutes: 15 },
	providerManagedSchedulePollingRef,
	{}
);

// Dispersal self-healing: detect settled obligations missing dispersal entries.
// Runs every 15 minutes to catch scheduler.runAfter(0) failures quickly.
// See Tech Design §6.4 and Integration Foot Gun I1.
crons.interval(
	"dispersal self-healing",
	{ minutes: 15 },
	internal.dispersal.selfHealing.dispersalSelfHealingCron
);

// Transfer reconciliation: detect confirmed transfers without journal entries.
// Runs every 15 minutes — highest-risk gap because publishTransferConfirmed
// runs async via scheduler.runAfter(0) and can fail silently.
// See ENG-165 and Tech Design §10.
crons.interval(
	"transfer reconciliation",
	{ minutes: 15 },
	internal.payments.cashLedger.transferReconciliationCron
		.transferReconciliationCron
);

// Cash ledger reconciliation: verify ledger invariants (unapplied cash,
// negative payables, obligation drift, conservation, etc.).
// Runs at 07:15 UTC — 15 minutes after entity reconciliation — to avoid
// overlapping with the 07:00 entity status check.
crons.daily(
	"cash ledger reconciliation",
	{ hourUTC: 7, minuteUTC: 15 },
	internal.payments.cashLedger.reconciliationCron.cashLedgerReconciliation
);

// Lender payout scheduling: evaluates lender frequency thresholds
// and batches payout execution for eligible dispersal entries.
// Runs at 08:00 UTC (after reconciliation completes at 07:15).
// See Tech Design OQ-8 and ENG-182.
crons.daily(
	"lender payout batch",
	{ hourUTC: 8, minuteUTC: 0 },
	internal.payments.payout.batchPayout.processPayoutBatch
);

// Disbursement due alert: surface pending entries past hold period.
// Admin-only trigger in Phase 1 — does NOT auto-execute disbursements.
// Runs at 09:00 UTC (after payout batch at 08:00).
crons.daily(
	"check disbursements due",
	{ hourUTC: 9, minuteUTC: 0 },
	internal.dispersal.disbursementBridge.checkDisbursementsDue
);

export default crons;
