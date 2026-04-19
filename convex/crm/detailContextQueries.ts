import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { readDealDocumentPackageSurface } from "../documents/dealPackages";
import { listMortgageBlueprintRows } from "../documents/mortgageBlueprints";
import { crmQuery } from "../fluent";
import { readListingPublicDocuments } from "../listings/publicDocuments";
import { buildCollectionPlanEntryRow } from "../payments/collectionPlan/readModels";

function toBorrowerName(args: {
	firstName?: string;
	lastName?: string;
}): string | null {
	const name = [args.firstName, args.lastName].filter(Boolean).join(" ").trim();
	return name.length > 0 ? name : null;
}

async function getUserByAuthId(
	ctx: Pick<QueryCtx, "db">,
	authId: string | undefined
) {
	if (!authId) {
		return null;
	}

	return ctx.db
		.query("users")
		.withIndex("authId", (query) => query.eq("authId", authId))
		.unique();
}

type CrmDetailQueryCtx = Pick<QueryCtx, "db" | "storage"> & {
	viewer: {
		orgId?: string;
	};
};

async function requireListingForDetailContext(
	ctx: CrmDetailQueryCtx,
	listingId: Id<"listings">
) {
	const orgId = ctx.viewer.orgId;
	if (!orgId) {
		throw new ConvexError("Org context required");
	}

	const listing = await ctx.db.get(listingId);
	if (!listing) {
		throw new ConvexError("Listing not found");
	}

	if (!listing.mortgageId) {
		throw new ConvexError("Listing not found or access denied");
	}

	const mortgage = await ctx.db.get(listing.mortgageId);
	if (!mortgage?.orgId || mortgage.orgId !== orgId) {
		throw new ConvexError("Listing not found or access denied");
	}

	return { listing, mortgage };
}

