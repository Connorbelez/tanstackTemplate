/**
 * T-013: New permissions verification.
 *
 * Tests the 7 new permissions (deal:view, deal:manage, ledger:view,
 * ledger:correct, accrual:view, dispersal:view, obligation:waive) against
 * every role. Permissions with dedicated chain endpoints are tested via
 * the endpoint; the rest are verified against the ROLE_PERMISSIONS map.
 */

import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import {
	createTestConvex,
	type MockIdentity,
	seedFromIdentity,
} from "../helpers";
import {
	BORROWER,
	BROKER,
	EXTERNAL_ORG_ADMIN,
	FAIRLEND_ADMIN,
	JR_UNDERWRITER,
	LAWYER,
	LENDER,
	MEMBER,
	SR_UNDERWRITER,
	UNDERWRITER,
} from "../identities";
import { ROLE_PERMISSIONS } from "../permissions";

// ── Identity registry keyed by name ──────────────────────────────────

const ALL_IDENTITIES: Record<string, MockIdentity> = {
	FAIRLEND_ADMIN,
	EXTERNAL_ORG_ADMIN,
	BROKER,
	LENDER,
	BORROWER,
	LAWYER,
	JR_UNDERWRITER,
	UNDERWRITER,
	SR_UNDERWRITER,
	MEMBER,
};

// ── Permissions with dedicated chain endpoints ───────────────────────

describe("deal:view (via dealQuery endpoint)", () => {
	const allowed = ["FAIRLEND_ADMIN", "BROKER", "LENDER", "LAWYER"];
	const denied = [
		"EXTERNAL_ORG_ADMIN",
		"BORROWER",
		"JR_UNDERWRITER",
		"UNDERWRITER",
		"SR_UNDERWRITER",
		"MEMBER",
	];

	for (const name of allowed) {
		it(`allows ${name}`, async () => {
			const t = createTestConvex();
			const identity = ALL_IDENTITIES[name];
			await seedFromIdentity(t, identity);

			const result = await t
				.withIdentity(identity)
				.query(api.test.authTestEndpoints.testDealQuery);
			expect(result).toEqual({ ok: true });
		});
	}

	for (const name of denied) {
		it(`denies ${name}`, async () => {
			const t = createTestConvex();
			const identity = ALL_IDENTITIES[name];
			await seedFromIdentity(t, identity);

			await expect(
				t.withIdentity(identity).query(api.test.authTestEndpoints.testDealQuery)
			).rejects.toThrow();
		});
	}
});

describe("deal:manage (via dealMutation endpoint)", () => {
	const allowed = ["FAIRLEND_ADMIN"];
	const denied = [
		"EXTERNAL_ORG_ADMIN",
		"BROKER",
		"LENDER",
		"LAWYER",
		"BORROWER",
		"JR_UNDERWRITER",
		"UNDERWRITER",
		"SR_UNDERWRITER",
		"MEMBER",
	];

	for (const name of allowed) {
		it(`allows ${name}`, async () => {
			const t = createTestConvex();
			const identity = ALL_IDENTITIES[name];
			await seedFromIdentity(t, identity);

			const result = await t
				.withIdentity(identity)
				.mutation(api.test.authTestEndpoints.testDealMutation);
			expect(result).toEqual({ ok: true });
		});
	}

	for (const name of denied) {
		it(`denies ${name}`, async () => {
			const t = createTestConvex();
			const identity = ALL_IDENTITIES[name];
			await seedFromIdentity(t, identity);

			await expect(
				t
					.withIdentity(identity)
					.mutation(api.test.authTestEndpoints.testDealMutation)
			).rejects.toThrow();
		});
	}
});

describe("ledger:view (via ledgerQuery endpoint)", () => {
	const allowed = ["FAIRLEND_ADMIN", "BROKER", "LENDER"];
	const denied = [
		"EXTERNAL_ORG_ADMIN",
		"BORROWER",
		"LAWYER",
		"JR_UNDERWRITER",
		"UNDERWRITER",
		"SR_UNDERWRITER",
		"MEMBER",
	];

	for (const name of allowed) {
		it(`allows ${name}`, async () => {
			const t = createTestConvex();
			const identity = ALL_IDENTITIES[name];
			await seedFromIdentity(t, identity);

			const result = await t
				.withIdentity(identity)
				.query(api.test.authTestEndpoints.testLedgerQuery);
			expect(result).toEqual({ ok: true });
		});
	}

	for (const name of denied) {
		it(`denies ${name}`, async () => {
			const t = createTestConvex();
			const identity = ALL_IDENTITIES[name];
			await seedFromIdentity(t, identity);

			await expect(
				t
					.withIdentity(identity)
					.query(api.test.authTestEndpoints.testLedgerQuery)
			).rejects.toThrow();
		});
	}
});

