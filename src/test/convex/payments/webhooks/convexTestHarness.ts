import { readdirSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import aggregateSchema from "../../../../../node_modules/@convex-dev/aggregate/dist/component/schema.js";
import auditLogSchema from "../../../../../node_modules/convex-audit-log/dist/component/schema.js";
import auditTrailSchema from "../../../../../convex/components/auditTrail/schema";
import schema from "../../../../../convex/schema";

type ConvexModuleLoader = () => Promise<unknown>;

function compareModuleKeys(a: string, b: string) {
	const aIsRootGenerated = a.startsWith("/convex/_generated/");
	const bIsRootGenerated = b.startsWith("/convex/_generated/");

	if (aIsRootGenerated !== bIsRootGenerated) {
		return aIsRootGenerated ? -1 : 1;
	}

	return a.localeCompare(b);
}

function loadModulesFromRoot(root: URL, mountPrefix: string) {
	const moduleEntries: [string, ConvexModuleLoader][] = [];

	const walk = (dir: URL, relativePath: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const nextRelativePath = relativePath
				? `${relativePath}/${entry.name}`
				: entry.name;
			const nextUrl = new URL(
				`${entry.name}${entry.isDirectory() ? "/" : ""}`,
				dir
			);

			if (entry.isDirectory()) {
				if (entry.name === "__tests__") {
					continue;
				}
				walk(nextUrl, nextRelativePath);
				continue;
			}

			if (!(entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
				continue;
			}

			// Skip declaration files — they aren't executable modules
			if (entry.name.endsWith(".d.ts")) {
				continue;
			}

			const moduleKey = join(mountPrefix, nextRelativePath).replaceAll(
				"\\",
				"/"
			);
			moduleEntries.push([
				moduleKey,
				() => import(nextUrl.href),
			]);
		}
	};

	walk(root, "");

	return Object.fromEntries(
		moduleEntries.sort(([leftKey], [rightKey]) =>
			compareModuleKeys(leftKey, rightKey)
		)
	);
}

function loadConvexModules() {
	return loadModulesFromRoot(
		new URL("../../../../../convex/", import.meta.url),
		"/convex"
	);
}

function loadAuditTrailModules() {
	return loadModulesFromRoot(
		new URL("../../../../../convex/components/auditTrail/", import.meta.url),
		"/convex/components/auditTrail"
	);
}

function loadAuditLogModules() {
	return loadModulesFromRoot(
		new URL(
			"../../../../../node_modules/convex-audit-log/dist/component/",
			import.meta.url
		),
		"/node_modules/convex-audit-log/dist/component"
	);
}

function loadAggregateModules() {
	return loadModulesFromRoot(
		new URL(
			"../../../../../node_modules/@convex-dev/aggregate/dist/component/",
			import.meta.url
		),
		"/node_modules/@convex-dev/aggregate/dist/component"
	);
}

export function createWebhookTestHarness() {
	process.env.DISABLE_GT_HASHCHAIN = "true";
	process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";

	const t = convexTest(schema, loadConvexModules());
	t.registerComponent("auditLog", auditLogSchema, loadAuditLogModules());
	t.registerComponent(
		"auditLog/aggregateBySeverity",
		aggregateSchema,
		loadAggregateModules()
	);
	t.registerComponent(
		"auditLog/aggregateByAction",
		aggregateSchema,
		loadAggregateModules()
	);
	t.registerComponent("auditTrail", auditTrailSchema, loadAuditTrailModules());
	return t;
}
