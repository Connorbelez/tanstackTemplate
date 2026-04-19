import { v } from "convex/values";
import { viewerCanAccessOrgId } from "../../authz/orgScope";
import { assertOriginationCaseAccess } from "../../authz/origination";
import { authedQuery, requirePermission } from "../../fluent";

const originationQuery = authedQuery.use(
	requirePermission("mortgage:originate")
);

function buildBrokerSortLabel(broker: {
	brokerageName: string | null;
	email: string;
	fullName: string;
}) {
	return [broker.fullName, broker.email, broker.brokerageName ?? ""]
		.filter(Boolean)
		.join(" ");
}

export const getBrokerSearchContext = originationQuery
	.input({
		caseId: v.id("adminOriginationCases"),
	})
	.handler(async (ctx, args) => {
		const caseRecord = await ctx.db.get(args.caseId);
		if (!caseRecord) {
			return null;
		}

		assertOriginationCaseAccess(ctx.viewer, caseRecord);

		const [brokers, users] = await Promise.all([
			ctx.db
				.query("brokers")
				.withIndex("by_status", (query) => query.eq("status", "active"))
				.collect(),
			ctx.db.query("users").collect(),
		]);

		const usersById = new Map(
			users.map((user) => [
				String(user._id),
				{
					email: user.email,
					fullName: [user.firstName, user.lastName].filter(Boolean).join(" "),
				},
			])
		);
		const scopedOrgId = caseRecord.orgId ?? ctx.viewer.orgId;
		const searchResults = brokers
			.filter(
				(broker) =>
					!broker.orgId ||
					viewerCanAccessOrgId(ctx.viewer, broker.orgId ?? scopedOrgId)
			)
			.flatMap((broker) => {
				const user = usersById.get(String(broker.userId));
				if (!user) {
					return [];
				}

				return [
					{
						brokerId: broker._id,
						brokerageName: broker.brokerageName ?? null,
						email: user.email,
						fullName: user.fullName,
						licenseId: broker.licenseId ?? null,
					},
				];
			})
			.sort((left, right) =>
				buildBrokerSortLabel(left).localeCompare(
					buildBrokerSortLabel(right),
					undefined,
					{ sensitivity: "base" }
				)
			);

		return { searchResults };
	})
	.public();
