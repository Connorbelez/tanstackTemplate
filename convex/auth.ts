import { type AuthFunctions, AuthKit } from "@convex-dev/workos-authkit";
import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";
import { convex } from "./fluent";

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
		allowProfilesOutsideOrganization?: boolean;
		externalId?: string | null;
		metadata?: Record<string, string>;
	}
) {
	const existing = await ctx.db
		.query("organizations")
		.withIndex("workosId", (q) => q.eq("workosId", data.id))
		.unique();
	const fields = {
		workosId: data.id,
		name: data.name,
		allowProfilesOutsideOrganization:
			data.allowProfilesOutsideOrganization ?? false,
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
		userId: string;
		status: string;
		role: { slug: string };
		roles?: { slug: string }[];
	}
) {
	// Look up org name from our organizations table (denormalization)
	const org = await ctx.db
		.query("organizations")
		.withIndex("workosId", (q) => q.eq("workosId", data.organizationId))
		.unique();

	const existing = await ctx.db
		.query("organizationMemberships")
		.withIndex("workosId", (q) => q.eq("workosId", data.id))
		.unique();
	const fields = {
		workosId: data.id,
		organizationWorkosId: data.organizationId,
		organizationName: org?.name,
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
		// Demo-only: block Gmail accounts to demonstrate registration denial flow
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
		console.log("Received user.created event for", event.data.id);
		await ctx.db.insert("users", {
			authId: event.data.id,
			email: event.data.email,
			firstName: `${event.data.firstName}`,
			lastName: `${event.data.lastName}`,
		});
	},
	"user.updated": async (ctx, event) => {
		console.log("Received user.updated event for", event.data.id);
		const user = await ctx.db
			.query("users")
			.withIndex("authId", (q) => q.eq("authId", event.data.id))
			.unique();
		if (!user) {
			// User doesn't exist yet (event arrived before user.created, or it was lost).
			// Create the user from event data, then backfill related data from WorkOS.
			console.log(
				`user.updated for unknown user ${event.data.id} — creating and scheduling backfill`
			);
			await ctx.db.insert("users", {
				authId: event.data.id,
				email: event.data.email,
				firstName: `${event.data.firstName}`,
				lastName: `${event.data.lastName}`,
			});
			await ctx.scheduler.runAfter(0, internal.auth.syncUserRelatedData, {
				userId: event.data.id,
			});
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

export const getCurrentUser = convex
	.query()
	.handler(async (ctx) => {
		const user = await authKit.getAuthUser(ctx);
		return user;
	})
	.public();

// ── Backfill: sync a user's orgs, memberships, and roles from WorkOS ─

export const upsertRelatedData = internalMutation({
	args: {
		orgs: v.array(
			v.object({
				workosId: v.string(),
				name: v.string(),
				allowProfilesOutsideOrganization: v.boolean(),
				externalId: v.optional(v.string()),
				metadata: v.optional(v.record(v.string(), v.string())),
			})
		),
		memberships: v.array(
			v.object({
				workosId: v.string(),
				organizationWorkosId: v.string(),
				organizationName: v.optional(v.string()),
				userWorkosId: v.string(),
				status: v.string(),
				roleSlug: v.string(),
				roleSlugs: v.optional(v.array(v.string())),
			})
		),
		roles: v.array(
			v.object({
				slug: v.string(),
				permissions: v.array(v.string()),
			})
		),
	},
	handler: async (ctx, args) => {
		for (const org of args.orgs) {
			await upsertOrganization(ctx, {
				id: org.workosId,
				name: org.name,
				allowProfilesOutsideOrganization: org.allowProfilesOutsideOrganization,
				externalId: org.externalId,
				metadata: org.metadata,
			});
		}
		for (const m of args.memberships) {
			await upsertMembership(ctx, {
				id: m.workosId,
				organizationId: m.organizationWorkosId,
				userId: m.userWorkosId,
				status: m.status,
				role: { slug: m.roleSlug },
				roles: m.roleSlugs?.map((slug) => ({ slug })),
			});
		}
		for (const role of args.roles) {
			await upsertRole(ctx, role);
		}
	},
});

export const syncUserRelatedData = internalAction({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		console.log(
			`[syncUserRelatedData] Backfilling data for user ${args.userId}`
		);

		const orgs: {
			workosId: string;
			name: string;
			allowProfilesOutsideOrganization: boolean;
			externalId?: string;
			metadata?: Record<string, string>;
		}[] = [];
		const memberships: {
			workosId: string;
			organizationWorkosId: string;
			organizationName?: string;
			userWorkosId: string;
			status: string;
			roleSlug: string;
			roleSlugs?: string[];
		}[] = [];
		const roles: { slug: string; permissions: string[] }[] = [];

		// 1. Fetch the user's org memberships from WorkOS
		const membershipsResult =
			await authKit.workos.userManagement.listOrganizationMemberships({
				userId: args.userId,
			});

		const orgIds = new Set<string>();
		for (const m of membershipsResult.data) {
			orgIds.add(m.organizationId);
			memberships.push({
				workosId: m.id,
				organizationWorkosId: m.organizationId,
				userWorkosId: m.userId,
				status: m.status,
				roleSlug: m.role?.slug ?? "",
				roleSlugs: m.roles?.map((r) => r.slug),
			});
		}

		// 2. Fetch each org the user belongs to + its roles
		const seenRoleSlugs = new Set<string>();
		for (const orgId of orgIds) {
			const org = await authKit.workos.organizations.getOrganization(orgId);
			orgs.push({
				workosId: org.id,
				name: org.name,
				allowProfilesOutsideOrganization: org.allowProfilesOutsideOrganization,
				externalId: org.externalId ?? undefined,
				metadata: org.metadata,
			});

			// Denormalize org name onto memberships
			for (const m of memberships) {
				if (m.organizationWorkosId === orgId) {
					m.organizationName = org.name;
				}
			}

			// Fetch roles for this org
			const rolesResult =
				await authKit.workos.organizations.listOrganizationRoles({
					organizationId: orgId,
				});
			for (const role of rolesResult.data) {
				if (!seenRoleSlugs.has(role.slug)) {
					seenRoleSlugs.add(role.slug);
					roles.push({
						slug: role.slug,
						permissions: role.permissions,
					});
				}
			}
		}

		// 3. Write everything in a single mutation
		await ctx.runMutation(internal.auth.upsertRelatedData, {
			orgs,
			memberships,
			roles,
		});

		console.log(
			`[syncUserRelatedData] Done for ${args.userId}: ${orgs.length} orgs, ${memberships.length} memberships, ${roles.length} roles`
		);
	},
});
