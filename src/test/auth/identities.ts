/**
 * Pre-built identity fixtures for auth integration tests.
 *
 * Each fixture represents a realistic user with a specific role, org
 * membership, and resolved permission set. Import these directly in
 * test files to avoid duplicating identity boilerplate.
 */

import { FAIRLEND_STAFF_ORG_ID } from "../../../convex/constants";
import { createMockViewer, type MockIdentity } from "./helpers";

// ── FairLend Staff Admin ─────────────────────────────────────────────
// isFairLendAdmin() === true (admin role + FairLend Staff org)
export const FAIRLEND_ADMIN: MockIdentity = createMockViewer({
	roles: ["admin"],
	orgId: FAIRLEND_STAFF_ORG_ID,
	orgName: "FairLend Staff",
	subject: "user_fairlend_admin",
	email: "admin@fairlend.ca",
	firstName: "FairLend",
	lastName: "Admin",
});

// ── External Org Admin ───────────────────────────────────────────────
// isFairLendAdmin() === false — admin of a non-FairLend org.
// Limited to org-scoped admin permissions only.
export const EXTERNAL_ORG_ADMIN: MockIdentity = createMockViewer({
	roles: ["admin"],
	permissions: ["admin:access", "org:manage_members", "org:manage_settings"],
	orgId: "org_external_test",
	orgName: "External Org",
	subject: "user_external_admin",
	email: "admin@external-org.com",
	firstName: "External",
	lastName: "Admin",
});

// ── Broker ───────────────────────────────────────────────────────────
export const BROKER: MockIdentity = createMockViewer({
	roles: ["broker"],
	orgId: "org_brokerage_test",
	orgName: "Test Brokerage",
	subject: "user_broker_test",
	email: "broker@test.fairlend.ca",
	firstName: "Test",
	lastName: "Broker",
});

// ── Lender ───────────────────────────────────────────────────────────
export const LENDER: MockIdentity = createMockViewer({
	roles: ["lender"],
	orgId: "org_brokerage_test",
	orgName: "Test Brokerage",
	subject: "user_lender_test",
	email: "lender@test.fairlend.ca",
	firstName: "Test",
	lastName: "Lender",
});

// ── Borrower ─────────────────────────────────────────────────────────
export const BORROWER: MockIdentity = createMockViewer({
	roles: ["borrower"],
	orgId: "org_brokerage_test",
	orgName: "Test Brokerage",
	subject: "user_borrower_test",
	email: "borrower@test.fairlend.ca",
	firstName: "Test",
	lastName: "Borrower",
});

// ── Lawyer ───────────────────────────────────────────────────────────
export const LAWYER: MockIdentity = createMockViewer({
	roles: ["lawyer"],
	orgId: "org_lawfirm_test",
	orgName: "Test Law Firm",
	subject: "user_lawyer_test",
	email: "lawyer@test.fairlend.ca",
	firstName: "Test",
	lastName: "Lawyer",
});

// ── Jr Underwriter ───────────────────────────────────────────────────
// No org_id — underwriters bypass org context via role check.
export const JR_UNDERWRITER: MockIdentity = createMockViewer({
	roles: ["jr_underwriter"],
	subject: "user_jr_underwriter_test",
	email: "jr_uw@test.fairlend.ca",
	firstName: "Junior",
	lastName: "Underwriter",
});

// ── Underwriter ──────────────────────────────────────────────────────
// No org_id — underwriters bypass org context via role check.
export const UNDERWRITER: MockIdentity = createMockViewer({
	roles: ["underwriter"],
	subject: "user_underwriter_test",
	email: "uw@test.fairlend.ca",
	firstName: "Test",
	lastName: "Underwriter",
});

// ── Sr Underwriter ───────────────────────────────────────────────────
// No org_id — underwriters bypass org context via role check.
export const SR_UNDERWRITER: MockIdentity = createMockViewer({
	roles: ["sr_underwriter"],
	subject: "user_sr_underwriter_test",
	email: "sr_uw@test.fairlend.ca",
	firstName: "Senior",
	lastName: "Underwriter",
});

// ── Member ───────────────────────────────────────────────────────────
// Lowest privilege: only onboarding:access.
export const MEMBER: MockIdentity = createMockViewer({
	roles: ["member"],
	orgId: "org_brokerage_test",
	orgName: "Test Brokerage",
	subject: "user_member_test",
	email: "member@test.fairlend.ca",
	firstName: "Test",
	lastName: "Member",
});
