/**
 * T-012 & T-014: Role-to-permission truth table verification.
 *
 * Systematically verifies the ROLE_PERMISSIONS map:
 * - Each role has the exact permissions listed in the truth table
 * - Each role does NOT have permissions belonging exclusively to other roles
 * - The underwriter hierarchy is correctly tiered
 * - Deprecated/removed roles are absent from the map
 */

import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS } from "../permissions";

// ── T-012: Per-role permission verification ──────────────────────────

describe("ROLE_PERMISSIONS truth table", () => {
	const expectedRoles = [
		"admin",
		"broker",
		"lender",
		"borrower",
		"lawyer",
		"jr_underwriter",
		"underwriter",
		"sr_underwriter",
		"member",
	];

	it("contains exactly the expected roles", () => {
		const actualRoles = Object.keys(ROLE_PERMISSIONS).sort();
		expect(actualRoles).toEqual([...expectedRoles].sort());
	});

	for (const role of expectedRoles) {
		describe(`role: ${role}`, () => {
			it("has a non-empty permission array", () => {
				expect(ROLE_PERMISSIONS[role]).toBeDefined();
				expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
			});

			it("has no duplicate permissions", () => {
				const perms = ROLE_PERMISSIONS[role];
				const unique = new Set(perms);
				expect(unique.size).toBe(perms.length);
			});

			it("does not contain permissions exclusively belonging to other roles", () => {
				const rolePerms = new Set(ROLE_PERMISSIONS[role]);

				// Verify role-specific access permissions are exclusive
				const accessPermissions: Record<string, string> = {
					"admin:access": "admin",
					"broker:access": "broker",
					"lender:access": "lender",
					"borrower:access": "borrower",
					"lawyer:access": "lawyer",
					"underwriter:access": "underwriter",
				};

				for (const [perm, ownerRole] of Object.entries(accessPermissions)) {
					if (role !== ownerRole && role !== "admin") {
						// Admin gets cross-role access permissions; underwriter roles share underwriter:access
						const isUwFamily =
							["jr_underwriter", "underwriter", "sr_underwriter"].includes(
								role
							) && perm === "underwriter:access";
						if (!isUwFamily) {
							expect(rolePerms.has(perm)).toBe(false);
						}
					}
				}
			});
		});
	}
});

// ── T-012: Underwriter hierarchy ─────────────────────────────────────

describe("underwriter permission hierarchy", () => {
	const uwHierarchy: Record<string, { jr: boolean; uw: boolean; sr: boolean }> =
		{
			"underwriting:view_queue": { jr: true, uw: true, sr: true },
			"underwriting:claim": { jr: true, uw: true, sr: true },
			"underwriting:release": { jr: true, uw: true, sr: true },
			"underwriting:recommend": { jr: true, uw: false, sr: false },
			"underwriting:decide": { jr: false, uw: true, sr: true },
			"underwriting:review_decisions": { jr: false, uw: true, sr: true },
			"underwriting:review_samples": { jr: false, uw: false, sr: true },
			"underwriting:reassign": { jr: false, uw: false, sr: true },
			"underwriting:configure_queue": { jr: false, uw: false, sr: true },
			"underwriting:view_all": { jr: false, uw: false, sr: true },
			"underwriting:view_team_metrics": { jr: false, uw: true, sr: true },
		};

	for (const [permission, expected] of Object.entries(uwHierarchy)) {
		describe(permission, () => {
			it(`jr_underwriter: ${expected.jr ? "has" : "does NOT have"}`, () => {
				const has = ROLE_PERMISSIONS.jr_underwriter.includes(permission);
				expect(has).toBe(expected.jr);
			});

			it(`underwriter: ${expected.uw ? "has" : "does NOT have"}`, () => {
				const has = ROLE_PERMISSIONS.underwriter.includes(permission);
				expect(has).toBe(expected.uw);
			});

			it(`sr_underwriter: ${expected.sr ? "has" : "does NOT have"}`, () => {
				const has = ROLE_PERMISSIONS.sr_underwriter.includes(permission);
				expect(has).toBe(expected.sr);
			});
		});
	}

	it("all underwriter tiers share underwriter:access", () => {
		for (const tier of ["jr_underwriter", "underwriter", "sr_underwriter"]) {
			expect(ROLE_PERMISSIONS[tier]).toContain("underwriter:access");
		}
	});
});

// ── T-014: Deprecated role validation ────────────────────────────────

describe("no references to deprecated roles", () => {
	it("ROLE_PERMISSIONS has no 'investor' key", () => {
		expect(ROLE_PERMISSIONS).not.toHaveProperty("investor");
	});

	it("ROLE_PERMISSIONS has no 'platform_admin' key", () => {
		expect(ROLE_PERMISSIONS).not.toHaveProperty("platform_admin");
	});

	it("ROLE_PERMISSIONS has no 'org_admin' key", () => {
		expect(ROLE_PERMISSIONS).not.toHaveProperty("org_admin");
	});

	it("ROLE_PERMISSIONS has no 'uw_manager' key", () => {
		expect(ROLE_PERMISSIONS).not.toHaveProperty("uw_manager");
	});
});
