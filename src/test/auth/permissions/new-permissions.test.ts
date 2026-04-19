/**
 * T-013: New permissions verification.
 *
 * Tests the 7 new permissions (deal:view, deal:manage, ledger:view,
 * ledger:correct, accrual:view, dispersal:view, obligation:waive) against
 * every role using real auth endpoints, with ROLE_PERMISSIONS only used for
 * secondary cross-checks.
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
	const allowed = [
		"FAIRLEND_ADMIN",
		"EXTERNAL_ORG_ADMIN",
		"BROKER",
		"LENDER",
		"LAWYER",
	];
	const denied = [
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
			).rejects.toThrow('Forbidden: permission "deal:view" required');
		});
	}
});

describe("deal:manage (via dealMutation endpoint)", () => {
	const allowed = ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN"];
	const denied = [
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
			).rejects.toThrow('Forbidden: permission "deal:manage" required');
		});
	}
});

describe("ledger:view (via ledgerQuery endpoint)", () => {
	const allowed = ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "BROKER", "LENDER"];
	const denied = [
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
			).rejects.toThrow('Forbidden: permission "ledger:view" required');
		});
	}
});

interface QueryPermissionEndpointTest {
	allowed: string[];
	denied: string[];
	endpoint:
		| typeof api.test.authTestEndpoints.testAccrualQuery
		| typeof api.test.authTestEndpoints.testDispersalQuery;
	errorMessage: string;
	mode: "query";
	permission: string;
}

interface MutationPermissionEndpointTest {
	allowed: string[];
	denied: string[];
	endpoint:
		| typeof api.test.authTestEndpoints.testLedgerCorrectionMutation
		| typeof api.test.authTestEndpoints.testObligationWaiveMutation;
	errorMessage: string;
	mode: "mutation";
	permission: string;
}

type PermissionEndpointTest =
	| QueryPermissionEndpointTest
	| MutationPermissionEndpointTest;

const PERMISSION_ENDPOINT_TESTS: PermissionEndpointTest[] = [
	{
		permission: "ledger:correct",
		endpoint: api.test.authTestEndpoints.testLedgerCorrectionMutation,
		mode: "mutation",
		errorMessage: 'Forbidden: permission "ledger:correct" required',
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN"],
		denied: [
			"BROKER",
			"LENDER",
			"BORROWER",
			"LAWYER",
			"JR_UNDERWRITER",
			"UNDERWRITER",
			"SR_UNDERWRITER",
			"MEMBER",
		],
	},
	{
		permission: "accrual:view",
		endpoint: api.test.authTestEndpoints.testAccrualQuery,
		mode: "query",
		errorMessage: 'Forbidden: permission "accrual:view" required',
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "BROKER", "LENDER"],
		denied: [
			"BORROWER",
			"LAWYER",
			"JR_UNDERWRITER",
			"UNDERWRITER",
			"SR_UNDERWRITER",
			"MEMBER",
		],
	},
	{
		permission: "dispersal:view",
		endpoint: api.test.authTestEndpoints.testDispersalQuery,
		mode: "query",
		errorMessage: 'Forbidden: permission "dispersal:view" required',
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "LENDER"],
		denied: [
			"BROKER",
			"BORROWER",
			"LAWYER",
			"JR_UNDERWRITER",
			"UNDERWRITER",
			"SR_UNDERWRITER",
			"MEMBER",
		],
	},
	{
		permission: "obligation:waive",
		endpoint: api.test.authTestEndpoints.testObligationWaiveMutation,
		mode: "mutation",
		errorMessage: 'Forbidden: permission "obligation:waive" required',
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN"],
		denied: [
			"BROKER",
			"LENDER",
			"BORROWER",
			"LAWYER",
			"JR_UNDERWRITER",
			"UNDERWRITER",
			"SR_UNDERWRITER",
			"MEMBER",
		],
	},
];

describe("permissions without dedicated endpoints", () => {
	for (const entry of PERMISSION_ENDPOINT_TESTS) {
		describe(entry.permission, () => {
			for (const name of entry.allowed) {
				it(`allows ${name}`, async () => {
					const t = createTestConvex();
					const identity = ALL_IDENTITIES[name];
					await seedFromIdentity(t, identity);

					const result =
						entry.mode === "query"
							? await t.withIdentity(identity).query(entry.endpoint)
							: await t.withIdentity(identity).mutation(entry.endpoint);
					expect(result).toEqual({ ok: true });
				});
			}

			for (const name of entry.denied) {
				it(`denies ${name}`, async () => {
					const t = createTestConvex();
					const identity = ALL_IDENTITIES[name];
					await seedFromIdentity(t, identity);

					const promise =
						entry.mode === "query"
							? t.withIdentity(identity).query(entry.endpoint)
							: t.withIdentity(identity).mutation(entry.endpoint);
					await expect(promise).rejects.toThrow(entry.errorMessage);
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
