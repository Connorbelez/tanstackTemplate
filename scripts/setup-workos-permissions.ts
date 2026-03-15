import { WorkOS } from "@workos-inc/node";
import { config } from "dotenv";

config({ path: ".env.local" });

interface PermissionDefinition {
	description: string;
	name: string;
	pathPattern?: string;
	slug: string;
}

interface AuthorizationRole {
	permissions: string[];
	slug: string;
}

interface AuthorizationPermission {
	slug: string;
}

const PERMISSIONS: PermissionDefinition[] = [
	{
		slug: "admin:access",
		name: "Admin Access",
		description: "Access admin routes",
		pathPattern: "/admin/*",
	},
	{
		slug: "broker:access",
		name: "Broker Access",
		description: "Access broker routes",
		pathPattern: "/broker/*",
	},
	{
		slug: "borrower:access",
		name: "Borrower Access",
		description: "Access borrower routes",
		pathPattern: "/borrower/*",
	},
	{
		slug: "lender:access",
		name: "Lender Access",
		description: "Access lender routes",
		pathPattern: "/lender/*",
	},
	{
		slug: "underwriter:access",
		name: "Underwriter Access",
		description: "Access underwriting admin routes",
		pathPattern: "/admin/underwriting/*",
	},
	{
		slug: "lawyer:access",
		name: "Lawyer Access",
		description: "Access lawyer routes",
		pathPattern: "/lawyer/*",
	},
	{
		slug: "onboarding:access",
		name: "Onboarding Access",
		description: "Access onboarding routes",
		pathPattern: "/onboard/*",
	},
	{
		slug: "onboarding:review",
		name: "Review Onboarding",
		description: "Review onboarding requests",
	},
	{
		slug: "onboarding:manage",
		name: "Manage Onboarding",
		description: "Manage onboarding workflows",
	},
	{
		slug: "role:assign",
		name: "Assign Roles",
		description: "Assign roles to users",
	},
	{
		slug: "application:create",
		name: "Create Application",
		description: "Submit new applications",
	},
	{
		slug: "application:triage",
		name: "Triage Application",
		description: "Run or override automated triage",
	},
	{
		slug: "application:review",
		name: "Review Application",
		description: "Review underwriting decisions",
	},
	{
		slug: "application:manage",
		name: "Manage Applications",
		description: "Exercise full control over applications",
	},
	{
		slug: "underwriting:view_queue",
		name: "View Underwriting Queue",
		description: "See application packages in the underwriting pool",
	},
	{
		slug: "underwriting:claim",
		name: "Claim Underwriting Package",
		description: "Claim an application package from the queue",
	},
	{
		slug: "underwriting:release",
		name: "Release Underwriting Claim",
		description: "Release an underwriter's own claim back to the queue",
	},
	{
		slug: "underwriting:recommend",
		name: "Recommend Underwriting Decision",
		description: "Submit an underwriting recommendation pending sign-off",
	},
	{
		slug: "underwriting:decide",
		name: "Decide Underwriting Outcome",
		description: "Submit an underwriting decision with immediate effect",
	},
	{
		slug: "underwriting:review_decisions",
		name: "Review Underwriting Decisions",
		description: "Review junior underwriter decisions",
	},
	{
		slug: "underwriting:review_samples",
		name: "Review Underwriting Samples",
		description: "Review sampled underwriting decisions after the fact",
	},
	{
		slug: "underwriting:reassign",
		name: "Reassign Underwriting Claims",
		description: "Force release or reassign another underwriter claim",
	},
	{
		slug: "underwriting:configure_queue",
		name: "Configure Underwriting Queue",
		description: "Configure underwriting queue policies and SLAs",
	},
	{
		slug: "underwriting:view_all",
		name: "View All Underwriting Claims",
		description: "See all in-flight underwriting claims",
	},
	{
		slug: "underwriting:view_team_metrics",
		name: "View Underwriting Team Metrics",
		description: "View underwriting team throughput and SLA metrics",
	},
	{
		slug: "offer:create",
		name: "Create Offer",
		description: "Generate provisional offers",
	},
	{
		slug: "offer:manage",
		name: "Manage Offers",
		description: "Manage offer follow-ups and expiry",
	},
	{
		slug: "condition:submit",
		name: "Submit Conditions",
		description: "Upload evidence and fulfill conditions",
	},
	{
		slug: "condition:review",
		name: "Review Conditions",
		description: "Approve or reject submitted conditions",
	},
	{
		slug: "condition:waive",
		name: "Waive Conditions",
		description: "Waive conditions entirely",
	},
	{
		slug: "mortgage:originate",
		name: "Originate Mortgage",
		description: "Create funded mortgages from packages",
	},
	{
		slug: "mortgage:service",
		name: "Service Mortgage",
		description: "Manage the active mortgage lifecycle",
	},
	{
		slug: "mortgage:view_own",
		name: "View Own Mortgage",
		description: "View a borrower's own mortgages",
	},
	{
		slug: "payment:manage",
		name: "Manage Payments",
		description: "Manage collection and workout plans",
	},
	{
		slug: "payment:view_own",
		name: "View Own Payments",
		description: "View a borrower's own payments",
	},
	{
		slug: "payment:reschedule_own",
		name: "Reschedule Own Payments",
		description: "Reschedule a borrower's at-risk payment entries",
	},
	{
		slug: "document:upload",
		name: "Upload Documents",
		description: "Upload documents",
	},
	{
		slug: "document:review",
		name: "Review Documents",
		description: "Review uploaded documents",
	},
	{
		slug: "document:generate",
		name: "Generate Documents",
		description: "Generate commitment documents",
	},
	{
		slug: "document:sign",
		name: "Sign Documents",
		description: "Sign documents as a borrower",
	},
	{
		slug: "listing:create",
		name: "Create Listings",
		description: "Create marketplace listings",
	},
	{
		slug: "listing:manage",
		name: "Manage Listings",
		description: "Manage listings and lender filters",
	},
	{
		slug: "listing:view",
		name: "View Listings",
		description: "View the marketplace as a lender",
	},
	{
		slug: "listing:invest",
		name: "Invest in Listings",
		description: "Purchase listing fractions as a lender",
	},
	{
		slug: "portfolio:view",
		name: "View Portfolio",
		description: "View an investment portfolio",
	},
	{
		slug: "portfolio:signal_renewal",
		name: "Signal Portfolio Renewal",
		description: "Signal lender renewal intent",
	},
	{
		slug: "portfolio:export_tax",
		name: "Export Tax Documents",
		description: "Export tax documents",
	},
	{
		slug: "renewal:signal",
		name: "Signal Renewal",
		description: "Signal borrower renewal intent",
	},
	{
		slug: "renewal:acknowledge",
		name: "Acknowledge Renewal",
		description: "Acknowledge borrower renewal intents as a broker",
	},
	{
		slug: "renewal:manage",
		name: "Manage Renewals",
		description: "Manage renewal workflows",
	},
	{
		slug: "org:manage_members",
		name: "Manage Organization Members",
		description: "Manage organization members",
	},
	{
		slug: "org:manage_settings",
		name: "Manage Organization Settings",
		description: "Manage organization settings",
	},
	{
		slug: "platform:manage_users",
		name: "Manage Platform Users",
		description: "Manage all platform users",
	},
	{
		slug: "platform:manage_orgs",
		name: "Manage Platform Organizations",
		description: "Manage all organizations",
	},
	{
		slug: "platform:manage_roles",
		name: "Manage Platform Roles",
		description: "Manage role definitions",
	},
	{
		slug: "platform:view_audit",
		name: "View Platform Audit",
		description: "View audit logs",
	},
	{
		slug: "platform:manage_system",
		name: "Manage Platform System",
		description: "Manage system configuration",
	},
];

