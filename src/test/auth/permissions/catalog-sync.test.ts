import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	ALL_PERMISSION_SLUGS,
	WORKOS_PERMISSION_SLUGS,
} from "../../../../convex/auth/permissionCatalog";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../");
const RUNTIME_DIRECTORIES = [
	path.join(REPO_ROOT, "convex"),
	path.join(REPO_ROOT, "src"),
];
const SKIPPED_PATH_SEGMENTS = [
	`${path.sep}_generated${path.sep}`,
	`${path.sep}dist${path.sep}`,
	`${path.sep}node_modules${path.sep}`,
	`${path.sep}coverage${path.sep}`,
	`${path.sep}convex${path.sep}demo${path.sep}`,
];
const SKIPPED_FILES = new Set([
	path.join(REPO_ROOT, "convex", "auth", "permissionCatalog.ts"),
]);

async function walkFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(root, entry.name);
		if (
			SKIPPED_FILES.has(fullPath) ||
			SKIPPED_PATH_SEGMENTS.some((segment) => fullPath.includes(segment))
		) {
			continue;
		}

		if (entry.isDirectory()) {
			files.push(...(await walkFiles(fullPath)));
			continue;
		}

		if (entry.isFile() && /\.(ts|tsx|js|jsx|mts|cts)$/.test(entry.name)) {
			files.push(fullPath);
		}
	}

	return files;
}

function extractPermissionStrings(source: string): string[] {
	const matches = new Set<string>();
	const singlePermissionPatterns = [
		/requirePermission(?:Action)?\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
		/guardPermission\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
		/permissions\.has\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
		/hasPermissionGrant\(\s*[^,]+,\s*["'`]([^"'`]+)["'`]\s*\)/g,
	];

	for (const pattern of singlePermissionPatterns) {
		for (const match of source.matchAll(pattern)) {
			matches.add(match[1]);
		}
	}

	for (const match of source.matchAll(/guardAnyPermission\(\s*\[([\s\S]*?)\]\s*\)/g)) {
		for (const permissionMatch of match[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
			matches.add(permissionMatch[1]);
		}
	}

	return [...matches];
}

async function collectRuntimePermissions() {
	const runtimePermissions = new Map<string, string[]>();

	for (const directory of RUNTIME_DIRECTORIES) {
		for (const filePath of await walkFiles(directory)) {
			const source = await readFile(filePath, "utf8");
			const permissions = extractPermissionStrings(source);
			if (permissions.length === 0) {
				continue;
			}
			runtimePermissions.set(filePath, permissions);
		}
	}

	return runtimePermissions;
}

describe("permission catalog drift checks", () => {
	const catalogPermissions = new Set(ALL_PERMISSION_SLUGS);

	it("every runtime-enforced permission exists in the canonical catalog", async () => {
		const missing: string[] = [];
		const runtimePermissions = await collectRuntimePermissions();

		for (const [filePath, permissions] of runtimePermissions.entries()) {
			for (const permission of permissions) {
				if (!catalogPermissions.has(permission)) {
					missing.push(
						`${path.relative(REPO_ROOT, filePath)} -> ${permission}`
					);
				}
			}
		}

		expect(
			missing,
			`Runtime permission gates missing from canonical catalog:\n  ${missing.join("\n  ")}`
		).toEqual([]);
	});

	it("every WorkOS-exported permission exists in the canonical catalog", () => {
		const missing = WORKOS_PERMISSION_SLUGS.filter(
			(permission) => !catalogPermissions.has(permission)
		);

		expect(
			missing,
			`WorkOS-exported permissions missing from canonical catalog:\n  ${missing.join("\n  ")}`
		).toEqual([]);
	});
});
