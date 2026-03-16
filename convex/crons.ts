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
	// @ts-expect-error — resolves after `convex codegen` (new file not yet in generated API)
	internal.engine.reconciliationAction.dailyReconciliation
);

export default crons;
