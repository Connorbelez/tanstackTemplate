import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { authKit } from "../auth";
import { authedAction, authedQuery } from "../fluent";

export const getUserOrganizations = authedQuery
	.input({ userWorkosId: v.string() })
	.handler(async (ctx, args) => {
		const memberships = await ctx.db
			.query("organizationMemberships")
			.withIndex("byUser", (q) => q.eq("userWorkosId", args.userWorkosId))
			.collect();

		const results = await Promise.all(
			memberships.map(async (membership) => {
				const organization = await ctx.db
					.query("organizations")
					.withIndex("workosId", (q) =>
						q.eq("workosId", membership.organizationWorkosId)
					)
					.unique();
				return { membership, organization: organization ?? undefined };
			})
		);

		return results;
	})
	.public();

export const listRoles = authedQuery
	.handler(async (ctx) => {
		return await ctx.db.query("roles").collect();
	})
	.public();

export const getActionLogs = authedQuery
	.handler(async (ctx) => {
		return await ctx.db.query("demo_auth_action_logs").order("desc").take(50);
	})
	.public();

// ── Internal mutations for syncing API data to Convex ────────────────

export const upsertOrganizationFromApi = internalMutation({
	args: {
		workosId: v.string(),
		name: v.string(),
		allowProfilesOutsideOrganization: v.boolean(),
		externalId: v.optional(v.string()),
		metadata: v.optional(v.record(v.string(), v.string())),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("organizations")
			.withIndex("workosId", (q) => q.eq("workosId", args.workosId))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, args);
		} else {
			await ctx.db.insert("organizations", args);
		}
	},
});

export const upsertMembershipFromApi = internalMutation({
	args: {
		workosId: v.string(),
		organizationWorkosId: v.string(),
		organizationName: v.optional(v.string()),
		userWorkosId: v.string(),
		status: v.string(),
		roleSlug: v.string(),
		roleSlugs: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("organizationMemberships")
			.withIndex("workosId", (q) => q.eq("workosId", args.workosId))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, args);
		} else {
			await ctx.db.insert("organizationMemberships", args);
		}
	},
});

export const upsertRoleFromApi = internalMutation({
	args: {
		slug: v.string(),
		permissions: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("roles")
			.withIndex("slug", (q) => q.eq("slug", args.slug))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, { permissions: args.permissions });
		} else {
			await ctx.db.insert("roles", args);
		}
	},
});

export const upsertUserFromApi = internalMutation({
	args: {
		authId: v.string(),
		email: v.string(),
		firstName: v.string(),
		lastName: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("users")
			.withIndex("authId", (q) => q.eq("authId", args.authId))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				email: args.email,
				firstName: args.firstName,
				lastName: args.lastName,
			});
		} else {
			await ctx.db.insert("users", args);
		}
	},
});

// ── Full sync action ─────────────────────────────────────────────────

export const syncAllFromWorkosApi = authedAction
	.handler(async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}

		const userId = identity.subject;
		let userCount = 0;
		let orgCount = 0;
		let membershipCount = 0;
		let roleCount = 0;

		// 0. Sync current user to our users table
		const workosUser = await authKit.workos.userManagement.getUser(userId);
		await ctx.runMutation(internal.demo.workosAuth.upsertUserFromApi, {
			authId: workosUser.id,
			email: workosUser.email,
			firstName: workosUser.firstName ?? "",
			lastName: workosUser.lastName ?? "",
		});
		userCount++;

		// 0b. Touch user in WorkOS to generate a fresh user.updated event,
		// then trigger the component's event poll so it picks up the user
		// in its internal table.
		await authKit.workos.userManagement.updateUser({
			userId,
			firstName: workosUser.firstName ?? undefined,
			lastName: workosUser.lastName ?? undefined,
		});
		const apiKey = process.env.WORKOS_API_KEY;
		if (apiKey) {
			await ctx.runMutation(authKit.component.lib.enqueueWebhookEvent, {
				apiKey,
				eventId: `sync-${Date.now()}`,
				event: "user.updated",
				eventTypes: authKit.options?.additionalEventTypes,
			});
		}

		// 1. Sync all organizations
		// NOTE: Only fetches first page of results. For accounts with many orgs/roles,
		// pagination would need to be implemented using WorkOS cursor-based pagination.
		const orgsResult = await authKit.workos.organizations.listOrganizations();
		for (const org of orgsResult.data) {
			await ctx.runMutation(
				internal.demo.workosAuth.upsertOrganizationFromApi,
				{
					workosId: org.id,
					name: org.name,
					allowProfilesOutsideOrganization:
						org.allowProfilesOutsideOrganization,
					externalId: org.externalId ?? undefined,
					metadata: org.metadata,
				}
			);
			orgCount++;

			// 1b. Sync roles for each organization
			const rolesResult =
				await authKit.workos.organizations.listOrganizationRoles({
					organizationId: org.id,
				});
			for (const role of rolesResult.data) {
				await ctx.runMutation(internal.demo.workosAuth.upsertRoleFromApi, {
					slug: role.slug,
					permissions: role.permissions,
				});
				roleCount++;
			}
		}

		// 2. Sync current user's memberships
		const membershipsResult =
			await authKit.workos.userManagement.listOrganizationMemberships({
				userId,
			});
		for (const m of membershipsResult.data) {
			const org = orgsResult.data.find((o) => o.id === m.organizationId);
			await ctx.runMutation(internal.demo.workosAuth.upsertMembershipFromApi, {
				workosId: m.id,
				organizationWorkosId: m.organizationId,
				organizationName: org?.name ?? "Unknown",
				userWorkosId: m.userId,
				status: m.status,
				roleSlug: m.role?.slug ?? "",
				roleSlugs: m.roles?.map((r) => r.slug),
			});
			membershipCount++;
		}

		return { userCount, orgCount, membershipCount, roleCount };
	})
	.public();
