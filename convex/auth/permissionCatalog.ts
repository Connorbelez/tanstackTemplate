export const SUPERUSER_PERMISSION = "admin:access" as const;

export interface PermissionDisplayMeta {
	description: string;
	domain: string;
	name: string;
}

export interface PermissionCatalogEntry extends PermissionDisplayMeta {
	grantsAllPermissions?: boolean;
	workos: boolean;
}

export const PERMISSION_DISPLAY_METADATA = {
	"admin:access": {
		name: "Admin Access",
		description: "Access admin routes and satisfy all permission checks",
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
	"payment:view": {
		name: "View Payments",
		description: "View transfer and payment operations",
		domain: "payment",
	},
	"payment:manage": {
		name: "Manage Payments",
		description: "Manage collection and workout plans",
		domain: "payment",
	},
	"payment:retry": {
		name: "Retry Payments",
		description: "Retry failed payment operations",
		domain: "payment",
	},
	"payment:cancel": {
		name: "Cancel Payments",
		description: "Cancel pending or in-flight payment operations",
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
	"payment:webhook_process": {
		name: "Process Payment Webhooks",
		description: "Process or replay provider webhook events",
		domain: "payment",
	},
	"document:upload": {
		name: "Upload Documents",
		description: "Upload documents",
		domain: "document",
	},
	"document:review": {
		name: "Review Documents",
		description: "Review uploaded documents and access sensitive documents",
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
	"cash_ledger:view": {
		name: "View Cash Ledger",
		description: "View cash-ledger balances, journals, and reconciliations",
		domain: "cash_ledger",
	},
	"cash_ledger:correct": {
		name: "Correct Cash Ledger",
		description: "Post corrective cash-ledger operations",
		domain: "cash_ledger",
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
} as const satisfies Record<string, PermissionDisplayMeta>;

export type PermissionSlug = keyof typeof PERMISSION_DISPLAY_METADATA;

export const ROLE_PERMISSIONS = {
	admin: ["admin:access"],
	broker: [
		"broker:access",
		"onboarding:access",
		"application:create",
		"offer:create",
		"offer:manage",
		"condition:submit",
		"mortgage:service",
		"document:upload",
		"deal:view",
		"ledger:view",
		"accrual:view",
		"listing:create",
		"listing:manage",
		"listing:view",
		"renewal:acknowledge",
	],
	lender: [
		"lender:access",
		"onboarding:access",
		"deal:view",
		"ledger:view",
		"accrual:view",
		"dispersal:view",
		"listing:view",
		"listing:invest",
		"portfolio:view",
		"portfolio:signal_renewal",
		"portfolio:export_tax",
	],
	borrower: [
		"borrower:access",
		"onboarding:access",
		"condition:submit",
		"mortgage:view_own",
		"payment:view_own",
		"payment:reschedule_own",
		"document:upload",
		"document:sign",
		"renewal:signal",
	],
	lawyer: ["lawyer:access", "onboarding:access", "deal:view"],
	jr_underwriter: [
		"underwriter:access",
		"application:review",
		"underwriting:view_queue",
		"underwriting:claim",
		"underwriting:release",
		"underwriting:recommend",
		"condition:review",
		"document:review",
	],
	underwriter: [
		"underwriter:access",
		"application:review",
		"underwriting:view_queue",
		"underwriting:claim",
		"underwriting:release",
		"underwriting:decide",
		"underwriting:review_decisions",
		"underwriting:view_team_metrics",
		"condition:review",
		"document:review",
	],
	sr_underwriter: [
		"underwriter:access",
		"application:review",
		"underwriting:view_queue",
		"underwriting:claim",
		"underwriting:release",
		"underwriting:decide",
		"underwriting:review_decisions",
		"underwriting:review_samples",
		"underwriting:reassign",
		"underwriting:configure_queue",
		"underwriting:view_all",
		"underwriting:view_team_metrics",
		"condition:review",
		"document:review",
	],
	member: ["onboarding:access"],
} as const satisfies Record<string, readonly PermissionSlug[]>;

export type RoleSlug = keyof typeof ROLE_PERMISSIONS;

export const ALL_PERMISSION_SLUGS = Object.freeze(
	Object.keys(PERMISSION_DISPLAY_METADATA) as PermissionSlug[]
);

export const PERMISSION_CATALOG = Object.freeze(
	Object.fromEntries(
		ALL_PERMISSION_SLUGS.map((permission) => [
			permission,
			{
				...PERMISSION_DISPLAY_METADATA[permission],
				workos: true,
				grantsAllPermissions: permission === SUPERUSER_PERMISSION,
			},
		])
	) as Record<PermissionSlug, PermissionCatalogEntry>
);

export const WORKOS_PERMISSION_SLUGS = ALL_PERMISSION_SLUGS.filter(
	(permission) => PERMISSION_CATALOG[permission].workos
);

export function hasPermissionGrant(
	permissions: Iterable<string>,
	permission: string
): boolean {
	for (const granted of permissions) {
		if (granted === permission || granted === SUPERUSER_PERMISSION) {
			return true;
		}
	}
	return false;
}

export function hasAnyPermissionGrant(
	permissions: Iterable<string>,
	requiredPermissions: readonly string[]
): boolean {
	return requiredPermissions.some((permission) =>
		hasPermissionGrant(permissions, permission)
	);
}

export function lookupPermissions(roles: readonly string[]): string[] {
	const merged = new Set<string>();
	for (const role of roles) {
		const perms = ROLE_PERMISSIONS[role as RoleSlug];
		if (!perms) {
			throw new Error(`Unknown role: ${role}`);
		}
		for (const permission of perms) {
			merged.add(permission);
		}
	}
	return [...merged];
}
