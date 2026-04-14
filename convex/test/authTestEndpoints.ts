/**
 * Minimal test endpoints — one per fluent chain.
 *
 * These exist solely so integration tests can verify that the auth
 * middleware stack (identity → role → permission) accepts or rejects
 * mock identities correctly.  Every handler returns `{ ok: true }`.
 */

import {
	adminMutation,
	adminQuery,
	authedMutation,
	authedQuery,
	borrowerMutation,
	borrowerQuery,
	brokerMutation,
	brokerQuery,
	cashLedgerMutation,
	cashLedgerQuery,
	crmAdminMutation,
	crmAdminQuery,
	crmMutation,
	crmQuery,
	dealMutation,
	dealQuery,
	documentQuery,
	lawyerMutation,
	lawyerQuery,
	ledgerQuery,
	lenderMutation,
	lenderQuery,
	paymentCancelMutation,
	paymentMutation,
	paymentQuery,
	paymentRetryMutation,
	paymentWebhookMutation,
	requireAdmin,
	requirePermission,
	underwriterMutation,
	underwriterQuery,
	uwMutation,
	uwQuery,
} from "../fluent";

function assertTestEndpointsEnabled() {
	// Require explicit opt-in via Convex env var. NODE_ENV is unreliable in Convex.
	// Set ALLOW_TEST_AUTH_ENDPOINTS=true in dev deployment dashboard only.
	if (process.env.ALLOW_TEST_AUTH_ENDPOINTS !== "true") {
		throw new Error("Test auth endpoints are disabled");
	}
}

function okResponse() {
	assertTestEndpointsEnabled();
	return { ok: true as const };
}

// ── authed (authenticated, no role/permission check) ─────────────────
export const testAuthedQuery = authedQuery
	.handler(async () => okResponse())
	.public();

export const testAuthedMutation = authedMutation
	.handler(async () => okResponse())
	.public();

// ── admin ────────────────────────────────────────────────────────────
export const testAdminQuery = adminQuery
	.handler(async () => okResponse())
	.public();

export const testAdminMutation = adminMutation
	.handler(async () => okResponse())
	.public();

export const testRequireAdminMutation = authedMutation
	.use(requireAdmin)
	.handler(async () => okResponse())
	.public();

// ── broker ───────────────────────────────────────────────────────────
export const testBrokerQuery = brokerQuery
	.handler(async () => okResponse())
	.public();

export const testBrokerMutation = brokerMutation
	.handler(async () => okResponse())
	.public();

// ── borrower ─────────────────────────────────────────────────────────
export const testBorrowerQuery = borrowerQuery
	.handler(async () => okResponse())
	.public();

export const testBorrowerMutation = borrowerMutation
	.handler(async () => okResponse())
	.public();

// ── lender ───────────────────────────────────────────────────────────
export const testLenderQuery = lenderQuery
	.handler(async () => okResponse())
	.public();

export const testLenderMutation = lenderMutation
	.handler(async () => okResponse())
	.public();

// ── underwriter (org-scoped) ─────────────────────────────────────────
export const testUnderwriterQuery = underwriterQuery
	.handler(async () => okResponse())
	.public();

export const testUnderwriterMutation = underwriterMutation
	.handler(async () => okResponse())
	.public();

// ── lawyer ───────────────────────────────────────────────────────────
export const testLawyerQuery = lawyerQuery
	.handler(async () => okResponse())
	.public();

export const testLawyerMutation = lawyerMutation
	.handler(async () => okResponse())
	.public();

// ── uw (underwriter:access, org context required) ───────────────────
export const testUwQuery = uwQuery.handler(async () => okResponse()).public();

export const testUwMutation = uwMutation
	.handler(async () => okResponse())
	.public();

// ── deal ─────────────────────────────────────────────────────────────
export const testDealQuery = dealQuery
	.handler(async () => okResponse())
	.public();

export const testDealMutation = dealMutation
	.handler(async () => okResponse())
	.public();

export const testPaymentQuery = paymentQuery
	.handler(async () => okResponse())
	.public();

export const testPaymentManageMutation = paymentMutation
	.handler(async () => okResponse())
	.public();

export const testPaymentRetryMutation = paymentRetryMutation
	.handler(async () => okResponse())
	.public();

export const testPaymentCancelMutation = paymentCancelMutation
	.handler(async () => okResponse())
	.public();

export const testPaymentWebhookMutation = paymentWebhookMutation
	.handler(async () => okResponse())
	.public();

// ── ledger ───────────────────────────────────────────────────────────
export const testLedgerQuery = ledgerQuery
	.handler(async () => okResponse())
	.public();

export const testCashLedgerQuery = cashLedgerQuery
	.handler(async () => okResponse())
	.public();

export const testCashLedgerMutation = cashLedgerMutation
	.handler(async () => okResponse())
	.public();

export const testLedgerCorrectionMutation = authedMutation
	.use(requirePermission("ledger:correct"))
	.handler(async () => okResponse())
	.public();

export const testAccrualQuery = authedQuery
	.use(requirePermission("accrual:view"))
	.handler(async () => okResponse())
	.public();

export const testDispersalQuery = authedQuery
	.use(requirePermission("dispersal:view"))
	.handler(async () => okResponse())
	.public();

export const testObligationWaiveMutation = authedMutation
	.use(requirePermission("obligation:waive"))
	.handler(async () => okResponse())
	.public();

export const testOnboardingManageQuery = adminQuery
	.use(requirePermission("onboarding:manage"))
	.handler(async () => okResponse())
	.public();

// ── crm admin (org-scoped admin) ─────────────────────────────────────
export const testCrmAdminQuery = crmAdminQuery
	.handler(async () => okResponse())
	.public();

export const testCrmAdminMutation = crmAdminMutation
	.handler(async () => okResponse())
	.public();

// ── crm (any authed user with org context) ───────────────────────────
export const testCrmQuery = crmQuery.handler(async () => okResponse()).public();

export const testCrmMutation = crmMutation
	.handler(async () => okResponse())
	.public();

export const testDocumentQuery = documentQuery
	.handler(async () => okResponse())
	.public();
