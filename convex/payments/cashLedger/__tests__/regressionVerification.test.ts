import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ══════════════════════════════════════════════════════════════════════
// Regression verification: ownership ledger untouched
// ══════════════════════════════════════════════════════════════════════
// Meta-test: catches accidental modifications to the ownership ledger
// source files in convex/ledger/. REQ-244 hard constraint.

const LEDGER_DIR = path.resolve(import.meta.dirname, "../../../ledger");
const ALLOWED_LEDGER_DIFFS = new Set(["convex/ledger/mutations.ts"]);

function assertApprovedLedgerMutationExtraction() {
	const source = fs.readFileSync(
		path.join(LEDGER_DIR, "mutations.ts"),
		"utf-8"
	);
	expect(
		source,
		"Approved ledger change must keep the extracted mintMortgageHandler helper."
	).toContain("export async function mintMortgageHandler(");
	expect(
		source,
		"Approved ledger change must keep mintMortgage delegating to mintMortgageHandler."
	).toContain(".handler(async (ctx, args) => mintMortgageHandler(ctx, args))");
}

/** Resolve the best base ref for diffing, accounting for CI shallow clones. */
function resolveBaseRef(): string | null {
	const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);

	const refExists = (ref: string): boolean => {
		try {
			execFileSync("git", ["rev-parse", "--verify", ref], {
				encoding: "utf-8",
				stdio: "pipe",
			});
			return true;
		} catch {
			return false;
		}
	};

	if (isCI) {
		// In CI prefer the PR base ref provided by GitHub Actions
		const ghBase = process.env.GITHUB_BASE_REF;
		if (ghBase) {
			const candidates = [`origin/${ghBase}`, ghBase];
			for (const ref of candidates) {
				if (refExists(ref)) {
					return ref;
				}
			}
		}
		// Fall back to origin/main, then main
		if (refExists("origin/main")) {
			return "origin/main";
		}
		if (refExists("main")) {
			return "main";
		}

		// Last resort: try to fetch origin/main
		try {
			execFileSync("git", ["fetch", "--depth=1", "origin", "main"], {
				encoding: "utf-8",
				stdio: "pipe",
			});
			if (refExists("origin/main")) {
				return "origin/main";
			}
		} catch {
			// fetch failed — fall through to null
		}

		return null; // hard failure in CI
	}

	// Local dev: try main first, then origin/main
	if (refExists("main")) {
		return "main";
	}
	if (refExists("origin/main")) {
		return "origin/main";
	}
	return null; // soft skip locally
}

describe("Regression verification: ownership ledger untouched", () => {
	it("detects no non-test source file changes in convex/ledger/ vs main", () => {
		const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
		const baseRef = resolveBaseRef();

		if (!baseRef) {
			if (isCI) {
				throw new Error(
					"REQ-244: no base ref (main / origin/main / GITHUB_BASE_REF) " +
						"available in CI — cannot enforce ownership ledger guard"
				);
			}
			console.warn(
				"Skipping git diff check — no base ref available in local environment"
			);
			return;
		}

		let output: string;
		try {
			output = execFileSync(
				"git",
				["diff", "--name-only", baseRef, "--", "convex/ledger/"],
				{ encoding: "utf-8" }
			);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Git diff against '${baseRef}' failed: ${message}`);
		}

		const changedFiles = output
			.split("\n")
			.map((f) => f.trim())
			.filter((f) => f.length > 0)
			// Exclude __tests__/ paths — test files may have additions from other issues
			.filter((f) => !f.includes("__tests__/"));

		const unexpectedChangedFiles = changedFiles.filter(
			(file) => !ALLOWED_LEDGER_DIFFS.has(file)
		);
		expect(
			unexpectedChangedFiles,
			"REQ-244 violation: unexpected ownership ledger source files were modified.\n" +
				`Changed files:\n${changedFiles.map((f) => `  - ${f}`).join("\n")}`
		).toHaveLength(0);

		if (changedFiles.includes("convex/ledger/mutations.ts")) {
			assertApprovedLedgerMutationExtraction();
		}
	});

	it("verifies key source files exist in convex/ledger/", () => {
		const expectedFiles = [
			"accountOwnership.ts",
			"accounts.ts",
			"bootstrap.ts",
			"constants.ts",
			"cursors.ts",
			"internal.ts",
			"migrations.ts",
			"mutations.ts",
			"postEntry.ts",
			"queries.ts",
			"sequenceCounter.ts",
			"types.ts",
			"validation.ts",
			"validators.ts",
		];

		for (const file of expectedFiles) {
			const filePath = path.join(LEDGER_DIR, file);
			expect(
				fs.existsSync(filePath),
				`Expected ownership ledger file not found: convex/ledger/${file}`
			).toBe(true);
		}
	});
});