async function loadListingDetailProjectionContext(
	ctx: CrmDetailQueryCtx,
	args: {
		listing: Doc<"listings">;
		mortgage: Doc<"mortgages">;
	}
) {
	return Promise.all([
		args.listing.propertyId ? ctx.db.get(args.listing.propertyId) : null,
		ctx.db
			.query("mortgageValuationSnapshots")
			.withIndex("by_mortgage_created_at", (query) =>
				query.eq("mortgageId", args.mortgage._id)
			)
			.order("desc")
			.first(),
	]);
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

		const [
			property,
			borrowerLinks,
			listing,
			obligations,
			collectionPlanEntries,
			collectionAttempts,
			transferRequests,
			auditEvents,
			latestValuationSnapshot,
			latestExternalCollectionSchedule,
			originationCase,
			documentBlueprints,
		] = await Promise.all([
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
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (q) =>
					q.eq("mortgageId", args.mortgageId)
				)
				.collect(),
			ctx.db
				.query("collectionAttempts")
				.withIndex("by_mortgage_status", (q) =>
					q.eq("mortgageId", args.mortgageId)
				)
				.collect(),
			ctx.db
				.query("transferRequests")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
				.collect(),
			ctx.db
				.query("auditJournal")
				.withIndex("by_mortgage", (q) =>
					q.eq("mortgageId", String(args.mortgageId))
				)
				.collect(),
			ctx.db
				.query("mortgageValuationSnapshots")
				.withIndex("by_mortgage_created_at", (q) =>
					q.eq("mortgageId", args.mortgageId)
				)
				.order("desc")
				.first(),
			mortgage.activeExternalCollectionScheduleId
				? ctx.db.get(mortgage.activeExternalCollectionScheduleId)
				: ctx.db
						.query("externalCollectionSchedules")
						.withIndex("by_mortgage", (q) =>
							q.eq("mortgageId", args.mortgageId)
						)
						.order("desc")
						.first(),
			mortgage.workflowSourceType === "admin_origination_case" &&
			mortgage.workflowSourceId
				? ctx.db.get(mortgage.workflowSourceId as Id<"adminOriginationCases">)
				: Promise.resolve(null),
			listMortgageBlueprintRows(ctx, {
				includeArchived: true,
				mortgageId: args.mortgageId,
			}),
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
		const paymentSetupObligations = [...obligations]
			.sort((left, right) => left.dueDate - right.dueDate)
			.map((obligation) => ({
				amount: obligation.amount,
				amountSettled: obligation.amountSettled,
				dueDate: obligation.dueDate,
				obligationId: obligation._id,
				paymentNumber: obligation.paymentNumber,
				status: obligation.status,
				type: obligation.type,
			}));
		const paymentSetupPlanEntries = await Promise.all(
			[...collectionPlanEntries]
				.sort((left, right) => left.scheduledDate - right.scheduledDate)
				.map((entry) => buildCollectionPlanEntryRow(ctx, entry))
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
						dataSource: listing.dataSource,
						listingId: listing._id,
						monthlyPayment: listing.monthlyPayment,
						paymentFrequency: listing.paymentFrequency,
						title: listing.title ?? null,
						status: listing.status,
						principal: listing.principal,
						interestRate: listing.interestRate,
						ltvRatio: listing.ltvRatio,
						publishedAt: listing.publishedAt ?? null,
						updatedAt: listing.updatedAt,
					}
				: null,
			latestValuationSnapshot: latestValuationSnapshot
				? {
						createdByUserId: latestValuationSnapshot.createdByUserId,
						relatedDocumentAssetId:
							latestValuationSnapshot.relatedDocumentAssetId ?? null,
						source: latestValuationSnapshot.source,
						valueAsIs: latestValuationSnapshot.valueAsIs,
						valuationSnapshotId: latestValuationSnapshot._id,
						valuationDate: latestValuationSnapshot.valuationDate,
					}
				: null,
			paymentSetup: {
				activationLastAttemptAt:
					originationCase?.collectionsDraft?.lastAttemptAt ?? null,
				activationLastError:
					originationCase?.collectionsDraft?.lastError ?? null,
				activationRetryCount:
					originationCase?.collectionsDraft?.retryCount ?? 0,
				activationSelectedBankAccountId:
					originationCase?.collectionsDraft?.selectedBankAccountId ?? null,
				activationStatus:
					originationCase?.collectionsDraft?.activationStatus ?? null,
				collectionAttemptCount: collectionAttempts.length,
				collectionExecutionMode: mortgage.collectionExecutionMode ?? null,
				collectionExecutionProviderCode:
					mortgage.collectionExecutionProviderCode ?? null,
				collectionPlanEntryCount: collectionPlanEntries.length,
				collectionPlanEntries: paymentSetupPlanEntries,
				externalSchedule: latestExternalCollectionSchedule
					? {
							activatedAt: latestExternalCollectionSchedule.activatedAt ?? null,
							bankAccountId: latestExternalCollectionSchedule.bankAccountId,
							externalScheduleRef:
								latestExternalCollectionSchedule.externalScheduleRef ?? null,
							lastSyncErrorMessage:
								latestExternalCollectionSchedule.lastSyncErrorMessage ?? null,
							lastSyncedAt:
								latestExternalCollectionSchedule.lastSyncedAt ?? null,
							nextPollAt: latestExternalCollectionSchedule.nextPollAt ?? null,
							providerCode: latestExternalCollectionSchedule.providerCode,
							scheduleId: latestExternalCollectionSchedule._id,
							status: latestExternalCollectionSchedule.status,
						}
					: null,
				obligationCount: obligations.length,
				obligations: paymentSetupObligations,
				originationCaseId: originationCase?._id ?? null,
				scheduleRuleMissing:
					mortgage.paymentBootstrapScheduleRuleMissing ?? false,
				transferRequestCount: transferRequests.length,
			},
			documents: await Promise.all(
				documentBlueprints.map(async (blueprint) => {
					const asset = blueprint.assetId
						? await ctx.db.get(blueprint.assetId)
						: null;
					return {
						archivedAt: blueprint.archivedAt ?? null,
						asset: asset
							? {
									assetId: asset._id,
									fileRef: asset.fileRef,
									name: asset.name,
									url: await ctx.storage.getUrl(asset.fileRef),
								}
							: null,
						blueprintId: blueprint._id,
						class: blueprint.class,
						description: blueprint.description ?? null,
						displayName: blueprint.displayName,
						displayOrder: blueprint.displayOrder,
						packageLabel: blueprint.packageLabel ?? null,
						status: blueprint.status,
						templateId: blueprint.templateId ?? null,
						templateName: blueprint.templateSnapshotMeta?.templateName ?? null,
						templateVersion: blueprint.templateVersion ?? null,
					};
				})
			),
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

export const getListingDetailContext = crmQuery
	.input({
		listingId: v.id("listings"),
	})
	.handler(async (ctx, args) => {
		const { listing, mortgage } = await requireListingForDetailContext(
			ctx,
			args.listingId
		);
		const [property, latestValuationSnapshot] =
			await loadListingDetailProjectionContext(ctx, {
				listing,
				mortgage,
			});
		const publicDocuments = await readListingPublicDocuments(
			ctx,
			args.listingId
		);

		return {
			latestValuationSnapshot: latestValuationSnapshot
				? {
						createdByUserId: latestValuationSnapshot.createdByUserId,
						relatedDocumentAssetId:
							latestValuationSnapshot.relatedDocumentAssetId ?? null,
						source: latestValuationSnapshot.source,
						valueAsIs: latestValuationSnapshot.valueAsIs,
						valuationDate: latestValuationSnapshot.valuationDate,
					}
				: null,
			listing: {
				adminNotes: listing.adminNotes ?? null,
				dataSource: listing.dataSource,
				description: listing.description ?? null,
				displayOrder: listing.displayOrder ?? null,
				featured: listing.featured,
				heroImages: listing.heroImages,
				listingId: listing._id,
				marketplaceCopy: listing.marketplaceCopy ?? null,
				publicDocumentIds: listing.publicDocumentIds,
				seoSlug: listing.seoSlug ?? null,
				status: listing.status,
				title: listing.title ?? null,
				updatedAt: listing.updatedAt,
			},
			mortgage: {
				interestRate: mortgage.interestRate,
				lienPosition: mortgage.lienPosition,
				listingId: listing._id,
				loanType: mortgage.loanType,
				maturityDate: mortgage.maturityDate,
				mortgageId: mortgage._id,
				paymentAmount: mortgage.paymentAmount,
				paymentFrequency: mortgage.paymentFrequency,
				principal: mortgage.principal,
				rateType: mortgage.rateType,
				status: mortgage.status,
				termMonths: mortgage.termMonths,
			},
			property: property
				? {
						city: property.city,
						latitude: property.latitude ?? null,
						longitude: property.longitude ?? null,
						postalCode: property.postalCode,
						propertyId: property._id,
						propertyType: property.propertyType,
						province: property.province,
						streetAddress: property.streetAddress,
						unit: property.unit ?? null,
					}
				: null,
			publicDocuments,
		};
	})
	.public();

export const getDealDetailContext = crmQuery
	.input({
		dealId: v.id("deals"),
	})
	.handler(async (ctx, args) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required");
		}

		const deal = await ctx.db.get(args.dealId);
		if (!deal) {
			throw new ConvexError("Deal not found");
		}

		const mortgage = await ctx.db.get(deal.mortgageId);
		if (!mortgage || mortgage.orgId !== orgId) {
			throw new ConvexError("Deal not found or access denied");
		}

		const [
			property,
			lenderUser,
			sellerUser,
			recentAuditEvents,
			packageSurface,
		] = await Promise.all([
			ctx.db.get(mortgage.propertyId),
			getUserByAuthId(ctx, deal.buyerId),
			getUserByAuthId(ctx, deal.sellerId),
			ctx.db
				.query("auditJournal")
				.withIndex("by_entity", (query) =>
					query.eq("entityType", "deal").eq("entityId", String(args.dealId))
				)
				.collect(),
			readDealDocumentPackageSurface(ctx, args.dealId),
		]);

		const lender = lenderUser
			? {
					email: lenderUser.email ?? null,
					name:
						toBorrowerName({
							firstName: lenderUser.firstName,
							lastName: lenderUser.lastName,
						}) ??
						lenderUser.email ??
						deal.buyerId,
					userId: lenderUser._id,
				}
			: {
					email: deal.buyerId.includes("@") ? deal.buyerId : null,
					name: deal.buyerId,
					userId: null,
				};
		const seller = sellerUser
			? {
					email: sellerUser.email ?? null,
					name:
						toBorrowerName({
							firstName: sellerUser.firstName,
							lastName: sellerUser.lastName,
						}) ??
						sellerUser.email ??
						deal.sellerId,
					userId: sellerUser._id,
				}
			: {
					email: deal.sellerId.includes("@") ? deal.sellerId : null,
					name: deal.sellerId,
					userId: null,
				};

		return {
			mortgage: {
				interestRate: mortgage.interestRate,
				mortgageId: mortgage._id,
				principal: mortgage.principal,
				status: mortgage.status,
			},
			property: property
				? {
						city: property.city,
						propertyId: property._id,
						propertyType: property.propertyType,
						province: property.province,
						streetAddress: property.streetAddress,
						unit: property.unit ?? null,
					}
				: null,
			parties: {
				lawyer: deal.lawyerId
					? {
							lawyerId: deal.lawyerId,
							lawyerType: deal.lawyerType ?? null,
						}
					: null,
				lender,
				seller,
			},
			documentPackage: packageSurface.package,
			documentInstances: packageSurface.instances,
			recentAuditEvents: [...recentAuditEvents]
				.sort((left, right) => right.timestamp - left.timestamp)
				.slice(0, 6)
				.map((event) => ({
					eventId: event.eventId,
					eventType: event.eventType,
					newState: event.newState,
					outcome: event.outcome,
					previousState: event.previousState,
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
