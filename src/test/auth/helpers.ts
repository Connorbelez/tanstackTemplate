/**
 * Shared mock utilities for auth integration tests.
 *
 * Provides mock identity builders, a pre-configured convex-test factory,
 * and user seeding helpers so every test file uses the same patterns.
 */

import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import auditTrailSchema from "../../../convex/components/auditTrail/schema";
import schema from "../../../convex/schema";
import workflowSchema from "../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import { lookupPermissions } from "./permissions";

const modules = {
	...import.meta.glob("../../../convex/_generated/**/*.*s"),
	...import.meta.glob("../../../convex/audit/**/*.*s"),
	...import.meta.glob("../../../convex/auth/**/*.*s"),
	...import.meta.glob("../../../convex/engine/**/*.*s"),
	...import.meta.glob("../../../convex/ledger/**/*.*s"),
	...import.meta.glob("../../../convex/onboarding/**/*.*s"),
	...import.meta.glob("../../../convex/seed/**/*.*s"),
	...import.meta.glob("../../../convex/test/**/*.*s"),
	...import.meta.glob("../../../convex/auditLog.ts"),
	...import.meta.glob("../../../convex/constants.ts"),
	...import.meta.glob("../../../convex/fluent.ts"),
};
const auditTrailModules = import.meta.glob(
	"../../../convex/components/auditTrail/**/*.ts"
);
const workflowModules = import.meta.glob(
	"../../../node_modules/@convex-dev/workflow/dist/component/**/*.js"
);
const workpoolModules = import.meta.glob(
	"../../../node_modules/@convex-dev/workpool/dist/component/**/*.js"
);

// ── Types ────────────────────────────────────────────────────────────

export interface MockIdentity {
	issuer: string;
	org_id?: string;
	organization_name?: string;
	/** JSON-stringified string[] */
	permissions: string;
	role?: string;
	/** JSON-stringified string[] */
	roles: string;
	subject: string;
	user_email: string;
	user_first_name: string;
	user_last_name: string;
	[key: string]: string | undefined;
}

export interface MockViewerOptions {
	email?: string;
	firstName?: string;
	lastName?: string;
	orgId?: string;
	orgName?: string;
	/** If not provided, looked up from ROLE_PERMISSIONS */
	permissions?: string[];
	roles: string[];
	subject?: string;
}

// ── Identity Builders ────────────────────────────────────────────────

/**
 * Build a bare MockIdentity with sensible defaults (member role).
 * Every field can be overridden.
 */
export function createMockIdentity(
	overrides?: Partial<MockIdentity>
): MockIdentity {
	return {
		subject: "user_test_default",
		issuer: "https://api.workos.com",
		role: "member",
		roles: JSON.stringify(["member"]),
		permissions: JSON.stringify(["onboarding:access"]),
		user_email: "test@example.com",
		user_first_name: "Test",
		user_last_name: "User",
		...overrides,
	};
}

/**
 * Build a MockIdentity from a role list. Permissions are automatically
 * resolved via `lookupPermissions` unless explicitly provided.
 */
export function createMockViewer(options: MockViewerOptions): MockIdentity {
	if (options.roles.length === 0) {
		throw new Error("MockViewerOptions.roles must contain at least one role");
	}
	const primaryRole = options.roles[0];
	const resolvedPermissions =
		options.permissions ?? lookupPermissions(options.roles);

	return {
		subject: options.subject ?? `user_${primaryRole}_test`,
		issuer: "https://api.workos.com",
		org_id: options.orgId,
		organization_name: options.orgName,
		role: primaryRole,
		roles: JSON.stringify(options.roles),
		permissions: JSON.stringify(resolvedPermissions),
		user_email: options.email ?? `${primaryRole}@test.fairlend.ca`,
		user_first_name: options.firstName ?? "Test",
		user_last_name: options.lastName ?? "User",
	};
}

// ── Convex Test Factory ──────────────────────────────────────────────

/**
 * Create a convex-test instance with the auditLog component registered.
 */
export function createTestConvex() {
	const t = convexTest(schema, modules);
	auditLogTest.register(t, "auditLog");
	t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
	t.registerComponent("workflow", workflowSchema, workflowModules);
	t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
	return t;
}

// ── Seeding Helpers ──────────────────────────────────────────────────

/**
 * Insert a user row into the `users` table and return its ID.
 */
export async function seedUser(
	t: ReturnType<typeof convexTest>,
	authId: string,
	email: string,
	firstName = "Test",
	lastName = "User"
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("users", {
			authId,
			email,
			firstName,
			lastName,
		});
	});
}

/**
 * Seed a user from a MockIdentity — extracts the relevant fields automatically.
 */
export async function seedFromIdentity(
	t: ReturnType<typeof convexTest>,
	identity: MockIdentity
) {
	return seedUser(
		t,
		identity.subject,
		identity.user_email,
		identity.user_first_name,
		identity.user_last_name
	);
}

/**
 * Seed a user from a MockIdentity if it does not already exist.
 */
export async function ensureSeededIdentity(
	t: ReturnType<typeof convexTest>,
	identity: MockIdentity
) {
	return t.run(async (ctx) => {
		// t.run() context lacks schema-typed indexes; filter is fine for test data
		const existing = await ctx.db
			.query("users")
			.filter((q) => q.eq(q.field("authId"), identity.subject))
			.first();
		if (existing) {
			return existing._id;
		}
		return ctx.db.insert("users", {
			authId: identity.subject,
			email: identity.user_email,
			firstName: identity.user_first_name,
			lastName: identity.user_last_name,
		});
	});
}
