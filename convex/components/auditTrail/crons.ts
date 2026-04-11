import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Outbox processor: polls pending audit events every 60 seconds
crons.interval(
	"audit-outbox-processor",
	{ seconds: 60 },
	internal.internal.processOutbox
);

// Retention archival: runs daily at midnight UTC
crons.daily(
	"audit-retention-cleanup",
	{ hourUTC: 0, minuteUTC: 0 },
	internal.internal.processRetention
);

export default crons;
