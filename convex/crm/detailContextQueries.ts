import { ConvexError, v } from "convex/values";
import { crmQuery } from "../fluent";

function toBorrowerName(args: {
	firstName?: string;
	lastName?: string;
}): string | null {
	const name = [args.firstName, args.lastName].filter(Boolean).join(" ").trim();
	return name.length > 0 ? name : null;
}

export const getMortgageDetailContext = crmQuery
	.input({
		mortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		const mortgage = await ctx.db.get(args.mortgageId);
		if (!mortgage || mortgage.orgId !== orgId) {
			throw new ConvexError("Mortgage not found or access denied");
		}

		const [property, borrowerLinks, listing, obligations, auditEvents] =
			await Promise.all([
				ctx.db.get(mortgage.propertyId),
				ctx.db
					.query("mortgageBorrowers")
					.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
					.collect(),
				ctx.db
					.query("listings")
					.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
					.unique(),
				ctx.db
					.query("obligations")
					.withIndex("by_mortgage_and_date", (q) =>
						q.eq("mortgageId", args.mortgageId)
					)
					.collect(),
				ctx.db
					.query("auditJournal")
					.withIndex("by_mortgage", (q) =>
						q.eq("mortgageId", String(args.mortgageId))
					)
					.collect(),
			]);

		const borrowers = await Promise.all(
			borrowerLinks.map(async (link) => {
				const borrower = await ctx.db.get(link.borrowerId);
				if (!borrower || borrower.orgId !== orgId) {
					return null;
				}

				const user = await ctx.db.get(borrower.userId);
				return {
					borrowerId: borrower._id,
					name:
						toBorrowerName({
							firstName: user?.firstName,
							lastName: user?.lastName,
						}) ?? String(borrower._id),
					role: link.role,
					status: borrower.status,
					idvStatus: borrower.idvStatus ?? null,
				};
			})
		);

		const recentObligations = [...obligations]
			.sort((left, right) => right.dueDate - left.dueDate)
			.slice(0, 6)
			.map((obligation) => ({
				obligationId: obligation._id,
				type: obligation.type,
				status: obligation.status,
				amount: obligation.amount,
				amountSettled: obligation.amountSettled,
				dueDate: obligation.dueDate,
			}));

		const obligationStats = obligations.reduce<Record<string, number>>(
			(stats, obligation) => {
				stats[obligation.status] = (stats[obligation.status] ?? 0) + 1;
				return stats;
			},
			{}
		);

		return {
			property: property
				? {
						propertyId: property._id,
						streetAddress: property.streetAddress,
						unit: property.unit ?? null,
						city: property.city,
						province: property.province,
						postalCode: property.postalCode,
						propertyType: property.propertyType,
					}
				: null,
			borrowers: borrowers.filter(
				(borrower): borrower is NonNullable<(typeof borrowers)[number]> =>
					borrower !== null
			),
			listing: listing
				? {
						listingId: listing._id,
						title: listing.title ?? null,
						status: listing.status,
						principal: listing.principal,
						interestRate: listing.interestRate,
						ltvRatio: listing.ltvRatio,
						publishedAt: listing.publishedAt ?? null,
					}
				: null,
			recentObligations,
			obligationStats,
			recentAuditEvents: [...auditEvents]
				.sort((left, right) => right.timestamp - left.timestamp)
				.slice(0, 6)
				.map((event) => ({
					eventId: event.eventId,
					eventType: event.eventType,
					outcome: event.outcome,
					previousState: event.previousState,
					newState: event.newState,
					timestamp: event.timestamp,
				})),
		};
	})
	.public();

