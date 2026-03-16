/**
 * Static display metadata for roles and permissions.
 * Maps role/permission slugs to human-readable labels, descriptions, icons, and colors
 * for use in stakeholder-facing demo pages.
 */

// ROLE_PERMISSIONS is imported from "#/test/auth/permissions" directly by consumers.

// ── Role Display Metadata ───────────────────────────────────────────

export interface RoleDisplayMeta {
	color: string;
	description: string;
	icon: string;
	label: string;
}

/** Human-readable metadata for each role, keyed by slug. */
export const ROLE_DISPLAY_METADATA: Record<string, RoleDisplayMeta> = {
	admin: {
		label: "Administrator",
		description:
			"Full platform control — manages users, orgs, roles, and system settings",
		icon: "Shield",
		color: "red",
	},
	broker: {
		label: "Mortgage Broker",
		description:
			"Creates applications, manages offers, and services mortgages for borrowers",
		icon: "Briefcase",
		color: "blue",
	},
	lender: {
		label: "Lender / Investor",
		description:
			"Views marketplace listings, invests in fractions, and manages portfolio",
		icon: "Landmark",
		color: "green",
	},
	borrower: {
		label: "Borrower",
		description:
			"Submits documents, views own mortgage and payments, signs agreements",
		icon: "User",
		color: "purple",
	},
	lawyer: {
		label: "Lawyer",
		description:
			"Reviews deals and provides legal oversight during transactions",
		icon: "Scale",
		color: "amber",
	},
	jr_underwriter: {
		label: "Junior Underwriter",
		description:
			"Claims packages from queue, reviews conditions, submits recommendations",
		icon: "ClipboardCheck",
		color: "sky",
	},
	underwriter: {
		label: "Underwriter",
		description:
			"Full underwriting authority — decides outcomes and reviews junior decisions",
		icon: "FileSearch",
		color: "indigo",
	},
	sr_underwriter: {
		label: "Senior Underwriter",
		description:
			"Manages queue policies, reassigns claims, reviews sampled decisions",
		icon: "Crown",
		color: "violet",
	},
	member: {
		label: "Member",
		description:
			"Default role after sign-up — can access onboarding to request a role",
		icon: "UserPlus",
		color: "gray",
	},
};

// ── Permission Display Metadata ─────────────────────────────────────

export interface PermissionDisplayMeta {
	description: string;
	domain: string;
	name: string;
}

/** Human-readable metadata for each permission, keyed by slug. */
export const PERMISSION_DISPLAY_METADATA: Record<
	string,
	PermissionDisplayMeta
