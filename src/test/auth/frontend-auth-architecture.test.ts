import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../..");
const srcRoot = path.join(repoRoot, "src");

function collectFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const absolutePath = path.join(dir, entry);
		const stats = statSync(absolutePath);
		if (stats.isDirectory()) {
			return collectFiles(absolutePath);
		}
		return absolutePath.endsWith(".ts") || absolutePath.endsWith(".tsx")
			? [absolutePath]
			: [];
	});
}

function toRepoPath(absolutePath: string) {
	return path.relative(repoRoot, absolutePath).replaceAll(path.sep, "/");
}

const productFrontendFiles = collectFiles(srcRoot)
	.map(toRepoPath)
	.filter(
		(relativePath) =>
			!relativePath.startsWith("src/test/") &&
			!relativePath.startsWith("src/routes/demo/") &&
			!relativePath.startsWith("src/routes/e2e/") &&
			!relativePath.startsWith("src/components/demo/")
	);

describe("frontend auth architecture", () => {
	it("keeps raw WorkOS useAuth confined to approved wrappers and session UI", () => {
		const allowedFiles = new Set([
			"src/components/workos-user.tsx",
			"src/hooks/use-app-auth.ts",
			"src/hooks/use-user.tsx",
			"src/router.tsx",
			"src/routes/sign-out.tsx",
		]);

		const offenders = productFrontendFiles.filter((relativePath) => {
			if (allowedFiles.has(relativePath)) {
				return false;
			}
			const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
			return source.includes("useAuth(");
		});

		expect(offenders).toEqual([]);
	});

	it("requires product routes to use the shared route registry instead of legacy guards", () => {
		const routeFiles = productFrontendFiles.filter((relativePath) =>
			relativePath.startsWith("src/routes/")
		);
		const legacyGuardPattern =
			/\bguardPermission\(|\bguardAnyPermission\(|\bguardFairLendAdmin\(|\bguardFairLendAdminWithPermission\(|\bguardOperationalAdminPermission\(/;
		const offenders = routeFiles.filter((relativePath) => {
			const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
			return legacyGuardPattern.test(source);
		});

		expect(offenders).toEqual([]);
	});

	it("prevents product components and routes from depending on legacy useCanDo", () => {
		const uiFiles = productFrontendFiles.filter(
			(relativePath) =>
				relativePath.startsWith("src/components/") ||
				relativePath.startsWith("src/routes/")
		);
		const offenders = uiFiles.filter((relativePath) => {
			const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
			return source.includes("useCanDo(");
		});

		expect(offenders).toEqual([]);
	});

	it("keeps direct permission and role evaluation inside the shared auth facade", () => {
		const allowedFiles = new Set(["src/lib/auth.ts", "src/lib/auth-policy.ts"]);
		const authDecisionPattern =
			/\bhasPermission\(|\bhasAnyPermission\(|permissions\.includes\(|\bisFairLendStaffAdmin\(/;
		const offenders = productFrontendFiles.filter((relativePath) => {
			if (allowedFiles.has(relativePath)) {
				return false;
			}
			const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
			return authDecisionPattern.test(source);
		});

		expect(offenders).toEqual([]);
	});
});
