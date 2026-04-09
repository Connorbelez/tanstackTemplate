import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { TestConvex } from "convex-test";
import aggregateSchema from "../../node_modules/@convex-dev/aggregate/dist/component/schema.js";
import auditLogSchema from "../../node_modules/convex-audit-log/dist/component/schema.js";

const aggregateModules = {
	"/node_modules/@convex-dev/aggregate/dist/component/_generated/api.js":
		async () =>
			await import(
				"../../node_modules/@convex-dev/aggregate/dist/component/_generated/api.js"
			),
	"/node_modules/@convex-dev/aggregate/dist/component/_generated/component.js":
		async () =>
			await import(
				"../../node_modules/@convex-dev/aggregate/dist/component/_generated/component.js"
			),
	"/node_modules/@convex-dev/aggregate/dist/component/_generated/dataModel.js":
		async () =>
			await import(
				"../../node_modules/@convex-dev/aggregate/dist/component/_generated/dataModel.js"
			),
	"/node_modules/@convex-dev/aggregate/dist/component/_generated/server.js":
		async () =>
			await import(
				"../../node_modules/@convex-dev/aggregate/dist/component/_generated/server.js"
			),
	"/node_modules/@convex-dev/aggregate/dist/component/arbitrary.helpers.js":
		async () =>
			await import(
				"../../node_modules/@convex-dev/aggregate/dist/component/arbitrary.helpers.js"
			),
	"/node_modules/@convex-dev/aggregate/dist/component/btree.js": async () =>
		await import(
			"../../node_modules/@convex-dev/aggregate/dist/component/btree.js"
		),
	"/node_modules/@convex-dev/aggregate/dist/component/compare.js": async () =>
		await import(
			"../../node_modules/@convex-dev/aggregate/dist/component/compare.js"
		),
	"/node_modules/@convex-dev/aggregate/dist/component/convex.config.js":
		async () =>
			await import(
				"../../node_modules/@convex-dev/aggregate/dist/component/convex.config.js"
			),
	"/node_modules/@convex-dev/aggregate/dist/component/inspect.js": async () =>
		await import(
			"../../node_modules/@convex-dev/aggregate/dist/component/inspect.js"
		),
	"/node_modules/@convex-dev/aggregate/dist/component/public.js": async () =>
		await import(
			"../../node_modules/@convex-dev/aggregate/dist/component/public.js"
		),
	"/node_modules/@convex-dev/aggregate/dist/component/schema.js": async () =>
		await import(
			"../../node_modules/@convex-dev/aggregate/dist/component/schema.js"
		),
};

const auditLogModules = {
	"/node_modules/convex-audit-log/dist/component/_generated/api.js": async () =>
		await import(
			"../../node_modules/convex-audit-log/dist/component/_generated/api.js"
		),
	"/node_modules/convex-audit-log/dist/component/_generated/component.js":
		async () =>
			await import(
				"../../node_modules/convex-audit-log/dist/component/_generated/component.js"
			),
	"/node_modules/convex-audit-log/dist/component/_generated/dataModel.js":
		async () =>
			await import(
				"../../node_modules/convex-audit-log/dist/component/_generated/dataModel.js"
			),
	"/node_modules/convex-audit-log/dist/component/_generated/server.js":
		async () =>
			await import(
				"../../node_modules/convex-audit-log/dist/component/_generated/server.js"
			),
	"/node_modules/convex-audit-log/dist/component/aggregates.js": async () =>
		await import(
			"../../node_modules/convex-audit-log/dist/component/aggregates.js"
		),
	"/node_modules/convex-audit-log/dist/component/convex.config.js": async () =>
		await import(
			"../../node_modules/convex-audit-log/dist/component/convex.config.js"
		),
	"/node_modules/convex-audit-log/dist/component/lib.js": async () =>
		await import("../../node_modules/convex-audit-log/dist/component/lib.js"),
	"/node_modules/convex-audit-log/dist/component/schema.js": async () =>
		await import(
			"../../node_modules/convex-audit-log/dist/component/schema.js"
		),
	"/node_modules/convex-audit-log/dist/component/shared.js": async () =>
		await import(
			"../../node_modules/convex-audit-log/dist/component/shared.js"
		),
};

export function registerAuditLogComponent(
	t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
	name = "auditLog"
) {
	t.registerComponent(name, auditLogSchema, auditLogModules);
	t.registerComponent(
		`${name}/aggregateBySeverity`,
		aggregateSchema,
		aggregateModules
	);
	t.registerComponent(
		`${name}/aggregateByAction`,
		aggregateSchema,
		aggregateModules
	);
}
