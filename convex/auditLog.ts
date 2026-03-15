import { AuditLog } from "convex-audit-log";
import { components } from "./_generated/api";

export const auditLog = new AuditLog(components.auditLog, {
	piiFields: [
		"email",
		"phone",
		"ssn",
		"password",
		"phoneNumber",
		"borrowerEmail",
		"borrowerPhone",
		"borrowerSsn",
	],
});
