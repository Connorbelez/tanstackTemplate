import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { applyComputedFieldValues } from "./entityViewFields";
import type { EntityViewAdapterContract, UnifiedRecord } from "./types";

type ObjectDef = Doc<"objectDefs">;
type UserDoc = Doc<"users">;
type BorrowerDoc = Doc<"borrowers">;
type BrokerDoc = Doc<"brokers">;
type LenderDoc = Doc<"lenders">;
type OrganizationDoc = Doc<"organizations">;
type MortgageDoc = Doc<"mortgages">;
type MortgageBorrowerDoc = Doc<"mortgageBorrowers">;
type PropertyDoc = Doc<"properties">;
type ListingDoc = Doc<"listings">;

const DISPLAY_LABEL_SEPARATOR_REGEX = /[\s._-]+/;

interface EntityViewHydrationArgs {
	adapterContract: EntityViewAdapterContract;
	ctx: QueryCtx;
	objectDef: ObjectDef;
	orgId: string;
	records: readonly UnifiedRecord[];
}

function formatCurrencyAmount(value: number, divisor = 1): string {
	const normalizedValue = value / divisor;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: normalizedValue % 1 === 0 ? 0 : 2,
	}).format(normalizedValue);
}

function toDisplayLabel(value: string): string {
	return value
		.split(DISPLAY_LABEL_SEPARATOR_REGEX)
		.filter((part) => part.length > 0)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

function buildUserDisplayName(
	user: UserDoc | null | undefined
): string | undefined {
	if (!user) {
		return undefined;
	}

	return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

function buildPropertySummary(
	property: PropertyDoc | null | undefined,
	fallbackFields?: Record<string, unknown>
): string | undefined {
	if (property) {
		return [property.streetAddress, property.city, property.province]
			.filter(Boolean)
			.join(", ");
	}

	const city =
		typeof fallbackFields?.city === "string" ? fallbackFields.city : undefined;
	const province =
		typeof fallbackFields?.province === "string"
			? fallbackFields.province
			: undefined;
	const propertyType =
		typeof fallbackFields?.propertyType === "string"
			? toDisplayLabel(fallbackFields.propertyType)
			: undefined;

	return [propertyType, city, province].filter(Boolean).join(" • ");
}

function buildBorrowerSummary(names: readonly string[]): string | undefined {
	if (names.length === 0) {
		return undefined;
	}

	if (names.length === 1) {
		return names[0];
	}

	return `${names[0]} + ${String(names.length - 1)} more`;
}

function buildBrokerRollupSummary(
	broker: BrokerDoc | null | undefined
): string | undefined {
	if (!broker) {
		return undefined;
	}

	const brokerageLabel =
		typeof broker.brokerageName === "string" &&
		broker.brokerageName.trim().length > 0
			? broker.brokerageName.trim()
			: undefined;
	const licenseParts = [broker.licenseProvince, broker.licenseId].filter(
		(part): part is string => typeof part === "string" && part.trim().length > 0
	);
	const licenseLabel =
		licenseParts.length > 0 ? licenseParts.join(" ") : undefined;

	return [brokerageLabel ?? "Brokerage", licenseLabel]
		.filter(Boolean)
		.join(" • ");
}

function buildListingSummary(
	listing: ListingDoc | null | undefined
): string | undefined {
	if (!listing) {
		return undefined;
	}

	const listingTitle =
		typeof listing.title === "string" && listing.title.trim().length > 0
			? listing.title
			: undefined;
	const marketSummary = [
		listing.status ? toDisplayLabel(listing.status) : undefined,
		typeof listing.city === "string" ? listing.city : undefined,
		typeof listing.province === "string" ? listing.province : undefined,
	]
		.filter(Boolean)
		.join(" • ");

	return listingTitle ?? marketSummary;
}

function buildMortgageSummary(args: {
	mortgage: MortgageDoc | null | undefined;
	property?: PropertyDoc | null | undefined;
}): string | undefined {
	if (!args.mortgage) {
		return undefined;
	}

	const propertySummary = buildPropertySummary(args.property);
	const status = toDisplayLabel(args.mortgage.status);
	const principal = formatCurrencyAmount(args.mortgage.principal);

	return [propertySummary, `${status} mortgage`, principal]
		.filter(Boolean)
		.join(" • ");
}

function buildListingMortgageSummary(
	mortgage: MortgageDoc | null | undefined
): string | undefined {
	if (!mortgage) {
		return undefined;
	}

	return [
		toDisplayLabel(mortgage.status),
		formatCurrencyAmount(mortgage.principal),
	]
		.filter(Boolean)
		.join(" • ");
}

async function loadUsersById(
	ctx: QueryCtx,
	userIds: Iterable<string>
): Promise<Map<string, UserDoc>> {
	const users = new Map<string, UserDoc>();

	await Promise.all(
		[...new Set([...userIds])].map(async (userId) => {
			const normalizedId = ctx.db.normalizeId("users", userId);
			if (!normalizedId) {
				return;
			}

			const user = await ctx.db.get(normalizedId);
			if (user) {
				users.set(String(user._id), user);
			}
		})
	);

	return users;
}

async function loadBorrowersById(args: {
	ctx: QueryCtx;
	orgId: string;
	recordIds: Iterable<string>;
}): Promise<Map<string, BorrowerDoc>> {
	const borrowers = new Map<string, BorrowerDoc>();

	await Promise.all(
		[...new Set([...args.recordIds])].map(async (recordId) => {
			const normalizedId = args.ctx.db.normalizeId("borrowers", recordId);
			if (!normalizedId) {
				return;
			}

			const borrower = await args.ctx.db.get(normalizedId);
			if (borrower && borrower.orgId === args.orgId) {
				borrowers.set(String(borrower._id), borrower);
			}
		})
	);

	return borrowers;
}

async function loadBrokersById(args: {
	ctx: QueryCtx;
	orgId: string;
	recordIds: Iterable<string>;
}): Promise<Map<string, BrokerDoc>> {
	const brokers = new Map<string, BrokerDoc>();

	await Promise.all(
		[...new Set([...args.recordIds])].map(async (recordId) => {
			const normalizedId = args.ctx.db.normalizeId("brokers", recordId);
			if (!normalizedId) {
				return;
			}

			const broker = await args.ctx.db.get(normalizedId);
			if (
				broker &&
				(broker.orgId === args.orgId || broker.orgId === undefined)
			) {
				brokers.set(String(broker._id), broker);
			}
		})
	);

	return brokers;
}

async function loadLenderDocsByRecordIds(
	ctx: QueryCtx,
	recordIds: readonly string[]
): Promise<Map<string, LenderDoc>> {
	const lenders = new Map<string, LenderDoc>();

	await Promise.all(
		[...new Set(recordIds)].map(async (recordId) => {
			const normalizedId = ctx.db.normalizeId("lenders", recordId);
			if (!normalizedId) {
				return;
			}

			const lender = await ctx.db.get(normalizedId);
			if (lender) {
				lenders.set(recordId, lender);
			}
		})
	);

	return lenders;
}

async function loadBrokerDocsByRecordIds(
	ctx: QueryCtx,
	recordIds: readonly string[]
): Promise<Map<string, BrokerDoc>> {
	const brokers = new Map<string, BrokerDoc>();

	await Promise.all(
		[...new Set(recordIds)].map(async (recordId) => {
			const normalizedId = ctx.db.normalizeId("brokers", recordId);
			if (!normalizedId) {
				return;
			}

			const broker = await ctx.db.get(normalizedId);
			if (broker) {
				brokers.set(recordId, broker);
			}
		})
	);

	return brokers;
}

async function loadOrganizationsByWorkosIds(
	ctx: QueryCtx,
	workosIds: Iterable<string>
): Promise<Map<string, OrganizationDoc>> {
	const organizations = new Map<string, OrganizationDoc>();
	const uniqueIds = [
		...new Set(
			[...workosIds].filter(
				(id): id is string => typeof id === "string" && id.trim().length > 0
			)
		),
	];

	await Promise.all(
		uniqueIds.map(async (workosId) => {
			const org = await ctx.db
				.query("organizations")
				.withIndex("workosId", (q) => q.eq("workosId", workosId))
				.unique();
			if (org) {
				organizations.set(workosId, org);
			}
		})
	);

	return organizations;
}

async function loadMortgagesById(args: {
	ctx: QueryCtx;
	orgId: string;
	recordIds: Iterable<string>;
}): Promise<Map<string, MortgageDoc>> {
	const mortgages = new Map<string, MortgageDoc>();

	await Promise.all(
		[...new Set([...args.recordIds])].map(async (recordId) => {
			const normalizedId = args.ctx.db.normalizeId("mortgages", recordId);
			if (!normalizedId) {
				return;
			}

			const mortgage = await args.ctx.db.get(normalizedId);
			if (mortgage && mortgage.orgId === args.orgId) {
				mortgages.set(String(mortgage._id), mortgage);
			}
		})
	);

	return mortgages;
}

async function loadPropertiesById(
	ctx: QueryCtx,
	recordIds: Iterable<string>
): Promise<Map<string, PropertyDoc>> {
	const properties = new Map<string, PropertyDoc>();

	await Promise.all(
		[...new Set([...recordIds])].map(async (recordId) => {
			const normalizedId = ctx.db.normalizeId("properties", recordId);
			if (!normalizedId) {
				return;
			}

			const property = await ctx.db.get(normalizedId);
			if (property) {
				properties.set(String(property._id), property);
			}
		})
	);

	return properties;
}

async function loadListingsByMortgageId(
	ctx: QueryCtx,
	mortgageIds: Iterable<string>
): Promise<Map<string, ListingDoc>> {
	const listings = new Map<string, ListingDoc>();

	await Promise.all(
		[...new Set([...mortgageIds])].map(async (mortgageId) => {
			const normalizedId = ctx.db.normalizeId("mortgages", mortgageId);
			if (!normalizedId) {
				return;
			}

			const listing = await ctx.db
				.query("listings")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", normalizedId))
				.unique();

			if (listing) {
				listings.set(mortgageId, listing);
			}
		})
	);

	return listings;
}

function mergeHydratedFields(
	record: UnifiedRecord,
	fields: Record<string, unknown>
): UnifiedRecord {
	return {
		...record,
		fields: {
			...record.fields,
			...fields,
		},
	};
}

async function hydrateListingRecords(
	args: EntityViewHydrationArgs
): Promise<UnifiedRecord[]> {
	const propertyIds = args.records.flatMap((record) =>
		typeof record.fields.propertyId === "string"
			? [record.fields.propertyId]
			: []
	);
	const mortgageIds = args.records.flatMap((record) =>
		typeof record.fields.mortgageId === "string"
			? [record.fields.mortgageId]
			: []
	);
	const [propertiesById, mortgagesById] = await Promise.all([
		loadPropertiesById(args.ctx, propertyIds),
		loadMortgagesById({
			ctx: args.ctx,
			orgId: args.orgId,
			recordIds: mortgageIds,
		}),
	]);

	return args.records.map((record) => {
		const propertyId =
			typeof record.fields.propertyId === "string"
				? record.fields.propertyId
				: undefined;
		const mortgageId =
			typeof record.fields.mortgageId === "string"
				? record.fields.mortgageId
				: undefined;

		return mergeHydratedFields(record, {
			propertySummary: buildPropertySummary(
				propertyId ? propertiesById.get(propertyId) : undefined,
				record.fields
			),
			mortgageSummary: buildListingMortgageSummary(
				mortgageId ? mortgagesById.get(mortgageId) : undefined
			),
		});
	});
}

async function hydrateMortgageRecords(
	args: EntityViewHydrationArgs
): Promise<UnifiedRecord[]> {
	const propertyIds = args.records.flatMap((record) =>
		typeof record.fields.propertyId === "string"
			? [record.fields.propertyId]
			: []
	);
	const propertiesById = await loadPropertiesById(args.ctx, propertyIds);
	const mortgageIds = args.records.map((record) => record._id);
	const [borrowerLinksByMortgageId, listingsByMortgageId] = await Promise.all([
		Promise.all(
			mortgageIds.map(
				async (
					mortgageId
				): Promise<readonly [string, MortgageBorrowerDoc[]]> => {
					const normalizedMortgageId = args.ctx.db.normalizeId(
						"mortgages",
						mortgageId
					);
					if (!normalizedMortgageId) {
						return [mortgageId, []];
					}

					const links = await args.ctx.db
						.query("mortgageBorrowers")
						.withIndex("by_mortgage", (q) =>
							q.eq("mortgageId", normalizedMortgageId)
						)
						.collect();

					return [mortgageId, links];
				}
			)
		).then((entries) => new Map<string, MortgageBorrowerDoc[]>(entries)),
		loadListingsByMortgageId(args.ctx, mortgageIds),
	]);
	const borrowersById = await loadBorrowersById({
		ctx: args.ctx,
		orgId: args.orgId,
		recordIds: [...borrowerLinksByMortgageId.values()].flatMap((links) =>
			links.map((link) => String(link.borrowerId))
		),
	});
	const usersById = await loadUsersById(
		args.ctx,
		[...borrowersById.values()].map((borrower) => String(borrower.userId))
	);

	return args.records.map((record) => {
		const propertyId =
			typeof record.fields.propertyId === "string"
				? record.fields.propertyId
				: undefined;
		const borrowerNames =
			borrowerLinksByMortgageId.get(record._id)?.flatMap((link) => {
				const borrower = borrowersById.get(String(link.borrowerId));
				const user = borrower ? usersById.get(String(borrower.userId)) : null;
				const name = buildUserDisplayName(user);
				return name ? [name] : [];
			}) ?? [];

		return mergeHydratedFields(record, {
			propertySummary: buildPropertySummary(
				propertyId ? propertiesById.get(propertyId) : undefined
			),
			borrowerSummary: buildBorrowerSummary(borrowerNames),
			listingSummary: buildListingSummary(listingsByMortgageId.get(record._id)),
		});
	});
}

async function hydrateObligationRecords(
	args: EntityViewHydrationArgs
): Promise<UnifiedRecord[]> {
	const mortgageIds = args.records.flatMap((record) =>
		typeof record.fields.mortgageId === "string"
			? [record.fields.mortgageId]
			: []
	);
	const borrowerIds = args.records.flatMap((record) =>
		typeof record.fields.borrowerId === "string"
			? [record.fields.borrowerId]
			: []
	);
	const [mortgagesById, borrowersById] = await Promise.all([
		loadMortgagesById({
			ctx: args.ctx,
			orgId: args.orgId,
			recordIds: mortgageIds,
		}),
		loadBorrowersById({
			ctx: args.ctx,
			orgId: args.orgId,
			recordIds: borrowerIds,
		}),
	]);
	const propertiesById = await loadPropertiesById(
		args.ctx,
		[...mortgagesById.values()].map((mortgage) => String(mortgage.propertyId))
	);
	const usersById = await loadUsersById(
		args.ctx,
		[...borrowersById.values()].map((borrower) => String(borrower.userId))
	);

	return args.records.map((record) => {
		const mortgageId =
			typeof record.fields.mortgageId === "string"
				? record.fields.mortgageId
				: undefined;
		const borrowerId =
			typeof record.fields.borrowerId === "string"
				? record.fields.borrowerId
				: undefined;
		const mortgage = mortgageId ? mortgagesById.get(mortgageId) : undefined;
		const borrower = borrowerId ? borrowersById.get(borrowerId) : undefined;

		return mergeHydratedFields(record, {
			mortgageSummary: buildMortgageSummary({
				mortgage,
				property: mortgage
					? propertiesById.get(String(mortgage.propertyId))
					: undefined,
			}),
			borrowerSummary: buildUserDisplayName(
				borrower ? usersById.get(String(borrower.userId)) : undefined
			),
		});
	});
}

async function hydrateBorrowerRecords(
	args: EntityViewHydrationArgs
): Promise<UnifiedRecord[]> {
	const userIds = args.records.flatMap((record) =>
		typeof record.fields.userId === "string" ? [record.fields.userId] : []
	);
	const usersById = await loadUsersById(args.ctx, userIds);

	return args.records.map((record) => {
		const userId =
			typeof record.fields.userId === "string"
				? record.fields.userId
				: undefined;

		return mergeHydratedFields(record, {
			borrowerName: buildUserDisplayName(
				userId ? usersById.get(userId) : undefined
			),
		});
	});
}

async function hydrateLenderRecords(
	args: EntityViewHydrationArgs
): Promise<UnifiedRecord[]> {
	const lenderDocsByRecordId = await loadLenderDocsByRecordIds(
		args.ctx,
		args.records.map((record) => record._id)
	);

	const mergedRecords = args.records.map((record) => {
		const doc = lenderDocsByRecordId.get(record._id);
		if (!doc) {
			return record;
		}

		return mergeHydratedFields(record, {
			userId: String(doc.userId),
			brokerId: String(doc.brokerId),
			orgId: doc.orgId,
		});
	});

	const userIds = mergedRecords.flatMap((record) =>
		typeof record.fields.userId === "string" ? [record.fields.userId] : []
	);
	const brokerIds = mergedRecords.flatMap((record) =>
		typeof record.fields.brokerId === "string" ? [record.fields.brokerId] : []
	);
	const orgIds = mergedRecords.flatMap((record) =>
		typeof record.fields.orgId === "string" ? [record.fields.orgId] : []
	);

	const [usersById, brokersById, organizationsByWorkosId] = await Promise.all([
		loadUsersById(args.ctx, userIds),
		loadBrokersById({
			ctx: args.ctx,
			orgId: args.orgId,
			recordIds: brokerIds,
		}),
		loadOrganizationsByWorkosIds(args.ctx, orgIds),
	]);

	return mergedRecords.map((record) => {
		const userId =
			typeof record.fields.userId === "string"
				? record.fields.userId
				: undefined;
		const brokerId =
			typeof record.fields.brokerId === "string"
				? record.fields.brokerId
				: undefined;
		const orgId =
			typeof record.fields.orgId === "string" ? record.fields.orgId : undefined;

		const user = userId ? usersById.get(userId) : undefined;
		const broker = brokerId ? brokersById.get(brokerId) : undefined;
		const organization = orgId ? organizationsByWorkosId.get(orgId) : undefined;

		return mergeHydratedFields(record, {
			lenderName: buildUserDisplayName(user),
			contactEmail: user?.email,
			contactPhone: user?.phoneNumber,
			brokerSummary: buildBrokerRollupSummary(broker),
			organizationName: organization?.name,
		});
	});
}

async function hydrateBrokerRecords(
	args: EntityViewHydrationArgs
): Promise<UnifiedRecord[]> {
	const brokerDocsByRecordId = await loadBrokerDocsByRecordIds(
		args.ctx,
		args.records.map((record) => record._id)
	);

	const mergedRecords = args.records.map((record) => {
		const doc = brokerDocsByRecordId.get(record._id);
		if (!doc) {
			return record;
		}

		return mergeHydratedFields(record, {
			userId: String(doc.userId),
			orgId: doc.orgId,
		});
	});

	const userIds = mergedRecords.flatMap((record) =>
		typeof record.fields.userId === "string" ? [record.fields.userId] : []
	);
	const orgIds = mergedRecords.flatMap((record) =>
		typeof record.fields.orgId === "string" ? [record.fields.orgId] : []
	);

	const [usersById, organizationsByWorkosId] = await Promise.all([
		loadUsersById(args.ctx, userIds),
		loadOrganizationsByWorkosIds(args.ctx, orgIds),
	]);

	return mergedRecords.map((record) => {
		const userId =
			typeof record.fields.userId === "string"
				? record.fields.userId
				: undefined;
		const orgId =
			typeof record.fields.orgId === "string" ? record.fields.orgId : undefined;

		const user = userId ? usersById.get(userId) : undefined;
		const organization = orgId ? organizationsByWorkosId.get(orgId) : undefined;

		return mergeHydratedFields(record, {
			brokerContactName: buildUserDisplayName(user),
			contactEmail: user?.email,
			contactPhone: user?.phoneNumber,
			organizationName: organization?.name,
		});
	});
}

async function hydrateRecordsForEntity(
	args: EntityViewHydrationArgs
): Promise<UnifiedRecord[]> {
	switch (args.adapterContract.entityType) {
		case "listings":
			return hydrateListingRecords(args);
		case "mortgages":
			return hydrateMortgageRecords(args);
		case "obligations":
			return hydrateObligationRecords(args);
		case "borrowers":
			return hydrateBorrowerRecords(args);
		case "lenders":
			return hydrateLenderRecords(args);
		case "brokers":
			return hydrateBrokerRecords(args);
		default:
			return [...args.records];
	}
}

export async function materializeEntityViewRecords(
	args: EntityViewHydrationArgs
): Promise<UnifiedRecord[]> {
	if (args.records.length === 0) {
		return [];
	}

	const hydratedRecords = await hydrateRecordsForEntity(args);
	return hydratedRecords.map((record) => ({
		...record,
		fields: applyComputedFieldValues({
			adapterContract: args.adapterContract,
			fieldValues: record.fields,
		}),
	}));
}