// ── Permissions WITHOUT dedicated chain endpoints ────────────────────
// Verified against the ROLE_PERMISSIONS truth table directly.

interface TruthTableEntry {
	allowedRoles: string[];
	deniedRoles: string[];
	permission: string;
}

const TRUTH_TABLE_ONLY: TruthTableEntry[] = [
	{
		permission: "ledger:correct",
		allowedRoles: ["admin"],
		deniedRoles: [
			"broker",
			"lender",
			"borrower",
			"lawyer",
			"jr_underwriter",
			"underwriter",
			"sr_underwriter",
			"member",
		],
	},
	{
		permission: "accrual:view",
		allowedRoles: ["admin", "broker", "lender"],
		deniedRoles: [
			"borrower",
			"lawyer",
			"jr_underwriter",
			"underwriter",
			"sr_underwriter",
			"member",
		],
	},
	{
		permission: "dispersal:view",
		allowedRoles: ["admin", "lender"],
		deniedRoles: [
			"broker",
			"borrower",
			"lawyer",
			"jr_underwriter",
			"underwriter",
			"sr_underwriter",
			"member",
		],
	},
	{
		permission: "obligation:waive",
		allowedRoles: ["admin"],
		deniedRoles: [
			"broker",
			"lender",
			"borrower",
			"lawyer",
			"jr_underwriter",
			"underwriter",
			"sr_underwriter",
			"member",
		],
	},
];

describe("permissions without dedicated endpoints (truth table verification)", () => {
	for (const entry of TRUTH_TABLE_ONLY) {
		describe(entry.permission, () => {
			for (const role of entry.allowedRoles) {
				it(`${role} has ${entry.permission}`, () => {
					expect(ROLE_PERMISSIONS[role]).toContain(entry.permission);
				});
			}

			for (const role of entry.deniedRoles) {
				it(`${role} does NOT have ${entry.permission}`, () => {
					expect(ROLE_PERMISSIONS[role]).not.toContain(entry.permission);
				});
			}
		});
	}
});

// ── Cross-check: deal:view and ledger:view in ROLE_PERMISSIONS ───────

describe("deal:view in ROLE_PERMISSIONS", () => {
	const allowed = ["admin", "broker", "lender", "lawyer"];
	const denied = [
		"borrower",
		"jr_underwriter",
		"underwriter",
		"sr_underwriter",
		"member",
	];

	for (const role of allowed) {
		it(`${role} has deal:view`, () => {
			expect(ROLE_PERMISSIONS[role]).toContain("deal:view");
		});
	}

	for (const role of denied) {
		it(`${role} does NOT have deal:view`, () => {
			expect(ROLE_PERMISSIONS[role]).not.toContain("deal:view");
		});
	}
});

describe("deal:manage in ROLE_PERMISSIONS", () => {
	const allowed = ["admin"];
	const denied = [
		"broker",
		"lender",
		"lawyer",
		"borrower",
		"jr_underwriter",
		"underwriter",
		"sr_underwriter",
		"member",
	];

	for (const role of allowed) {
		it(`${role} has deal:manage`, () => {
			expect(ROLE_PERMISSIONS[role]).toContain("deal:manage");
		});
	}

	for (const role of denied) {
		it(`${role} does NOT have deal:manage`, () => {
			expect(ROLE_PERMISSIONS[role]).not.toContain("deal:manage");
		});
	}
});

describe("ledger:view in ROLE_PERMISSIONS", () => {
	const allowed = ["admin", "broker", "lender"];
	const denied = [
		"borrower",
		"lawyer",
		"jr_underwriter",
		"underwriter",
		"sr_underwriter",
		"member",
	];

	for (const role of allowed) {
		it(`${role} has ledger:view`, () => {
			expect(ROLE_PERMISSIONS[role]).toContain("ledger:view");
		});
	}

	for (const role of denied) {
		it(`${role} does NOT have ledger:view`, () => {
			expect(ROLE_PERMISSIONS[role]).not.toContain("ledger:view");
		});
	}
});
