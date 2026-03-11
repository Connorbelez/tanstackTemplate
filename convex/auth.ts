import { type AuthFunctions, AuthKit } from "@convex-dev/workos-authkit";
import type { GenericMutationCtx } from "convex/server";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";

const authFunctions: AuthFunctions = internal.auth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
	authFunctions,
	additionalEventTypes: [
		"session.created",
		"organization.created",
		"organization.updated",
		"organization.deleted",
		"organization_membership.created",
		"organization_membership.updated",
		"organization_membership.deleted",
		"organization_membership.added",
		"organization_membership.removed",
		"role.created",
		"role.updated",
		"role.deleted",
		"authentication.email_verification_succeeded",
		"authentication.magic_auth_failed",
		"authentication.magic_auth_succeeded",
		"magic_auth.created",
	],
});

// ── Shared helpers for webhook event handlers ───────────────────────

async function upsertOrganization(
	ctx: GenericMutationCtx<DataModel>,
	data: {
		id: string;
		name: string;
		allowProfilesOutsideOrganization: boolean;
		externalId?: string | null;
		metadata?: Record<string, string>;
	}
) {
	console.log("upsertOrganizationData", data);
	const existing = await ctx.db
		.query("organizations")
		.withIndex("workosId", (q) => q.eq("workosId", data.id))
		.unique();
	const fields = {
		workosId: data.id,
		name: data.name,
		allowProfilesOutsideOrganization: data.allowProfilesOutsideOrganization,
		externalId: data.externalId ?? undefined,
		metadata: data.metadata,
	};
	if (existing) {
		await ctx.db.patch(existing._id, fields);
	} else {
		await ctx.db.insert("organizations", fields);
	}
}

async function deleteOrganization(
	ctx: GenericMutationCtx<DataModel>,
	workosId: string
) {
	const org = await ctx.db
		.query("organizations")
		.withIndex("workosId", (q) => q.eq("workosId", workosId))
		.unique();
	if (org) {
		await ctx.db.delete(org._id);
	}
	// Cascade-delete memberships for this org
	const memberships = await ctx.db
		.query("organizationMemberships")
		.withIndex("byOrganization", (q) => q.eq("organizationWorkosId", workosId))
		.collect();
	for (const m of memberships) {
		await ctx.db.delete(m._id);
	}
}

async function upsertMembership(
	ctx: GenericMutationCtx<DataModel>,
	data: {
		id: string;
		organizationId: string;
		organizationName: string;
		userId: string;
		status: string;
		role: { slug: string };
		roles?: { slug: string }[];
	}
) {
	const existing = await ctx.db
		.query("organizationMemberships")
		.withIndex("workosId", (q) => q.eq("workosId", data.id))
		.unique();
	const fields = {
		workosId: data.id,
		organizationWorkosId: data.organizationId,
		organizationName: data.organizationName,
		userWorkosId: data.userId,
		status: data.status,
		roleSlug: data.role.slug,
		roleSlugs: data.roles?.map((r) => r.slug),
	};
	if (existing) {
		await ctx.db.patch(existing._id, fields);
	} else {
		await ctx.db.insert("organizationMemberships", fields);
	}
}

async function deleteMembership(
	ctx: GenericMutationCtx<DataModel>,
	workosId: string
) {
	const membership = await ctx.db
		.query("organizationMemberships")
		.withIndex("workosId", (q) => q.eq("workosId", workosId))
		.unique();
	if (membership) {
		await ctx.db.delete(membership._id);
	}
}

async function upsertRole(
	ctx: GenericMutationCtx<DataModel>,
	data: { slug: string; permissions: string[] }
) {
	const existing = await ctx.db
		.query("roles")
		.withIndex("slug", (q) => q.eq("slug", data.slug))
		.unique();
	if (existing) {
		await ctx.db.patch(existing._id, { permissions: data.permissions });
	} else {
		await ctx.db.insert("roles", {
			slug: data.slug,
			permissions: data.permissions,
		});
	}
}

async function deleteRole(ctx: GenericMutationCtx<DataModel>, slug: string) {
	const role = await ctx.db
		.query("roles")
		.withIndex("slug", (q) => q.eq("slug", slug))
		.unique();
	if (role) {
		await ctx.db.delete(role._id);
	}
}

