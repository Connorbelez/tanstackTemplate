import type { GenericSchema, SchemaDefinition } from "convex/server";
import auditLogTest from "convex-audit-log/test";
import type { TestConvex } from "convex-test";

export function registerAuditLogComponent(
	t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
	name = "auditLog"
) {
	auditLogTest.register(t, name);
}