export const getObligationDetailContext = crmQuery
	.input({
		obligationId: v.id("obligations"),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		const obligation = await ctx.db.get(args.obligationId);
		if (!obligation || obligation.orgId !== orgId) {
			throw new ConvexError("Obligation not found or access denied");
		}

		const [mortgage, borrower, correctiveObligations, auditEvents] =
			await Promise.all([
				ctx.db.get(obligation.mortgageId),
				ctx.db.get(obligation.borrowerId),
				ctx.db
					.query("obligations")
					.withIndex("by_source_obligation", (q) =>
						q.eq("sourceObligationId", args.obligationId)
					)
					.collect(),
				ctx.db
					.query("auditJournal")
					.withIndex("by_obligation", (q) =>
						q.eq("obligationId", String(args.obligationId))
					)
					.collect(),
			]);

		if (!mortgage || mortgage.orgId !== orgId) {
			throw new ConvexError("Mortgage context not found or access denied");
		}
		if (!borrower || borrower.orgId !== orgId) {
			throw new ConvexError("Borrower context not found or access denied");
		}

		const [property, user] = await Promise.all([
			ctx.db.get(mortgage.propertyId),
			ctx.db.get(borrower.userId),
		]);

		return {
			mortgage: {
				mortgageId: mortgage._id,
				status: mortgage.status,
				principal: mortgage.principal,
				interestRate: mortgage.interestRate,
				maturityDate: mortgage.maturityDate,
				property: property
					? {
							propertyId: property._id,
							streetAddress: property.streetAddress,
							city: property.city,
							province: property.province,
							propertyType: property.propertyType,
						}
					: null,
			},
			borrower: {
				borrowerId: borrower._id,
				name:
					toBorrowerName({
						firstName: user?.firstName,
						lastName: user?.lastName,
					}) ?? String(borrower._id),
				status: borrower.status,
				idvStatus: borrower.idvStatus ?? null,
				email: user?.email ?? null,
			},
			correctiveObligations: correctiveObligations
				.sort((left, right) => right.createdAt - left.createdAt)
				.map((corrective) => ({
					obligationId: corrective._id,
					type: corrective.type,
					status: corrective.status,
					amount: corrective.amount,
					dueDate: corrective.dueDate,
				})),
			recentAuditEvents: [...auditEvents]
				.sort((left, right) => right.timestamp - left.timestamp)
				.slice(0, 6)
				.map((event) => ({
					eventId: event.eventId,
					eventType: event.eventType,
					outcome: event.outcome,
					previousState: event.previousState,
					newState: event.newState,
					timestamp: event.timestamp,
				})),
		};
	})
	.public();

export const getBorrowerDetailContext = crmQuery
	.input({
		borrowerId: v.id("borrowers"),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		const borrower = await ctx.db.get(args.borrowerId);
		if (!borrower || borrower.orgId !== orgId) {
			throw new ConvexError("Borrower not found or access denied");
		}

		const [user, mortgageLinks, auditEvents] = await Promise.all([
			ctx.db.get(borrower.userId),
			ctx.db
				.query("mortgageBorrowers")
				.withIndex("by_borrower", (q) => q.eq("borrowerId", args.borrowerId))
				.collect(),
			ctx.db
				.query("auditJournal")
				.withIndex("by_entity", (q) =>
					q.eq("entityType", "borrower").eq("entityId", String(args.borrowerId))
				)
				.collect(),
		]);

		const mortgages = await Promise.all(
			mortgageLinks.map(async (link) => {
				const mortgage = await ctx.db.get(link.mortgageId);
				if (!mortgage || mortgage.orgId !== orgId) {
					return null;
				}

				const property = await ctx.db.get(mortgage.propertyId);
				const listing = await ctx.db
					.query("listings")
					.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgage._id))
					.unique();

				return {
					mortgageId: mortgage._id,
					role: link.role,
					status: mortgage.status,
					principal: mortgage.principal,
					interestRate: mortgage.interestRate,
					maturityDate: mortgage.maturityDate,
					property: property
						? {
								propertyId: property._id,
								streetAddress: property.streetAddress,
								city: property.city,
								province: property.province,
							}
						: null,
					listing: listing
						? {
								listingId: listing._id,
								title: listing.title ?? null,
								status: listing.status,
							}
						: null,
				};
			})
		);

		return {
			profile: {
				borrowerId: borrower._id,
				name:
					toBorrowerName({
						firstName: user?.firstName,
						lastName: user?.lastName,
					}) ?? String(borrower._id),
				email: user?.email ?? null,
				status: borrower.status,
				idvStatus: borrower.idvStatus ?? null,
				onboardedAt: borrower.onboardedAt ?? null,
			},
			mortgages: mortgages.filter(
				(mortgage): mortgage is NonNullable<(typeof mortgages)[number]> =>
					mortgage !== null
			),
			recentAuditEvents: [...auditEvents]
				.sort((left, right) => right.timestamp - left.timestamp)
				.slice(0, 6)
				.map((event) => ({
					eventId: event.eventId,
					eventType: event.eventType,
					outcome: event.outcome,
					previousState: event.previousState,
					newState: event.newState,
					timestamp: event.timestamp,
				})),
		};
	})
	.public();
