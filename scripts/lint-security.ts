#!/usr/bin/env bun
/**
 * Security linting rules for the FairLend codebase.
 *
 * Rules:
 *   no-raw-convex-exports      error  Convex functions must use fluent-convex builders
 *   require-auth-gate           error  Public Convex functions must be auth-gated
 *   require-permission-gate     warn   Public Convex mutations should have permission checks
 *   require-route-guard         warn   Route layouts must have beforeLoad permission guards
 *
 * Suppression: Add `// lint-security-ignore: <rule>` on the preceding line.
 *
 * Usage:
 *   bun run scripts/lint-security.ts           # full run
 *   bun run scripts/lint-security.ts --quiet   # violations only, no summary
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename as getBasename, join, relative, resolve } from "node:path";

// ── Types ───────────────────────────────────────────────────────────────
interface Violation {
	file: string;
	line: number;
	message: string;
	rule: string;
	severity: "error" | "warn";
}

// ── Configuration ───────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dir, "..");
const CONVEX_DIR = join(ROOT, "convex");
const ROUTES_DIR = join(ROOT, "src", "routes");

/** Directories under convex/ to skip entirely. */
const CONVEX_EXCLUDED_DIRS = new Set([
	"_generated",
	"_componentDeps",
	"components",
	"node_modules",
]);

/** Convex file path patterns to skip (relative to project root). */
const CONVEX_EXCLUDED_PATTERNS = [
	/convex\/test\//,
	/convex\/http\.ts$/,
	/convex\/crons\.ts$/,
	/convex\/auth\.ts$/,
	/convex\/.*\/__tests__\//,
	/convex\/.*\.test\.ts$/,
	/convex\/.*\.integration\.test\.ts$/,
];

/**
 * Pre-configured fluent-convex chains that include auth middleware.
 * Source of truth: convex/fluent.ts reusable chains.
 */
const AUTH_GATED_CHAINS = new Set([
	"authedQuery",
	"authedMutation",
	"authedAction",
	"adminQuery",
	"adminMutation",
	"adminAction",
	"brokerQuery",
	"brokerMutation",
	"borrowerQuery",
	"borrowerMutation",
	"lenderQuery",
	"lenderMutation",
	"underwriterQuery",
	"underwriterMutation",
	"lawyerQuery",
	"lawyerMutation",
	"uwQuery",
	"uwMutation",
	"dealQuery",
	"dealMutation",
	"ledgerQuery",
	"ledgerMutation",
	"cashLedgerQuery",
	"cashLedgerMutation",
]);

/**
 * Chains that include a permission or admin-role check (not just auth).
 * `authedQuery`, `authedMutation`, `authedAction` are auth-only — they
 * verify identity but don't check WorkOS permissions.
 */
const PERMISSION_GATED_CHAINS = new Set([
	"adminQuery",
	"adminMutation",
	"adminAction",
	"brokerQuery",
	"brokerMutation",
	"borrowerQuery",
	"borrowerMutation",
	"lenderQuery",
	"lenderMutation",
	"underwriterQuery",
	"underwriterMutation",
	"lawyerQuery",
	"lawyerMutation",
	"uwQuery",
	"uwMutation",
	"dealQuery",
	"dealMutation",
	"ledgerQuery",
	"ledgerMutation",
	"cashLedgerQuery",
	"cashLedgerMutation",
]);

/** Route filenames that are exempt from guard requirements (auth-flow pages, public). */
const ROUTE_GUARD_EXEMPT = new Set([
	"__root.tsx",
	"sign-in.tsx",
	"sign-up.tsx",
	"sign-out.tsx",
	"callback.tsx",
	"unauthorized.tsx",
	"about.tsx",
]);

