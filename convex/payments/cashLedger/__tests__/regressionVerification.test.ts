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

describe("Regression verification: ownership ledger untouched", () => {
	it("detects no non-test source file changes in convex/ledger/ vs main", () => {
		let output: string;
		try {
			output = execFileSync(
				"git",
				["diff", "--name-only", "main", "--", "convex/ledger/"],
				{ encoding: "utf-8" }
			);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			// Only skip if the main branch doesn't exist (shallow clone, worktree)
			if (
				message.includes("unknown revision") ||
				message.includes("bad revision")
			) {
				console.warn(
					"Skipping git diff check — 'main' branch not available in this environment"
				);
				return;
			}
			// All other git failures should surface, not be silently swallowed
			throw new Error(`Git diff failed unexpectedly: ${message}`);
		}

		const changedFiles = output
			.split("\n")
			.map((f) => f.trim())
			.filter((f) => f.length > 0)
			// Exclude __tests__/ paths — test files may have additions from other issues
			.filter((f) => !f.includes("__tests__/"));

		expect(
			changedFiles,
			"REQ-244 violation: ownership ledger source files were modified.\n" +
				`Changed files:\n${changedFiles.map((f) => `  - ${f}`).join("\n")}`
		).toHaveLength(0);
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
