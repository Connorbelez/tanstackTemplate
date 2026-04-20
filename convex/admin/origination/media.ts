import { v } from "convex/values";
import { authedQuery, requirePermission } from "../../fluent";

const originationQuery = authedQuery.use(
	requirePermission("mortgage:originate")
);

export const getStorageUrls = originationQuery
	.input({
		storageIds: v.array(v.id("_storage")),
	})
	.handler(async (ctx, args) => {
		return await Promise.all(
			args.storageIds.map(async (storageId) => ({
				storageId,
				url: await ctx.storage.getUrl(storageId),
			}))
		);
	})
	.public();
