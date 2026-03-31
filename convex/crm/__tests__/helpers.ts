/**
 * Shared test harness and seed helpers for CRM (EAV) integration tests.
 */

import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { convexModules } from "../../test/moduleMaps";
import { registerAuditLogComponent } from "../../test/registerAuditLogComponent";

const modules = convexModules;

// ── Identity Fixtures ───────────────────────────────────────────────

export const CRM_ADMIN_IDENTITY = {
	subject: "test-crm-admin",
	issuer: "https://api.workos.com",
	org_id: "org_crm_test_001",
	organization_name: "CRM Test Org",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["widgets:users-table:manage"]),
	user_email: "crm-admin@test.fairlend.ca",
	user_first_name: "CRM",
	user_last_name: "Admin",
};

export const CRM_USER_IDENTITY = {
	subject: "test-crm-user",
	issuer: "https://api.workos.com",
	org_id: "org_crm_test_001",
	organization_name: "CRM Test Org",
	role: "member",
	roles: JSON.stringify(["member"]),
	permissions: JSON.stringify([]),
	user_email: "crm-user@test.fairlend.ca",
	user_first_name: "CRM",
	user_last_name: "User",
};

export const DIFFERENT_ORG_IDENTITY = {
	subject: "test-other-org-admin",
	issuer: "https://api.workos.com",
	org_id: "org_other_test_002",
	organization_name: "Other Org",
	role: "admin",
	roles: JSON.stringify(["admin"]),
	permissions: JSON.stringify(["widgets:users-table:manage"]),
	user_email: "other-admin@test.fairlend.ca",
	user_first_name: "Other",
	user_last_name: "Admin",
};

// ── Harness Factory ─────────────────────────────────────────────────

export type CrmTestHarness = ReturnType<typeof convexTest>;

export function createCrmTestHarness(): CrmTestHarness {
	const t = convexTest(schema, modules);
	registerAuditLogComponent(t, "auditLog");
	return t;
}

/**
 * Returns an identity-scoped handle for calling public (authed) CRM mutations/queries.
 */
export function asAdmin(t: CrmTestHarness) {
	return t.withIdentity(CRM_ADMIN_IDENTITY);
}

export function asUser(t: CrmTestHarness) {
	return t.withIdentity(CRM_USER_IDENTITY);
}

export function asDifferentOrg(t: CrmTestHarness) {
	return t.withIdentity(DIFFERENT_ORG_IDENTITY);
}

// ── Seed Config Types ───────────────────────────────────────────────

export interface FieldSeedConfig {
	fieldType: Doc<"fieldDefs">["fieldType"];
	isRequired?: boolean;
	name: string;
	options?: Array<{
		value: string;
		label: string;
		color: string;
		order: number;
	}>;
}

export interface CrmTestFixture {
	defaultViewId: Id<"viewDefs">;
	fieldDefs: Record<string, Id<"fieldDefs">>;
	objectDefId: Id<"objectDefs">;
}

// ── Seed Helpers ────────────────────────────────────────────────────

/**
 * Seeds an objectDef + fieldDefs and returns IDs for the created entities
 * plus the auto-created default view.
 */
export async function seedObjectWithFields(
	t: CrmTestHarness,
	config: { name: string; fields: FieldSeedConfig[] }
): Promise<CrmTestFixture> {
	const admin = asAdmin(t);

	// Create objectDef
	const objectDefId = await admin.mutation(api.crm.objectDefs.createObject, {
		name: config.name,
		singularLabel: config.name,
		pluralLabel: `${config.name}s`,
		icon: "box",
	});

	// Create each field
	const fieldDefs: Record<string, Id<"fieldDefs">> = {};
	for (const field of config.fields) {
		const fieldDefId = await admin.mutation(api.crm.fieldDefs.createField, {
			objectDefId,
			name: field.name,
			label: field.name.charAt(0).toUpperCase() + field.name.slice(1),
			fieldType: field.fieldType,
			isRequired: field.isRequired,
			options: field.options,
		});
		fieldDefs[field.name] = fieldDefId;
	}

	// Fetch the auto-created default view
	const views = await admin.query(api.crm.viewDefs.listViews, {
		objectDefId,
	});
	const defaultView = views.find((v) => v.isDefault);
	if (!defaultView) {
		throw new Error("Expected auto-created default view, but none found");
	}

	return { objectDefId, fieldDefs, defaultViewId: defaultView._id };
}

/**
 * Seeds a single record on an existing objectDef.
 */
export async function seedRecord(
	t: CrmTestHarness,
	objectDefId: Id<"objectDefs">,
	values: Record<string, unknown>
): Promise<Id<"records">> {
	const admin = asAdmin(t);
	return admin.mutation(api.crm.records.createRecord, {
		objectDefId,
		values,
	});
}
