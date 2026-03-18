import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Audit trail crons (outbox processor + retention) are managed by the
// auditTrail component — see convex/components/auditTrail/crons.ts

// Daily reconciliation: verify entity status matches journal entries.
// Discrepancies are logged as P0 errors.
crons.daily(
	"daily reconciliation check",
	{ hourUTC: 6, minuteUTC: 0 },
	internal.engine.reconciliationAction.dailyReconciliation
);

// Daily obligation lifecycle: BECAME_DUE + GRACE_PERIOD_EXPIRED transitions.
// Runs at 6:00 UTC (1am ET) to advance obligations through their lifecycle.
crons.daily(
	"daily obligation transitions",
	{ hourUTC: 6, minuteUTC: 0 },
	internal.payments.obligations.crons.processObligationTransitions
);

export default crons;
