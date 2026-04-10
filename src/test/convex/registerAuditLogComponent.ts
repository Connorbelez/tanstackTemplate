import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { TestConvex } from "convex-test";
import aggregateSchema from "../../../node_modules/@convex-dev/aggregate/dist/component/schema.js";
import auditLogSchema from "../../../node_modules/convex-audit-log/dist/component/schema.js";

type ConvexModuleLoader = () => Promise<unknown>;

function compareModuleKeys(a: string, b: string) {
	const aIsRootGenerated = a.startsWith("/convex/_generated/");
	const bIsRootGenerated = b.startsWith("/convex/_generated/");

	if (aIsRootGenerated !== bIsRootGenerated) {
		return aIsRootGenerated ? -1 : 1;
	}

	return a.localeCompare(b);
}

function createModuleMap(moduleEntries: [string, ConvexModuleLoader][]) {
	return Object.fromEntries(
		moduleEntries.sort(([leftKey], [rightKey]) =>
			compareModuleKeys(leftKey, rightKey)
		)
	);
}

function createComponentModuleEntries(
	mountPrefix: string,
	modulePaths: string[],
	baseRelativePath: string
) {
	const moduleEntries: [string, ConvexModuleLoader][] = [];

	for (const modulePath of modulePaths) {
		const moduleKey = `${mountPrefix}/${modulePath}`;
		moduleEntries.push([
			moduleKey,
			() => import(`${baseRelativePath}/${modulePath}`),
		]);
	}

	return createModuleMap(moduleEntries);
}

function loadAuditLogModules() {
	return createComponentModuleEntries(
		"/node_modules/convex-audit-log/dist/component",
		[
			"_generated/api.js",
			"_generated/component.js",
			"_generated/dataModel.js",
			"_generated/server.js",
			"aggregates.js",
			"convex.config.js",
			"lib.js",
			"schema.js",
			"shared.js",
		],
		"../../../node_modules/convex-audit-log/dist/component"
	);
}

function loadAggregateModules() {
	return createComponentModuleEntries(
		"/node_modules/@convex-dev/aggregate/dist/component",
		[
			"_generated/api.js",
			"_generated/component.js",
			"_generated/dataModel.js",
			"_generated/server.js",
			"arbitrary.helpers.js",
			"btree.js",
			"compare.js",
			"convex.config.js",
			"inspect.js",
			"public.js",
			"schema.js",
		],
		"../../../node_modules/@convex-dev/aggregate/dist/component"
	);
}

export function registerAuditLogComponent(
	t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
	name = "auditLog"
) {
	t.registerComponent(name, auditLogSchema, loadAuditLogModules());
	t.registerComponent(
		`${name}/aggregateBySeverity`,
		aggregateSchema,
		loadAggregateModules()
	);
	t.registerComponent(
		`${name}/aggregateByAction`,
		aggregateSchema,
		loadAggregateModules()
	);
}