function getRequiredEnv(name: string): string {
	const value = process.env[name]?.trim();

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

function getUniquePermissionSlugs(
	definitions: PermissionDefinition[]
): string[] {
	const slugs = new Set<string>();

	for (const permission of definitions) {
		if (slugs.has(permission.slug)) {
			throw new Error(`Duplicate permission slug: ${permission.slug}`);
		}

		slugs.add(permission.slug);
	}

	return [...slugs];
}

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	if ("status" in error && error.status === 404) {
		return true;
	}

	if ("statusCode" in error && error.statusCode === 404) {
		return true;
	}

	if ("message" in error && typeof error.message === "string") {
		return error.message.includes("404");
	}

	return false;
}

async function getRole(
	workos: WorkOS,
	roleSlug: string
): Promise<AuthorizationRole | null> {
	try {
		const response = await workos.get<AuthorizationRole>(
			`/authorization/roles/${roleSlug}`
		);
		return response.data;
	} catch (error) {
		if (isNotFoundError(error)) {
			return null;
		}

		throw error;
	}
}

async function getPermission(
	workos: WorkOS,
	permissionSlug: string
): Promise<AuthorizationPermission | null> {
	try {
		const response = await workos.get<AuthorizationPermission>(
			`/authorization/permissions/${permissionSlug}`
		);
		return response.data;
	} catch (error) {
		if (isNotFoundError(error)) {
			return null;
		}

		throw error;
	}
}