// ── Top-level regex constants ────────────────────────────────────────────
const RE_BUILDER_EXTRACT = /=\s*(\w+)/;
const RE_EXPORT_CONST = /^export\s+const\s+\w+\s*=/;
const RE_EXPORT_NAME = /export\s+const\s+(\w+)/;
const RE_RAW_CONVEX_EXPORT =
	/export\s+(?:const|function)\s+\w+\s*=\s*(?:mutation|query|action)\s*\(/;
const RE_RAW_CONVEX_NAME = /export\s+(?:const|function)\s+(\w+)/;
const RE_LOCAL_CHAIN = /(?:^|\s)const\s+(\w+)\s*=\s*(\w+)(?:\s*\.|;|\s*$)/;
const RE_NEW_DECLARATION = /^\s*(?:const|export)\s/;

// ── File discovery ──────────────────────────────────────────────────────

function walkDir(dir: string, ext: string): string[] {
	const results: string[] = [];
	if (!existsSync(dir)) {
		return results;
	}

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (CONVEX_EXCLUDED_DIRS.has(entry.name)) {
				continue;
			}
			results.push(...walkDir(join(dir, entry.name), ext));
		} else if (entry.name.endsWith(ext)) {
			results.push(join(dir, entry.name));
		}
	}
	return results;
}

function isConvexExcluded(filePath: string): boolean {
	const rel = relative(ROOT, filePath);
	return CONVEX_EXCLUDED_PATTERNS.some((p) => p.test(rel));
}

// ── Helpers ─────────────────────────────────────────────────────────────

function isSuppressed(
	lines: string[],
	lineIndex: number,
	rule: string
): boolean {
	if (lineIndex <= 0) {
		return false;
	}
	const prev = lines[lineIndex - 1] ?? "";
	const current = lines[lineIndex] ?? "";
	const suppressPattern = `lint-security-ignore: ${rule}`;
	const suppressAll = "lint-security-ignore: all";
	return (
		prev.includes(suppressPattern) ||
		prev.includes(suppressAll) ||
		current.includes(suppressPattern) ||
		current.includes(suppressAll)
	);
}

/** Extracts the first identifier after `= ` on a line (the builder/chain name). */
function extractBuilder(line: string): string | null {
	const match = line.match(RE_BUILDER_EXTRACT);
	return match?.[1] ?? null;
}

// ── Convex file analysis ────────────────────────────────────────────────

/**
 * Splits a file into "export blocks" — contiguous regions starting at each
 * `export const` line and ending before the next export or EOF.
 */
interface ExportBlock {
	builder: string;
	fullText: string;
	name: string;
	startLine: number;
}

function findExportBlocks(lines: string[]): ExportBlock[] {
	const blocks: ExportBlock[] = [];
	const exportStarts: number[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (RE_EXPORT_CONST.test(lines[i] ?? "")) {
			exportStarts.push(i);
		}
	}

	for (let idx = 0; idx < exportStarts.length; idx++) {
		const start = exportStarts[idx] ?? 0;
		const end = exportStarts[idx + 1] ?? lines.length;
		const text = lines.slice(start, end).join("\n");
		const startLine = lines[start] ?? "";
		const nameMatch = startLine.match(RE_EXPORT_NAME);
		const builder = extractBuilder(startLine);
		const name = nameMatch?.[1];

		if (name && builder) {
			blocks.push({
				name,
				startLine: start,
				builder,
				fullText: text,
			});
		}
	}

	return blocks;
}

/**
 * Builds a map of local chain variable names → whether they include
 * permission/admin gates. Handles patterns like:
 *   const docGenMutation = authedMutation.use(requirePermission("document:generate"));
 */
interface LocalChainInfo {
	hasAuth: boolean;
	hasPermission: boolean;
}