> = {
	"admin:access": {
		name: "Admin Access",
		description: "Access admin routes",
		domain: "access",
	},
	"broker:access": {
		name: "Broker Access",
		description: "Access broker routes",
		domain: "access",
	},
	"borrower:access": {
		name: "Borrower Access",
		description: "Access borrower routes",
		domain: "access",
	},
	"lender:access": {
		name: "Lender Access",
		description: "Access lender routes",
		domain: "access",
	},
	"underwriter:access": {
		name: "Underwriter Access",
		description: "Access underwriting admin routes",
		domain: "access",
	},
	"lawyer:access": {
		name: "Lawyer Access",
		description: "Access lawyer routes",
		domain: "access",
	},
	"onboarding:access": {
		name: "Onboarding Access",
		description: "Access onboarding routes",
		domain: "onboarding",
	},
	"onboarding:review": {
		name: "Review Onboarding",
		description: "Review onboarding requests",
		domain: "onboarding",
	},
	"onboarding:manage": {
		name: "Manage Onboarding",
		description: "Manage onboarding workflows",
		domain: "onboarding",
	},
	"role:assign": {
		name: "Assign Roles",
		description: "Assign roles to users",
		domain: "platform",
	},
	"application:create": {
		name: "Create Application",
		description: "Submit new applications",
		domain: "application",
	},
	"application:triage": {
		name: "Triage Application",
		description: "Run or override automated triage",
		domain: "application",
	},
	"application:review": {
		name: "Review Application",
		description: "Review underwriting decisions",
		domain: "application",
	},
	"application:manage": {
		name: "Manage Applications",
		description: "Exercise full control over applications",
		domain: "application",
	},
	"underwriting:view_queue": {
		name: "View Underwriting Queue",
		description: "See application packages in the underwriting pool",
		domain: "underwriting",
	},
	"underwriting:claim": {
		name: "Claim Underwriting Package",
		description: "Claim an application package from the queue",
		domain: "underwriting",
	},
	"underwriting:release": {
		name: "Release Underwriting Claim",
		description: "Release an underwriter's own claim back to the queue",
		domain: "underwriting",
	},
	"underwriting:recommend": {
		name: "Recommend Decision",
		description: "Submit an underwriting recommendation pending sign-off",
		domain: "underwriting",
	},
	"underwriting:decide": {
		name: "Decide Outcome",
		description: "Submit an underwriting decision with immediate effect",
		domain: "underwriting",
	},
	"underwriting:review_decisions": {
		name: "Review Decisions",
		description: "Review junior underwriter decisions",
		domain: "underwriting",
	},
	"underwriting:review_samples": {
		name: "Review Samples",
		description: "Review sampled underwriting decisions after the fact",
		domain: "underwriting",
	},
	"underwriting:reassign": {
		name: "Reassign Claims",
		description: "Force release or reassign another underwriter claim",
		domain: "underwriting",
	},
	"underwriting:configure_queue": {
		name: "Configure Queue",
		description: "Configure underwriting queue policies and SLAs",
		domain: "underwriting",
	},
	"underwriting:view_all": {
		name: "View All Claims",
		description: "See all in-flight underwriting claims",
		domain: "underwriting",
	},
	"underwriting:view_team_metrics": {
		name: "View Team Metrics",
		description: "View underwriting team throughput and SLA metrics",
		domain: "underwriting",
	},
	"offer:create": {
		name: "Create Offer",
		description: "Generate provisional offers",
		domain: "offer",
	},
	"offer:manage": {
		name: "Manage Offers",
		description: "Manage offer follow-ups and expiry",
		domain: "offer",
	},
	"condition:submit": {
		name: "Submit Conditions",
		description: "Upload evidence and fulfill conditions",
		domain: "condition",
	},
	"condition:review": {
		name: "Review Conditions",
		description: "Approve or reject submitted conditions",
		domain: "condition",
	},
	"condition:waive": {
		name: "Waive Conditions",
		description: "Waive conditions entirely",
		domain: "condition",
	},
	"mortgage:originate": {
		name: "Originate Mortgage",
		description: "Create funded mortgages from packages",
		domain: "mortgage",
	},
	"mortgage:service": {
		name: "Service Mortgage",
		description: "Manage the active mortgage lifecycle",
		domain: "mortgage",
	},
	"mortgage:view_own": {
		name: "View Own Mortgage",
		description: "View a borrower's own mortgages",
		domain: "mortgage",
	},
	"payment:manage": {
		name: "Manage Payments",
		description: "Manage collection and workout plans",
		domain: "payment",
	},
	"payment:view_own": {
		name: "View Own Payments",
		description: "View a borrower's own payments",
		domain: "payment",
	},
	"payment:reschedule_own": {
		name: "Reschedule Own Payments",
		description: "Reschedule a borrower's at-risk payment entries",
		domain: "payment",
	},
	"document:upload": {
		name: "Upload Documents",
		description: "Upload documents",
		domain: "document",
	},
	"document:review": {
		name: "Review Documents",
		description: "Review uploaded documents",
		domain: "document",
	},
	"document:generate": {
		name: "Generate Documents",
		description: "Generate commitment documents",
		domain: "document",
	},
	"document:sign": {
		name: "Sign Documents",
		description: "Sign documents as a borrower",
		domain: "document",
	},
	"listing:create": {
		name: "Create Listings",
		description: "Create marketplace listings",
		domain: "listing",
	},
	"listing:manage": {
		name: "Manage Listings",
		description: "Manage listings and lender filters",
		domain: "listing",
	},
	"listing:view": {
		name: "View Listings",
		description: "View the marketplace as a lender",
		domain: "listing",
	},
	"listing:invest": {
		name: "Invest in Listings",
		description: "Purchase listing fractions as a lender",
		domain: "listing",
	},
	"portfolio:view": {
		name: "View Portfolio",
		description: "View an investment portfolio",
		domain: "portfolio",
	},
	"portfolio:signal_renewal": {
		name: "Signal Renewal",
		description: "Signal lender renewal intent",
		domain: "portfolio",
	},
	"portfolio:export_tax": {
		name: "Export Tax Documents",
		description: "Export tax documents",
		domain: "portfolio",
	},
	"deal:view": {
		name: "View Deals",
		description: "View deal records",
		domain: "deal",
	},
	"deal:manage": {
		name: "Manage Deals",
		description: "Create and manage deal records",
		domain: "deal",
	},
	"ledger:view": {
		name: "View Ledger",
		description: "View ledger entries and balances",
		domain: "ledger",
	},
	"ledger:correct": {
		name: "Correct Ledger",
		description: "Correct ledger entries",
		domain: "ledger",
	},
	"accrual:view": {
		name: "View Accruals",
		description: "View accrual records",
		domain: "accrual",
	},
	"dispersal:view": {
		name: "View Dispersals",
		description: "View dispersal records",
		domain: "dispersal",
	},
	"obligation:waive": {
		name: "Waive Obligations",
		description: "Waive borrower obligations",
		domain: "obligation",
	},
	"renewal:signal": {
		name: "Signal Renewal",
		description: "Signal borrower renewal intent",
		domain: "renewal",
	},
	"renewal:acknowledge": {
		name: "Acknowledge Renewal",
		description: "Acknowledge borrower renewal intents as a broker",
		domain: "renewal",
	},
	"renewal:manage": {
		name: "Manage Renewals",
		description: "Manage renewal workflows",
		domain: "renewal",
	},
	"org:manage_members": {
		name: "Manage Org Members",
		description: "Manage organization members",
		domain: "platform",
	},
	"org:manage_settings": {
		name: "Manage Org Settings",
		description: "Manage organization settings",
		domain: "platform",
	},
	"platform:manage_users": {
		name: "Manage Platform Users",
		description: "Manage all platform users",
		domain: "platform",
	},
	"platform:manage_orgs": {
		name: "Manage Platform Orgs",
		description: "Manage all organizations",
		domain: "platform",
	},
	"platform:manage_roles": {
		name: "Manage Platform Roles",
		description: "Manage role definitions",
		domain: "platform",
	},
	"platform:view_audit": {
		name: "View Platform Audit",
		description: "View audit logs",
		domain: "platform",
	},
	"platform:manage_system": {
		name: "Manage Platform System",
		description: "Manage system configuration",
		domain: "platform",
	},
};