// ── Actions (auth hooks that run after auth events) ─────────────────

export const { authKitAction } = authKit.actions({
	userRegistration: async (ctx, action, response) => {
		const email = action.userData.email;
		const isBlocked = email.endsWith("@gmail.com");
		await ctx.db.insert("demo_auth_action_logs", {
			actionType: "userRegistration",
			email,
			verdict: isBlocked ? "Deny" : "Allow",
			message: isBlocked ? "Gmail accounts are not allowed" : undefined,
			timestamp: Date.now(),
		});
		return isBlocked
			? response.deny("Gmail accounts are not allowed")
			: response.allow();
	},
	authentication: async (ctx, action, response) => {
		await ctx.db.insert("demo_auth_action_logs", {
			actionType: "authentication",
			email: action.user?.email ?? "unknown",
			verdict: "Allow",
			timestamp: Date.now(),
		});
		return response.allow();
	},
});

// ── Webhook event handlers ──────────────────────────────────────────

export const { authKitEvent } = authKit.events({
	// ── User events ───────────────────────────────────────────────────
	"user.created": async (ctx, event) => {
		await ctx.db.insert("users", {
			authId: event.data.id,
			email: event.data.email,
			firstName: `${event.data.firstName}`,
			lastName: `${event.data.lastName}`,
		});
	},
	"user.updated": async (ctx, event) => {
		const user = await ctx.db
			.query("users")
			.withIndex("authId", (q) => q.eq("authId", event.data.id))
			.unique();
		if (!user) {
			console.warn(`User not found: ${event.data.id}`);
			return;
		}
		await ctx.db.patch(user._id, {
			email: event.data.email,
			firstName: `${event.data.firstName}`,
			lastName: `${event.data.lastName}`,
		});
	},
	"user.deleted": async (ctx, event) => {
		const user = await ctx.db
			.query("users")
			.withIndex("authId", (q) => q.eq("authId", event.data.id))
			.unique();
		if (!user) {
			console.warn(`User not found: ${event.data.id}`);
			return;
		}
		await ctx.db.delete(user._id);
	},

	// ── Organization events ───────────────────────────────────────────
	"organization.created": async (ctx, event) => {
		await upsertOrganization(ctx, event.data);
	},
	"organization.updated": async (ctx, event) => {
		await upsertOrganization(ctx, event.data);
	},
	"organization.deleted": async (ctx, event) => {
		await deleteOrganization(ctx, event.data.id);
	},

	// ── Membership events ─────────────────────────────────────────────
	"organization_membership.created": async (ctx, event) => {
		await upsertMembership(ctx, event.data);
	},
	"organization_membership.updated": async (ctx, event) => {
		await upsertMembership(ctx, event.data);
	},
	"organization_membership.deleted": async (ctx, event) => {
		await deleteMembership(ctx, event.data.id);
	},
	"organization_membership.added": async (ctx, event) => {
		await upsertMembership(ctx, event.data);
	},
	"organization_membership.removed": async (ctx, event) => {
		await deleteMembership(ctx, event.data.id);
	},

	// ── Role events ───────────────────────────────────────────────────
	"role.created": async (ctx, event) => {
		await upsertRole(ctx, event.data);
	},
	"role.updated": async (ctx, event) => {
		await upsertRole(ctx, event.data);
	},
	"role.deleted": async (ctx, event) => {
		await deleteRole(ctx, event.data.slug);
	},

	// ── Auth diagnostic events (log-only) ─────────────────────────────
	"authentication.email_verification_succeeded": async (_ctx, _event) => {
		console.log("onEmailVerificationSucceeded");
	},
	"authentication.magic_auth_failed": async (_ctx, _event) => {
		console.log("onMagicAuthFailed");
	},
	"authentication.magic_auth_succeeded": async (_ctx, _event) => {
		console.log("onMagicAuthSucceeded");
	},
	"magic_auth.created": async (_ctx, _event) => {
		console.log("onCreateMagicAuth");
	},
	"session.created": async (_ctx, _event) => {
		// Registered via additionalEventTypes — log-only for now
		console.log("onSessionCreated");
	},
});

export const getCurrentUser = query({
	args: {},
	handler: async (ctx, _args) => {
		const user = await authKit.getAuthUser(ctx);
		return user;
	},
});
