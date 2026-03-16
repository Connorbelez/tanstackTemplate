import { authedQuery } from "../fluent";

/** Lightweight demo stats for the RBAC security overview page. */
export const getSecurityOverviewStats = authedQuery
	.handler(async (ctx) => {
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
	})
	.public();
