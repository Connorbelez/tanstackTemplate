import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../..");
const convexRoot = path.join(repoRoot, "convex");

function collectFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const absolutePath = path.join(dir, entry);
		const stats = statSync(absolutePath);
		if (stats.isDirectory()) {
			return collectFiles(absolutePath);
		}
		return absolutePath.endsWith(".ts") ? [absolutePath] : [];
	});
}

function toRepoPath(absolutePath: string) {
	return path.relative(repoRoot, absolutePath).replaceAll(path.sep, "/");
}

const productBackendFiles = collectFiles(convexRoot)
	.map(toRepoPath)
	.filter(
		(relativePath) =>
			!relativePath.startsWith("convex/_generated/") &&
			!relativePath.includes("/__tests__/") &&
			!relativePath.startsWith("convex/demo/") &&
			!relativePath.startsWith("convex/test/")
	);

describe("backend auth architecture", () => {
	it("keeps resourceChecks imports behind the centralized authz layer", () => {
		const allowedImporters = new Set([
			"convex/auth/resourceChecks.ts",
			"convex/authz/resourceAccess.ts",
		]);

		const offenders = productBackendFiles.filter((relativePath) => {
			if (allowedImporters.has(relativePath)) {
				return false;
			}
			const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
			return source.includes("auth/resourceChecks");
		});

		expect(offenders).toEqual([]);
	});

	it("forbids local assert*Access helpers outside approved authz modules", () => {
		const allowedFiles = new Set([
			"convex/auth/resourceChecks.ts",
			"convex/authz/crm.ts",
			"convex/authz/orgScope.ts",
			"convex/authz/origination.ts",
			"convex/authz/resourceAccess.ts",
		]);

		const localAssertPattern = /\b(?:async\s+)?function\s+assert[A-Z]\w*Access\b/;
		const offenders = productBackendFiles.filter((relativePath) => {
			if (allowedFiles.has(relativePath)) {
				return false;
			}
			const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
			return localAssertPattern.test(source);
		});

		expect(offenders).toEqual([]);
	});
});