function buildLocalChainMap(lines: string[]): Map<string, LocalChainInfo> {
	const map = new Map<string, LocalChainInfo>();

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";

		// Match: const varName = someChain (with optional .use(...))
		const match = line.match(RE_LOCAL_CHAIN);
		if (!match) {
			continue;
		}

		const [, varName, baseChain] = match;
		if (!(varName && baseChain)) {
			continue;
		}

		// Skip if it's an export (those are handled separately)
		if (line.trimStart().startsWith("export")) {
			continue;
		}

		// Collect the full statement (may span multiple lines until `;` or new declaration)
		let fullStatement = line;
		for (let j = i + 1; j < lines.length; j++) {
			const nextLine = lines[j] ?? "";
			if (nextLine.includes(";")) {
				fullStatement += nextLine;
				break;
			}
			// Stop at a new const or export declaration (next statement)
			if (RE_NEW_DECLARATION.test(nextLine)) {
				break;
			}
			fullStatement += nextLine;
		}

		const hasAuth =
			AUTH_GATED_CHAINS.has(baseChain) ||
			PERMISSION_GATED_CHAINS.has(baseChain) ||
			map.get(baseChain)?.hasAuth === true;

		const hasPermission =
			PERMISSION_GATED_CHAINS.has(baseChain) ||
			fullStatement.includes("requirePermission") ||
			fullStatement.includes("requireFairLendAdmin") ||
			fullStatement.includes("requireAdmin") ||
			map.get(baseChain)?.hasPermission === true;

		map.set(varName, { hasAuth, hasPermission });
	}

	return map;
}

function analyzeConvexFile(filePath: string): Violation[] {
	const violations: Violation[] = [];
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	const rel = relative(ROOT, filePath);

	// Build local chain knowledge
	const localChains = buildLocalChainMap(lines);

	// Rule 1: no-raw-convex-exports
	// Detect: export const X = mutation({ or query({ or action({
	// These come from convex/server directly, bypassing fluent-convex.
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (RE_RAW_CONVEX_EXPORT.test(line)) {
			if (isSuppressed(lines, i, "no-raw-convex-exports")) {
				continue;
			}
			const name = line.match(RE_RAW_CONVEX_NAME)?.[1];
			violations.push({
				file: rel,
				line: i + 1,
				rule: "no-raw-convex-exports",
				severity: "error",
				message: `"${name}" uses raw mutation/query/action — use a fluent-convex builder chain instead`,
			});
		}
	}

	// Analyze export blocks for auth and permission gates
	const blocks = findExportBlocks(lines);

	for (const block of blocks) {
		// Skip non-Convex exports (e.g. `export const NAV_ITEMS = [...]`)
		const looksLikeConvex =
			block.fullText.includes(".handler(") ||
			block.fullText.includes(".public()") ||
			AUTH_GATED_CHAINS.has(block.builder) ||
			PERMISSION_GATED_CHAINS.has(block.builder) ||
			localChains.has(block.builder);

		if (!looksLikeConvex) {
			continue;
		}

		// Determine auth status
		const chainInfo = localChains.get(block.builder);
		const hasAuth =
			AUTH_GATED_CHAINS.has(block.builder) ||
			PERMISSION_GATED_CHAINS.has(block.builder) ||
			chainInfo?.hasAuth === true ||
			block.fullText.includes("authMiddleware") ||
			block.fullText.includes("actionAuthMiddleware");

		// Determine permission status
		const hasPermission =
			PERMISSION_GATED_CHAINS.has(block.builder) ||
			chainInfo?.hasPermission === true ||
			block.fullText.includes("requirePermission") ||
			block.fullText.includes("requireFairLendAdmin") ||
			block.fullText.includes("requireAdmin");

		// Rule 2: require-auth-gate
		if (
			!(hasAuth || isSuppressed(lines, block.startLine, "require-auth-gate"))
		) {
			violations.push({
				file: rel,
				line: block.startLine + 1,
				rule: "require-auth-gate",
				severity: "error",
				message: `"${block.name}" has no auth middleware — use authedQuery/authedMutation/adminMutation etc.`,
			});
		}

		// Rule 3: require-permission-gate
		if (
			hasAuth &&
			!hasPermission &&
			!isSuppressed(lines, block.startLine, "require-permission-gate")
		) {
			violations.push({
				file: rel,
				line: block.startLine + 1,
				rule: "require-permission-gate",
				severity: "warn",
				message: `"${block.name}" is auth-gated but has no permission check — add requirePermission() or use a permission-gated chain`,
			});
		}
	}

	return violations;
}

