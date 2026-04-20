/**
 * T-011: Comprehensive chain x role matrix tests.
 *
 * Verifies every pre-built fluent chain against every role identity fixture.
 * Uses a data-driven approach: the expected access matrix is declared up front,
 * and test cases are generated for each chain x identity combination.
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

// ── Identity Registry ────────────────────────────────────────────────

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

const ALL_IDENTITY_NAMES = Object.keys(ALL_IDENTITIES);

// ── Chain Test Definitions ───────────────────────────────────────────

/** Invoke an endpoint with the correct query/mutation method. */
function invokeEndpoint(
	ctx: ReturnType<ReturnType<typeof createTestConvex>["withIdentity"]>,
	chain: ChainTest
): Promise<{ ok: true }> {
	if (chain.type === "query") {
		return ctx.query(chain.queryEndpoint);
	}
	return ctx.mutation(chain.mutationEndpoint);
}

type QueryEndpoint = typeof api.test.authTestEndpoints.testAuthedQuery;
type MutationEndpoint = typeof api.test.authTestEndpoints.testAuthedMutation;

interface ChainTestBase {
	/** Identity names that should succeed */
	allowed: string[];
	name: string;
}

interface QueryChainTest extends ChainTestBase {
	mutationEndpoint?: undefined;
	queryEndpoint: QueryEndpoint;
	type: "query";
}

interface MutationChainTest extends ChainTestBase {
	mutationEndpoint: MutationEndpoint;
	queryEndpoint?: undefined;
	type: "mutation";
}

type ChainTest = QueryChainTest | MutationChainTest;

