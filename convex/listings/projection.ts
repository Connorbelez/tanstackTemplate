import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { OriginationListingOverridesDraftValue } from "../admin/origination/validators";
import { listActivePublicStaticBlueprintAssets } from "../documents/mortgageBlueprints";
import { adminMutation, requirePermission } from "../fluent";
import { insertListingRecord, type ListingInsert } from "./create";

type ListingDoc = Doc<"listings">;
type ListingHeroImage = ListingDoc["heroImages"][number];

const CURATED_LISTING_OVERRIDE_KEYS = [
	"title",
	"description",
	"marketplaceCopy",
	"heroImages",
	"featured",
	"displayOrder",
	"adminNotes",
	"seoSlug",
] as const;

type ListingProjectionOverrides = Partial<{
	[K in (typeof CURATED_LISTING_OVERRIDE_KEYS)[number]]: K extends "heroImages"
		? OriginationListingOverridesDraftValue["heroImages"]
		: ListingDoc[K];
}>;

function roundToTwoDecimals(value: number) {
	return Math.round(value * 100) / 100;
}

function trimToUndefined(value: string | undefined) {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]) {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function hasOwn<T extends object, K extends PropertyKey>(
	value: T,
	key: K
): value is T & Record<K, unknown> {
	return Object.hasOwn(value, key);
}

function normalizeHeroImages(
	heroImages: OriginationListingOverridesDraftValue["heroImages"] | undefined
): ListingDoc["heroImages"] | undefined {
	if (heroImages === undefined) {
		return undefined;
	}

	const normalized: ListingHeroImage[] = [];
	for (const value of heroImages) {
		const trimmed =
			typeof value === "string" ? value.trim() : value.storageId.trim();
		if (!trimmed) {
			continue;
		}

		normalized.push({
			caption:
				typeof value === "string" ? undefined : trimToUndefined(value.caption),
			storageId: trimmed as Id<"_storage">,
		});
	}

	return normalized;
}

function normalizeListingOverrides(
	overrides: ListingProjectionOverrides | undefined
) {
	if (!overrides) {
		return undefined;
	}

	return {
		adminNotes: hasOwn(overrides, "adminNotes")
			? trimToUndefined(overrides.adminNotes)
			: undefined,
		description: hasOwn(overrides, "description")
			? trimToUndefined(overrides.description)
			: undefined,
		displayOrder: hasOwn(overrides, "displayOrder")
			? overrides.displayOrder
			: undefined,
		featured: hasOwn(overrides, "featured") ? overrides.featured : undefined,
		heroImages: hasOwn(overrides, "heroImages")
			? normalizeHeroImages(overrides.heroImages)
			: undefined,
		marketplaceCopy: hasOwn(overrides, "marketplaceCopy")
			? trimToUndefined(overrides.marketplaceCopy)
			: undefined,
		seoSlug: hasOwn(overrides, "seoSlug")
			? trimToUndefined(overrides.seoSlug)
			: undefined,
		title: hasOwn(overrides, "title")
			? trimToUndefined(overrides.title)
			: undefined,
	};
}

async function loadProjectionInputs(
	ctx: Pick<MutationCtx, "db">,
	mortgageId: Id<"mortgages">
) {
	const mortgage = await ctx.db.get(mortgageId);
	if (!mortgage) {
		throw new ConvexError("Mortgage no longer exists for listing projection");
	}

	const [
		property,
		existingListing,
		latestValuationSnapshot,
		borrowerLinks,
		obligations,
	] = await Promise.all([
		ctx.db.get(mortgage.propertyId),
		ctx.db
			.query("listings")
			.withIndex("by_mortgage", (query) => query.eq("mortgageId", mortgageId))
			.unique(),
		ctx.db
			.query("mortgageValuationSnapshots")
			.withIndex("by_mortgage_created_at", (query) =>
				query.eq("mortgageId", mortgageId)
			)
			.order("desc")
			.first(),
		ctx.db
			.query("mortgageBorrowers")
			.withIndex("by_mortgage", (query) => query.eq("mortgageId", mortgageId))
			.collect(),
		ctx.db
			.query("obligations")
			.withIndex("by_mortgage", (query) => query.eq("mortgageId", mortgageId))
			.collect(),
	]);

	if (!property) {
		throw new ConvexError("Property no longer exists for listing projection");
	}

	const borrowerRows = await Promise.all(
		borrowerLinks.map(async (link) => {
			const borrower = await ctx.db.get(link.borrowerId);
			if (!borrower) {
				return null;
			}

			const user = await ctx.db.get(borrower.userId);
			return {
				borrower,
				link,
				name: [user?.firstName, user?.lastName]
					.filter(Boolean)
					.join(" ")
					.trim(),
			};
		})
	);

	return {
		borrowers: borrowerRows.filter(
			(row): row is NonNullable<(typeof borrowerRows)[number]> => row !== null
		),
		existingListing,
		latestValuationSnapshot,
		mortgage,
		obligations,
		property,
	};
}

function buildBorrowerSignal(args: {
	borrowers: Awaited<ReturnType<typeof loadProjectionInputs>>["borrowers"];
}) {
	const primaryBorrower =
		args.borrowers.find((row) => row.link.role === "primary") ??
		args.borrowers[0];

	return {
		borrowerCount: args.borrowers.length,
		hasGuarantor: args.borrowers.some((row) => row.link.role === "guarantor"),
		participants: args.borrowers.map((row) => ({
			borrowerId: String(row.borrower._id),
			idvStatus: row.borrower.idvStatus ?? null,
			name: row.name || String(row.borrower._id),
			role: row.link.role,
			status: row.borrower.status,
		})),
		primaryBorrowerId: primaryBorrower
			? String(primaryBorrower.borrower._id)
			: null,
		primaryBorrowerName: primaryBorrower?.name || null,
	};
}

function buildPaymentHistory(args: {
	obligations: Awaited<ReturnType<typeof loadProjectionInputs>>["obligations"];
}) {
	const byStatus = args.obligations.reduce<Record<string, number>>(
		(summary, obligation) => {
			summary[obligation.status] = (summary[obligation.status] ?? 0) + 1;
			return summary;
		},
		{}
	);
	const sortedByDueDate = [...args.obligations].sort(
		(left, right) => right.dueDate - left.dueDate
	);

	return {
		byStatus,
		lastDueDate: sortedByDueDate[0]?.dueDate ?? null,
		totalObligations: args.obligations.length,
		totalOutstanding: args.obligations.reduce(
			(total, obligation) =>
				total + (obligation.amount - obligation.amountSettled),
			0
		),
	};
}

function buildCuratedFieldPatch(args: {
	existingListing: ListingDoc | null;
	normalizedOverrides: ReturnType<typeof normalizeListingOverrides> | undefined;
}) {
	const overrides = args.normalizedOverrides;
	return {
		adminNotes:
			overrides?.adminNotes !== undefined
				? overrides.adminNotes
				: args.existingListing?.adminNotes,
		description:
			overrides?.description !== undefined
				? overrides.description
				: args.existingListing?.description,
		displayOrder:
			overrides?.displayOrder !== undefined
				? overrides.displayOrder
				: args.existingListing?.displayOrder,
		featured:
			overrides?.featured !== undefined
				? overrides.featured
				: (args.existingListing?.featured ?? false),
		heroImages:
			overrides?.heroImages !== undefined
				? overrides.heroImages
				: (args.existingListing?.heroImages ?? []),
		marketplaceCopy:
			overrides?.marketplaceCopy !== undefined
				? overrides.marketplaceCopy
				: args.existingListing?.marketplaceCopy,
		seoSlug:
			overrides?.seoSlug !== undefined
				? overrides.seoSlug
				: args.existingListing?.seoSlug,
		title:
			overrides?.title !== undefined
				? overrides.title
				: args.existingListing?.title,
	};
}

async function resolveProjectedPublicDocumentIds(
	ctx: Pick<MutationCtx, "db">,
	args: { mortgageId: Id<"mortgages"> }
) {
	const publicAssets = await listActivePublicStaticBlueprintAssets(
		ctx,
		args.mortgageId
	);
	return publicAssets.map(({ asset }) => asset.fileRef);
}

export async function syncListingPublicDocumentsProjection(
	ctx: Pick<MutationCtx, "db">,
	args: {
		listingId: Id<"listings">;
		mortgageId: Id<"mortgages">;
		now: number;
	}
) {
	const listing = await ctx.db.get(args.listingId);
	if (!listing) {
		throw new ConvexError(
			"Listing no longer exists for document projection sync"
		);
	}

	const publicDocumentIds = await resolveProjectedPublicDocumentIds(ctx, {
		mortgageId: args.mortgageId,
	});
	if (!arraysEqual(listing.publicDocumentIds, publicDocumentIds)) {
		await ctx.db.patch(args.listingId, {
			publicDocumentIds,
			updatedAt: args.now,
		});
	}

	return publicDocumentIds;
}

function buildProjectionPatch(args: {
	inputs: Awaited<ReturnType<typeof loadProjectionInputs>>;
	now: number;
}) {
	const { latestValuationSnapshot, mortgage, obligations, property } =
		args.inputs;
	const latestAppraisalValueAsIs = latestValuationSnapshot?.valueAsIs;
	const ltvRatio =
		typeof latestAppraisalValueAsIs === "number" && latestAppraisalValueAsIs > 0
			? roundToTwoDecimals(
					(mortgage.principal / latestAppraisalValueAsIs) * 100
				)
			: 0;

	return {
		approximateLatitude: property.latitude,
		approximateLongitude: property.longitude,
		borrowerSignal: buildBorrowerSignal({
			borrowers: args.inputs.borrowers,
		}),
		city: property.city,
		dataSource: "mortgage_pipeline" as const,
		interestRate: mortgage.interestRate,
		latestAppraisalDate: latestValuationSnapshot?.valuationDate,
		latestAppraisalValueAsIs,
		lienPosition: mortgage.lienPosition,
		loanType: mortgage.loanType,
		ltvRatio,
		maturityDate: mortgage.maturityDate,
		monthlyPayment: mortgage.paymentAmount,
		mortgageId: mortgage._id,
		paymentFrequency: mortgage.paymentFrequency,
		paymentHistory: buildPaymentHistory({ obligations }),
		principal: mortgage.principal,
		propertyId: property._id,
		propertyType: property.propertyType,
		province: property.province,
		rateType: mortgage.rateType,
		termMonths: mortgage.termMonths,
		updatedAt: args.now,
	};
}

export async function upsertMortgageListingProjection(
	ctx: MutationCtx,
	args: {
		mortgageId: Id<"mortgages">;
		now: number;
		overrides?: ListingProjectionOverrides;
	}
) {
	const inputs = await loadProjectionInputs(ctx, args.mortgageId);
	const normalizedOverrides = normalizeListingOverrides(args.overrides);
	const curatedPatch = buildCuratedFieldPatch({
		existingListing: inputs.existingListing,
		normalizedOverrides,
	});
	const projectionPatch = buildProjectionPatch({
		inputs,
		now: args.now,
	});

	let listingId = inputs.existingListing?._id ?? null;
	if (inputs.existingListing) {
		await ctx.db.patch(inputs.existingListing._id, {
			...curatedPatch,
			...projectionPatch,
		});
		listingId = inputs.existingListing._id;
	} else {
		const insertedListing: ListingInsert = {
			...curatedPatch,
			...projectionPatch,
			createdAt: args.now,
			delistedAt: undefined,
			delistReason: undefined,
			lastTransitionAt: undefined,
			machineContext: undefined,
			publishedAt: undefined,
			publicDocumentIds: [],
			status: "draft",
			viewCount: 0,
		};
		listingId = await insertListingRecord(ctx, insertedListing);
	}

	if (!listingId) {
		throw new ConvexError("Unable to resolve listing projection id");
	}

	const publicDocumentIds = await syncListingPublicDocumentsProjection(ctx, {
		listingId,
		mortgageId: args.mortgageId,
		now: args.now,
	});

	return {
		listingId,
		publicDocumentIds,
		wasCreated: inputs.existingListing === null,
	};
}

export const refreshListingProjection = adminMutation
	.use(requirePermission("listing:manage"))
	.input({
		listingId: v.id("listings"),
	})
	.handler(async (ctx, args) => {
		const listing = await ctx.db.get(args.listingId);
		if (!listing) {
			throw new ConvexError("Listing not found");
		}
		if (!(listing.dataSource === "mortgage_pipeline" && listing.mortgageId)) {
			throw new ConvexError(
				"Only mortgage-backed listing projections can be refreshed"
			);
		}

		return upsertMortgageListingProjection(ctx, {
			mortgageId: listing.mortgageId,
			now: Date.now(),
		});
	})
	.public();

export function toListingProjectionOverrides(
	overrides: OriginationListingOverridesDraftValue | undefined
): ListingProjectionOverrides | undefined {
	if (!overrides) {
		return undefined;
	}

	return {
		adminNotes: overrides.adminNotes,
		description: overrides.description,
		displayOrder: overrides.displayOrder,
		featured: overrides.featured,
		heroImages: overrides.heroImages,
		marketplaceCopy: overrides.marketplaceCopy,
		seoSlug: overrides.seoSlug,
		title: overrides.title,
	};
}
