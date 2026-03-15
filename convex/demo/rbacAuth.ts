import { query } from "../_generated/server";

/** Lightweight demo stats for the RBAC security overview page. */
export const getSecurityOverviewStats = query({
	args: {},
	handler: async (ctx) => {
		const [users, roles, organizations, pendingRequests] = await Promise.all([
			ctx.db.query("users").collect(),
			ctx.db.query("roles").collect(),
			ctx.db.query("organizations").collect(),
			ctx.db
				.query("onboardingRequests")
				.withIndex("by_status", (q) => q.eq("status", "pending_review"))
				.collect(),
		]);

		return {
			userCount: users.length,
			roleCount: roles.length,
			orgCount: organizations.length,
			pendingRequestCount: pendingRequests.length,
		};
	},
});