const CHAIN_TESTS: ChainTest[] = [
	{
		name: "authedQuery",
		queryEndpoint: api.test.authTestEndpoints.testAuthedQuery,
		type: "query",
		allowed: ALL_IDENTITY_NAMES,
	},
	{
		name: "authedMutation",
		mutationEndpoint: api.test.authTestEndpoints.testAuthedMutation,
		type: "mutation",
		allowed: ALL_IDENTITY_NAMES,
	},
	{
		name: "adminQuery (FairLend admin only)",
		queryEndpoint: api.test.authTestEndpoints.testAdminQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN"],
	},
	{
		name: "adminMutation (FairLend admin only)",
		mutationEndpoint: api.test.authTestEndpoints.testAdminMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN"],
	},
	{
		name: "brokerQuery",
		queryEndpoint: api.test.authTestEndpoints.testBrokerQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "BROKER"],
	},
	{
		name: "brokerMutation",
		mutationEndpoint: api.test.authTestEndpoints.testBrokerMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "BROKER"],
	},
	{
		name: "lenderQuery",
		queryEndpoint: api.test.authTestEndpoints.testLenderQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "LENDER"],
	},
	{
		name: "lenderMutation",
		mutationEndpoint: api.test.authTestEndpoints.testLenderMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "LENDER"],
	},
	{
		name: "borrowerQuery",
		queryEndpoint: api.test.authTestEndpoints.testBorrowerQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "BORROWER"],
	},
	{
		name: "borrowerMutation",
		mutationEndpoint: api.test.authTestEndpoints.testBorrowerMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "BORROWER"],
	},
	{
		name: "lawyerQuery",
		queryEndpoint: api.test.authTestEndpoints.testLawyerQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "LAWYER"],
	},
	{
		name: "lawyerMutation",
		mutationEndpoint: api.test.authTestEndpoints.testLawyerMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "LAWYER"],
	},
	{
		name: "underwriterQuery (org-scoped)",
		queryEndpoint: api.test.authTestEndpoints.testUnderwriterQuery,
		type: "query",
		allowed: [
			"FAIRLEND_ADMIN",
			"EXTERNAL_ORG_ADMIN",
			"JR_UNDERWRITER",
			"UNDERWRITER",
			"SR_UNDERWRITER",
		],
	},
	{
		name: "underwriterMutation (org-scoped)",
		mutationEndpoint: api.test.authTestEndpoints.testUnderwriterMutation,
		type: "mutation",
		allowed: [
			"FAIRLEND_ADMIN",
			"EXTERNAL_ORG_ADMIN",
			"JR_UNDERWRITER",
			"UNDERWRITER",
			"SR_UNDERWRITER",
		],
	},
	{
		name: "uwQuery (no org context)",
		queryEndpoint: api.test.authTestEndpoints.testUwQuery,
		type: "query",
		allowed: [
			"FAIRLEND_ADMIN",
			"EXTERNAL_ORG_ADMIN",
			"JR_UNDERWRITER",
			"UNDERWRITER",
			"SR_UNDERWRITER",
		],
	},
	{
		name: "uwMutation (no org context)",
		mutationEndpoint: api.test.authTestEndpoints.testUwMutation,
		type: "mutation",
		allowed: [
			"FAIRLEND_ADMIN",
			"EXTERNAL_ORG_ADMIN",
			"JR_UNDERWRITER",
			"UNDERWRITER",
			"SR_UNDERWRITER",
		],
	},
	{
		name: "dealQuery (deal:view)",
		queryEndpoint: api.test.authTestEndpoints.testDealQuery,
		type: "query",
		allowed: [
			"FAIRLEND_ADMIN",
			"EXTERNAL_ORG_ADMIN",
			"BROKER",
			"LENDER",
			"LAWYER",
		],
	},
	{
		name: "dealMutation (deal:manage)",
		mutationEndpoint: api.test.authTestEndpoints.testDealMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN"],
	},
	{
		name: "paymentQuery (FairLend admin + payment:view)",
		queryEndpoint: api.test.authTestEndpoints.testPaymentQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN"],
	},
	{
		name: "paymentManageMutation (FairLend admin + payment:manage)",
		mutationEndpoint: api.test.authTestEndpoints.testPaymentManageMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN"],
	},
	{
		name: "paymentRetryMutation (FairLend admin + payment:retry)",
		mutationEndpoint: api.test.authTestEndpoints.testPaymentRetryMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN"],
	},
	{
		name: "paymentCancelMutation (FairLend admin + payment:cancel)",
		mutationEndpoint: api.test.authTestEndpoints.testPaymentCancelMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN"],
	},
	{
		name: "paymentWebhookMutation (FairLend admin + payment:webhook_process)",
		mutationEndpoint: api.test.authTestEndpoints.testPaymentWebhookMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN"],
	},
	{
		name: "ledgerQuery (ledger:view)",
		queryEndpoint: api.test.authTestEndpoints.testLedgerQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN", "BROKER", "LENDER"],
	},
	{
		name: "cashLedgerQuery (FairLend admin + cash_ledger:view)",
		queryEndpoint: api.test.authTestEndpoints.testCashLedgerQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN"],
	},
	{
		name: "cashLedgerMutation (cash_ledger:correct)",
		mutationEndpoint: api.test.authTestEndpoints.testCashLedgerMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN"],
	},
	{
		name: "onboardingManageQuery (FairLend admin + onboarding:manage)",
		queryEndpoint: api.test.authTestEndpoints.testOnboardingManageQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN"],
	},
	{
		name: "crmAdminQuery (org-scoped admin only)",
		queryEndpoint: api.test.authTestEndpoints.testCrmAdminQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN"],
	},
	{
		name: "crmAdminMutation (org-scoped admin only)",
		mutationEndpoint: api.test.authTestEndpoints.testCrmAdminMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN"],
	},
	{
		name: "crmQuery (org-scoped admin only)",
		queryEndpoint: api.test.authTestEndpoints.testCrmQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN"],
	},
	{
		name: "crmMutation (org-scoped admin only)",
		mutationEndpoint: api.test.authTestEndpoints.testCrmMutation,
		type: "mutation",
		allowed: ["FAIRLEND_ADMIN", "EXTERNAL_ORG_ADMIN"],
	},
	{
		name: "documentQuery (FairLend admin + document:review)",
		queryEndpoint: api.test.authTestEndpoints.testDocumentQuery,
		type: "query",
		allowed: ["FAIRLEND_ADMIN"],
	},
];

// ── Test Generation ──────────────────────────────────────────────────

describe("chain x role matrix", () => {
	for (const chain of CHAIN_TESTS) {
		describe(chain.name, () => {
			const denied = ALL_IDENTITY_NAMES.filter(
				(name) => !chain.allowed.includes(name)
			);

			for (const identityName of chain.allowed) {
				it(`allows ${identityName}`, async () => {
					const t = createTestConvex();
					const identity = ALL_IDENTITIES[identityName];
					await seedFromIdentity(t, identity);

					const result = await invokeEndpoint(t.withIdentity(identity), chain);
					expect(result).toEqual({ ok: true });
				});
			}

			for (const identityName of denied) {
				it(`denies ${identityName}`, async () => {
					const t = createTestConvex();
					const identity = ALL_IDENTITIES[identityName];
					await seedFromIdentity(t, identity);

					await expect(
						invokeEndpoint(t.withIdentity(identity), chain)
					).rejects.toThrow();
				});
			}
		});
	}
});
