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
	dealMutation,
	dealQuery,
	lawyerMutation,
	lawyerQuery,
	ledgerQuery,
	lenderMutation,
	lenderQuery,
	underwriterMutation,
	underwriterQuery,
	uwMutation,
	uwQuery,
} from "../fluent";

// ── authed (authenticated, no role/permission check) ─────────────────
export const testAuthedQuery = authedQuery
	.handler(async () => ({ ok: true as const }))
	.public();

export const testAuthedMutation = authedMutation
	.handler(async () => ({ ok: true as const }))
	.public();

// ── admin ────────────────────────────────────────────────────────────
export const testAdminQuery = adminQuery
	.handler(async () => ({ ok: true as const }))
	.public();

export const testAdminMutation = adminMutation
	.handler(async () => ({ ok: true as const }))
	.public();

// ── broker ───────────────────────────────────────────────────────────
export const testBrokerQuery = brokerQuery
	.handler(async () => ({ ok: true as const }))
	.public();

export const testBrokerMutation = brokerMutation
	.handler(async () => ({ ok: true as const }))
	.public();

// ── borrower ─────────────────────────────────────────────────────────
export const testBorrowerQuery = borrowerQuery
	.handler(async () => ({ ok: true as const }))
	.public();

export const testBorrowerMutation = borrowerMutation
	.handler(async () => ({ ok: true as const }))
	.public();

// ── lender ───────────────────────────────────────────────────────────
export const testLenderQuery = lenderQuery
	.handler(async () => ({ ok: true as const }))
	.public();

export const testLenderMutation = lenderMutation
	.handler(async () => ({ ok: true as const }))
	.public();

// ── underwriter (org-scoped) ─────────────────────────────────────────
export const testUnderwriterQuery = underwriterQuery
	.handler(async () => ({ ok: true as const }))
	.public();

export const testUnderwriterMutation = underwriterMutation
	.handler(async () => ({ ok: true as const }))
	.public();

// ── lawyer ───────────────────────────────────────────────────────────
export const testLawyerQuery = lawyerQuery
	.handler(async () => ({ ok: true as const }))
	.public();

export const testLawyerMutation = lawyerMutation
	.handler(async () => ({ ok: true as const }))
	.public();

// ── uw (underwriter:access, no org context required) ─────────────────
export const testUwQuery = uwQuery
	.handler(async () => ({ ok: true as const }))
	.public();

export const testUwMutation = uwMutation
	.handler(async () => ({ ok: true as const }))
	.public();

// ── deal ─────────────────────────────────────────────────────────────
export const testDealQuery = dealQuery
	.handler(async () => ({ ok: true as const }))
	.public();

export const testDealMutation = dealMutation
	.handler(async () => ({ ok: true as const }))
	.public();

// ── ledger ───────────────────────────────────────────────────────────
export const testLedgerQuery = ledgerQuery
	.handler(async () => ({ ok: true as const }))
	.public();