// ── Permission Domains ──────────────────────────────────────────────

/** All unique domain names extracted from permission metadata. */
export const PERMISSION_DOMAINS = Object.entries(
	PERMISSION_DISPLAY_METADATA
).reduce<Record<string, string[]>>((acc, [slug, meta]) => {
	if (!acc[meta.domain]) {
		acc[meta.domain] = [];
	}
	acc[meta.domain].push(slug);
	return acc;
}, {});

/** Domain display labels. */
export const DOMAIN_LABELS: Record<string, string> = {
	access: "Route Access",
	onboarding: "Onboarding",
	platform: "Platform Admin",
	application: "Applications",
	underwriting: "Underwriting",
	offer: "Offers",
	condition: "Conditions",
	mortgage: "Mortgages",
	payment: "Payments",
	document: "Documents",
	listing: "Marketplace",
	portfolio: "Portfolio",
	deal: "Deals",
	ledger: "Ledger",
	accrual: "Accruals",
	dispersal: "Dispersals",
	obligation: "Obligations",
	renewal: "Renewals",
};

/** Color classes for each domain (Tailwind bg + text). */
export const DOMAIN_COLORS: Record<string, { bg: string; text: string }> = {
	access: { bg: "bg-slate-100", text: "text-slate-700" },
	onboarding: { bg: "bg-emerald-100", text: "text-emerald-700" },
	platform: { bg: "bg-red-100", text: "text-red-700" },
	application: { bg: "bg-blue-100", text: "text-blue-700" },
	underwriting: { bg: "bg-indigo-100", text: "text-indigo-700" },
	offer: { bg: "bg-amber-100", text: "text-amber-700" },
	condition: { bg: "bg-orange-100", text: "text-orange-700" },
	mortgage: { bg: "bg-teal-100", text: "text-teal-700" },
	payment: { bg: "bg-cyan-100", text: "text-cyan-700" },
	document: { bg: "bg-purple-100", text: "text-purple-700" },
	listing: { bg: "bg-lime-100", text: "text-lime-700" },
	portfolio: { bg: "bg-green-100", text: "text-green-700" },
	deal: { bg: "bg-sky-100", text: "text-sky-700" },
	ledger: { bg: "bg-yellow-100", text: "text-yellow-700" },
	accrual: { bg: "bg-fuchsia-100", text: "text-fuchsia-700" },
	dispersal: { bg: "bg-pink-100", text: "text-pink-700" },
	obligation: { bg: "bg-rose-100", text: "text-rose-700" },
	renewal: { bg: "bg-violet-100", text: "text-violet-700" },
};

/** Role color → Tailwind classes mapping. */
export const ROLE_COLOR_CLASSES: Record<
	string,
	{ badge: string; bg: string; border: string }
> = {
	red: {
		badge: "bg-red-100 text-red-700 border-red-200",
		bg: "bg-red-50",
		border: "border-red-200",
	},
	blue: {
		badge: "bg-blue-100 text-blue-700 border-blue-200",
		bg: "bg-blue-50",
		border: "border-blue-200",
	},
	green: {
		badge: "bg-green-100 text-green-700 border-green-200",
		bg: "bg-green-50",
		border: "border-green-200",
	},
	purple: {
		badge: "bg-purple-100 text-purple-700 border-purple-200",
		bg: "bg-purple-50",
		border: "border-purple-200",
	},
	amber: {
		badge: "bg-amber-100 text-amber-700 border-amber-200",
		bg: "bg-amber-50",
		border: "border-amber-200",
	},
	sky: {
		badge: "bg-sky-100 text-sky-700 border-sky-200",
		bg: "bg-sky-50",
		border: "border-sky-200",
	},
	indigo: {
		badge: "bg-indigo-100 text-indigo-700 border-indigo-200",
		bg: "bg-indigo-50",
		border: "border-indigo-200",
	},
	violet: {
		badge: "bg-violet-100 text-violet-700 border-violet-200",
		bg: "bg-violet-50",
		border: "border-violet-200",
	},
	gray: {
		badge: "bg-gray-100 text-gray-700 border-gray-200",
		bg: "bg-gray-50",
		border: "border-gray-200",
	},
};
