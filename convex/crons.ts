import { cronJobs } from "convex/server";

const crons = cronJobs();

// Audit trail crons (outbox processor + retention) are managed by the
// auditTrail component — see convex/components/auditTrail/crons.ts

export default crons;
