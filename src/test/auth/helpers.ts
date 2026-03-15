/**
 * Shared mock utilities for auth integration tests.
 *
 * Provides mock identity builders, a pre-configured convex-test factory,
 * and user seeding helpers so every test file uses the same patterns.
 */

import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { lookupPermissions } from "./permissions";

const modules = import.meta.glob("../../../convex/**/*.*s");

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
	const resolvedPermissions =
		options.permissions ?? lookupPermissions(options.roles);

	return {
		subject: options.subject ?? `user_${options.roles[0]}_test`,
		issuer: "https://api.workos.com",
		org_id: options.orgId,
		organization_name: options.orgName,
		role: options.roles[0],
		roles: JSON.stringify(options.roles),
		permissions: JSON.stringify(resolvedPermissions),
		user_email: options.email ?? `${options.roles[0]}@test.fairlend.ca`,
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
