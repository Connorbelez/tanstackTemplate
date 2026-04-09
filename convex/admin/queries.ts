import { v } from "convex/values";
import { adminQuery } from "../fluent";

const adminEntityTypeValidator = v.union(
	v.literal("mortgages"),
	v.literal("properties"),
	v.literal("listings"),
	v.literal("deals")
);

const adminShellQuery = adminQuery;

export interface AdminEntityListRow {
	id: string;
	status?: string;
	subtitle: string;
	title: string;
	updatedAt?: number;
}

export const listEntityRows = adminShellQuery
	.input({
		entityType: adminEntityTypeValidator,
	})
	.handler(async (ctx, { entityType }): Promise<AdminEntityListRow[]> => {
		switch (entityType) {
			case "mortgages": {
				const [mortgages, properties] = await Promise.all([
					ctx.db.query("mortgages").collect(),
					ctx.db.query("properties").collect(),
				]);
				const propertiesById = new Map(
					properties.map((property) => [property._id, property])
				);

				return mortgages.map((mortgage) => {
					const property = propertiesById.get(mortgage.propertyId);
					const propertyLabel = property
						? `${property.streetAddress}, ${property.city}`
						: `Property ${String(mortgage.propertyId)}`;

					return {
						id: String(mortgage._id),
						title: propertyLabel,
						subtitle: `${mortgage.loanType} mortgage • principal ${new Intl.NumberFormat(
							"en-CA",
							{
								style: "currency",
								currency: "CAD",
								maximumFractionDigits: 0,
							}
						).format(mortgage.principal / 100)}`,
						status: mortgage.status,
						updatedAt: mortgage.lastTransitionAt ?? mortgage.createdAt,
					};
				});
			}
			case "properties": {
				const properties = await ctx.db.query("properties").collect();
				return properties.map((property) => ({
					id: String(property._id),
					title: property.unit
						? `${property.streetAddress}, Unit ${property.unit}`
						: property.streetAddress,
					subtitle: `${property.propertyType} • ${property.city}, ${property.province}`,
					updatedAt: property.createdAt,
				}));
			}
			case "deals": {
				const deals = await ctx.db.query("deals").collect();
				return deals.map((deal) => ({
					id: String(deal._id),
					title: `Deal ${String(deal._id).slice(-6)}`,
					subtitle: `${Math.round(deal.fractionalShare * 100)}% share • mortgage ${String(
						deal.mortgageId
					).slice(-6)}`,
					status: deal.status,
					updatedAt: deal.lastTransitionAt ?? deal.createdAt,
				}));
			}
			case "listings":
				return [];
			default:
				return [];
		}
	})
	.public();