// ── Route file analysis ─────────────────────────────────────────────────

function analyzeRouteFile(filePath: string): Violation[] {
	const violations: Violation[] = [];
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	const rel = relative(ROOT, filePath);
	const fileName = getBasename(filePath);

	// Exempt specific route files (auth-flow pages, public pages)
	if (ROUTE_GUARD_EXEMPT.has(fileName)) {
		return violations;
	}

	// Only check route files that define a createFileRoute (skip utility/component files)
	if (!content.includes("createFileRoute")) {
		return violations;
	}

	const hasBeforeLoad = content.includes("beforeLoad");
	const hasGuardPermission = content.includes("guardPermission");
	const hasGuardAuthenticated = content.includes("guardAuthenticated");

	if (!hasBeforeLoad) {
		// Find the createFileRoute line for accurate line number
		let routeLine = 1;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i]?.includes("createFileRoute")) {
				routeLine = i + 1;
				break;
			}
		}

		if (isSuppressed(lines, routeLine - 1, "require-route-guard")) {
			return violations;
		}

		violations.push({
			file: rel,
			line: routeLine,
			rule: "require-route-guard",
			severity: "warn",
			message:
				"Route layout has no beforeLoad guard — add guardPermission() or guardAuthenticated()",
		});
	} else if (hasGuardAuthenticated && !hasGuardPermission) {
		// Has auth guard but not permission guard — weaker check
		let routeLine = 1;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i]?.includes("guardAuthenticated")) {
				routeLine = i + 1;
				break;
			}
		}

		if (isSuppressed(lines, routeLine - 1, "require-route-guard")) {
			return violations;
		}

		violations.push({
			file: rel,
			line: routeLine,
			rule: "require-route-guard",
			severity: "warn",
			message:
				"Route uses guardAuthenticated() but not guardPermission() — consider adding a permission check",
		});
	}

	return violations;
}

// ── Main ────────────────────────────────────────────────────────────────

function main() {
	const quiet = process.argv.includes("--quiet");
	const violations: Violation[] = [];

	// Analyze Convex files
	const convexFiles = walkDir(CONVEX_DIR, ".ts").filter(
		(f) => !isConvexExcluded(f)
	);
	for (const file of convexFiles) {
		violations.push(...analyzeConvexFile(file));
	}

	// Analyze route files
	const routeFiles = walkDir(ROUTES_DIR, ".tsx");
	for (const file of routeFiles) {
		violations.push(...analyzeRouteFile(file));
	}

	// Sort by severity (errors first), then file, then line
	violations.sort((a, b) => {
		if (a.severity !== b.severity) {
			return a.severity === "error" ? -1 : 1;
		}
		if (a.file !== b.file) {
			return a.file.localeCompare(b.file);
		}
		return a.line - b.line;
	});

	// Output
	const errors = violations.filter((v) => v.severity === "error");
	const warnings = violations.filter((v) => v.severity === "warn");

	for (const v of violations) {
		const icon = v.severity === "error" ? "✗" : "⚠";
		const color = v.severity === "error" ? "\x1b[31m" : "\x1b[33m";
		const reset = "\x1b[0m";
		console.log(
			`${color}${icon}${reset} ${v.file}:${v.line}  ${color}${v.rule}${reset}  ${v.message}`
		);
	}

	if (!quiet && violations.length > 0) {
		console.log("");
		console.log(
			`Found ${errors.length} error(s) and ${warnings.length} warning(s).`
		);
		console.log("Suppress with: // lint-security-ignore: <rule-name>");
	}

	if (!quiet && violations.length === 0) {
		console.log("✓ No security lint violations found.");
	}

	// Exit with error code if there are errors
	if (errors.length > 0) {
		process.exit(1);
	}
}

main();