async function createRole(
	workos: WorkOS,
	role: {
		slug: string;
		name: string;
		description: string;
	}
): Promise<AuthorizationRole> {
	const response = await workos.post<
		AuthorizationRole,
		{ slug: string; name: string; description: string }
	>("/authorization/roles", role);

	return response.data;
}

async function createPermission(
	workos: WorkOS,
	permission: {
		slug: string;
		name: string;
		description: string;
	}
): Promise<AuthorizationPermission> {
	const response = await workos.post<
		AuthorizationPermission,
		{ slug: string; name: string; description: string }
	>("/authorization/permissions", permission);

	return response.data;
}

async function setRolePermissions(
	workos: WorkOS,
	roleSlug: string,
	permissions: string[]
): Promise<AuthorizationRole> {
	const response = await workos.put<
		AuthorizationRole,
		{ permissions: string[] }
	>(`/authorization/roles/${roleSlug}/permissions`, {
		permissions,
	});

	return response.data;
}

async function main() {
	const apiKey = getRequiredEnv("WORKOS_API_KEY");
	const roleSlug =
		process.env.WORKOS_PERMISSION_CATALOG_ROLE_SLUG?.trim() ||
		"permission-catalog";
	const roleName =
		process.env.WORKOS_PERMISSION_CATALOG_ROLE_NAME?.trim() ||
		"Permission Catalog";
	const roleDescription =
		process.env.WORKOS_PERMISSION_CATALOG_ROLE_DESCRIPTION?.trim() ||
		"Catalog role used to seed and maintain platform permission slugs.";

	const workos = new WorkOS(apiKey);
	const permissionSlugs = getUniquePermissionSlugs(PERMISSIONS);
	const existingRole = await getRole(workos, roleSlug);

	console.log(
		"Seeding WorkOS permission slugs via a dedicated catalog role..."
	);

	if (existingRole) {
		console.log(`Using existing role: ${roleSlug}`);
	} else {
		await createRole(workos, {
			slug: roleSlug,
			name: roleName,
			description: roleDescription,
		});
		console.log(`Created role: ${roleSlug}`);
	}

	for (const permission of PERMISSIONS) {
		const existingPermission = await getPermission(workos, permission.slug);

		if (existingPermission) {
			console.log(`Using existing permission: ${permission.slug}`);
			continue;
		}

		await createPermission(workos, {
			slug: permission.slug,
			name: permission.name,
			description: permission.description,
		});
		console.log(`Created permission: ${permission.slug}`);
	}

	const updatedRole = await setRolePermissions(
		workos,
		roleSlug,
		permissionSlugs
	);

	console.log(
		`Seeded ${updatedRole.permissions.length} permissions onto role "${updatedRole.slug}".`
	);

	for (const permission of PERMISSIONS) {
		const suffix = permission.pathPattern
			? ` -> ${permission.pathPattern}`
			: "";
		console.log(`- ${permission.slug}: ${permission.description}${suffix}`);
	}
}

main().catch((error: unknown) => {
	console.error("Failed to seed WorkOS permissions.");
	console.error(error);
	process.exit(1);
});
