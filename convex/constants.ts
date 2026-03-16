// ── Well-known WorkOS Organization IDs ─────────────────────────────
// Used by org assignment rules and auth middleware.

export const FAIRLEND_STAFF_ORG_ID = "org_01KKF56VABM4NYFFSR039RTJBM";
export const FAIRLEND_BROKERAGE_ORG_ID = "org_01KKKKGXEBW1MA5NFEZVHZS7WG";
export const FAIRLEND_LAWYERS_ORG_ID = "org_01KKRSS95YC96QA7M42C2ERVSM";

// ── Requestable Roles ──────────────────────────────────────────────
// Roles that can be requested through the onboarding approval flow.
// Excludes: borrower (auto-assigned), member (default), uw_manager (removed)
export const REQUESTABLE_ROLES = [
	"broker",
	"lender",
	"lawyer",
	"admin",
	"jr_underwriter",
	"underwriter",
	"sr_underwriter",
] as const;

export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];
