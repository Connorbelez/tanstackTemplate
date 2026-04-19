import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
	type ActionCtx,
	internalAction,
	internalMutation,
	internalQuery,
} from "../_generated/server";
import { assertDealAccess } from "../authz/resourceAccess";
import { adminAction, dealQuery, requirePermissionAction } from "../fluent";
import {
	type DealDocumentPackageStatus,
	type DealDocumentSourceBlueprintSnapshot,
	type DealPackageBlueprintSnapshot,
	dealDocumentInstanceKindValidator,
	dealDocumentInstanceStatusValidator,
	dealDocumentPackageStatusValidator,
	dealPackageBlueprintSnapshotValidator,
	generatedDocumentSigningStatusValidator,
	mortgageDocumentBlueprintClassValidator,
	signatureEnvelopeStatusValidator,
	signatureProviderCodeValidator,
	signatureProviderRoleValidator,
	signatureRecipientStatusValidator,
} from "./contracts";
import { listMortgageBlueprintRows } from "./mortgageBlueprints";
import {
	getSignatureProvider,
	mapEnvelopeStatusToDealDocumentInstanceStatus,
	mapEnvelopeStatusToGeneratedDocumentSigningStatus,
	type SignatureProviderCreateEnvelopeResult,
	type SignatureProviderRecipientInput,
} from "./signature/provider";

type InstanceRow = Doc<"dealDocumentInstances">;
type BlueprintRow = Doc<"mortgageDocumentBlueprints">;
type EnvelopeRow = Doc<"signatureEnvelopes">;
type RecipientRow = Doc<"signatureRecipients">;
type GeneratedDocumentRow = Doc<"generatedDocuments">;

interface DealPackageViewerContext {
	isFairLendAdmin: boolean;
	userId?: Id<"users">;
}

interface SignatoryParticipant {
	email: string;
	name: string;
	platformRole: string;
	userId?: Id<"users">;
}

interface PackageInstanceSigningRecipientSurface {
	declinedAt: number | null;
	email: string;
	isCurrentViewer: boolean;
	name: string;
	openedAt: number | null;
	platformRole: string;
	providerRecipientId: string | null;
	providerRole: RecipientRow["providerRole"];
	signedAt: number | null;
	signingOrder: number;
	status: RecipientRow["status"];
	userId: Id<"users"> | null;
}

interface PackageInstanceSigningSurface {
	canLaunchEmbeddedSigning: boolean;
	envelopeId: Id<"signatureEnvelopes"> | null;
	generatedDocumentSigningStatus: GeneratedDocumentRow["signingStatus"] | null;
	lastError: string | null;
	lastProviderSyncAt: number | null;
	providerCode: EnvelopeRow["providerCode"] | null;
	providerEnvelopeId: string | null;
	recipients: PackageInstanceSigningRecipientSurface[];
	status: EnvelopeRow["status"] | null;
}

interface ParticipantSnapshot {
	assignedBroker?: {
		brokerId: Id<"brokers">;
		email: string;
		fullName: string;
		userId: Id<"users">;
	};
	borrowers: Array<{
		borrowerId: Id<"borrowers">;
		email: string;
		fullName: string;
		role: Doc<"mortgageBorrowers">["role"];
		userId: Id<"users">;
	}>;
	brokerOfRecord: {
		brokerId: Id<"brokers">;
		email: string;
		fullName: string;
		userId: Id<"users">;
	};
	latestValuationSnapshot: Doc<"mortgageValuationSnapshots"> | null;
	lawyerPrimary?: {
		email: string;
		fullName: string;
		lawyerType: "guest_lawyer" | "platform_lawyer";
		userId?: Id<"users">;
	};
	lender: {
		email: string;
		fullName: string;
		lenderId: Id<"lenders">;
		userId: Id<"users">;
	};
	listing?: Doc<"listings"> | null;
	mortgage: Doc<"mortgages">;
	property: Doc<"properties">;
}

interface PackageSurface {
	instances: Array<{
		archivedAt: number | null;
		assetId: Id<"documentAssets"> | null;
		category: string | null;
		class: Doc<"dealDocumentInstances">["sourceBlueprintSnapshot"]["class"];
		createdAt: number;
		dealId: Id<"deals">;
		displayName: string;
		generatedDocumentId: Id<"generatedDocuments"> | null;
		instanceId: Id<"dealDocumentInstances">;
		kind: Doc<"dealDocumentInstances">["kind"];
		lastError: string | null;
		mortgageId: Id<"mortgages">;
		packageId: Id<"dealDocumentPackages">;
		packageKey: string | null;
		packageLabel: string | null;
		sourceBlueprintId: Id<"mortgageDocumentBlueprints"> | null;
		status: Doc<"dealDocumentInstances">["status"];
		signing: PackageInstanceSigningSurface | null;
		templateId: Id<"documentTemplates"> | null;
		templateVersion: number | null;
		url: string | null;
	}>;
	package: {
		archivedAt: number | null;
		createdAt: number;
		dealId: Id<"deals">;
		lastError: string | null;
		mortgageId: Id<"mortgages">;
		packageId: Id<"dealDocumentPackages">;
		readyAt: number | null;
		retryCount: number;
		status: Doc<"dealDocumentPackages">["status"];
		updatedAt: number;
	} | null;
}

interface CreateDocumentPackageResult {
	dealId: Id<"deals">;
	packageId: Id<"dealDocumentPackages">;
	status: DealDocumentPackageStatus;
}

interface DealPackageActionCtx
	extends Pick<
		ActionCtx,
		"runAction" | "runMutation" | "runQuery" | "storage"
	> {}

interface DealPackageActionArgs {
	dealId: Id<"deals">;
	retry: boolean;
}

interface DealPackageRuntimeState {
	dealId: Id<"deals">;
	mortgageId: Id<"mortgages">;
	packageId: Id<"dealDocumentPackages">;
	signatories: Array<{
		email: string;
		name: string;
		platformRole: string;
	}>;
	signatoryParticipants: SignatoryParticipant[];
	variables: Record<string, string>;
}

interface ResolvedLawyerParticipant {
	email: string;
	fullName: string;
	lawyerType: "guest_lawyer" | "platform_lawyer";
	userId?: Id<"users">;
}

const SIGNATORY_MAPPING_ERROR_RE = /signatory mapping validation failed/i;

type DealPackagePreparation =
	| {
			result: CreateDocumentPackageResult;
	  }
	| {
			packageId: Id<"dealDocumentPackages">;
			runtime: DealPackageRuntimeState;
			workItems: PackageWorkItem[];
	  };

type PackageWorkItem =
	| {
			type: "snapshot";
			snapshot: DealPackageBlueprintSnapshot;
	  }
	| {
			type: "instance_retry";
			instance: InstanceRow;
	  };

function toFullName(user: { firstName?: string; lastName?: string }): string {
	const fullName = [user.firstName, user.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();
	return fullName.length > 0 ? fullName : "Unavailable";
}

function normalizeText(value: string | null | undefined) {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : "";
}

function toBlueprintSnapshot(
	blueprint: Pick<
		BlueprintRow,
		| "category"
		| "class"
		| "description"
		| "displayName"
		| "displayOrder"
		| "packageKey"
		| "packageLabel"
		| "templateId"
		| "templateVersion"
	>
): DealDocumentSourceBlueprintSnapshot {
	return {
		category: blueprint.category,
		class: blueprint.class,
		description: blueprint.description,
		displayName: blueprint.displayName,
		displayOrder: blueprint.displayOrder,
		packageKey: blueprint.packageKey,
		packageLabel: blueprint.packageLabel,
		templateId: blueprint.templateId,
		templateVersion: blueprint.templateVersion,
	};
}

function toPackageBlueprintSnapshot(
	blueprint: Pick<
		BlueprintRow,
		"_id" | "assetId" | "category" | "class" | "description" | "displayName"
	> &
		Pick<
			BlueprintRow,
			| "displayOrder"
			| "packageKey"
			| "packageLabel"
			| "templateId"
			| "templateVersion"
		>
): DealPackageBlueprintSnapshot {
	return {
		assetId: blueprint.assetId,
		sourceBlueprintId: blueprint._id,
		sourceBlueprintSnapshot: toBlueprintSnapshot(blueprint),
	};
}

async function getUserByAuthId(ctx: Pick<QueryCtx, "db">, authId: string) {
	return ctx.db
		.query("users")
		.withIndex("authId", (query) => query.eq("authId", authId))
		.unique();
}

async function requireDealContext(
	ctx: Pick<QueryCtx, "db">,
	dealId: Id<"deals">
) {
	const deal = await ctx.db.get(dealId);
	if (!deal) {
		throw new ConvexError("Deal not found");
	}

	const mortgage = await ctx.db.get(deal.mortgageId);
	if (!mortgage) {
		throw new ConvexError("Deal mortgage not found");
	}

	const property = await ctx.db.get(mortgage.propertyId);
	if (!property) {
		throw new ConvexError("Deal property not found");
	}

	const listing = await ctx.db
		.query("listings")
		.withIndex("by_mortgage", (query) => query.eq("mortgageId", mortgage._id))
		.unique();

	return { deal, listing, mortgage, property };
}

async function requireLenderParticipant(
	ctx: Pick<QueryCtx, "db">,
	lenderId: Id<"lenders">
) {
	const lender = await ctx.db.get(lenderId);
	if (!lender) {
		throw new ConvexError("Deal lender record not found");
	}

	const user = await ctx.db.get(lender.userId);
	if (!user) {
		throw new ConvexError("Deal lender user not found");
	}

	return {
		email: normalizeText(user.email),
		fullName: toFullName(user),
		lenderId: lender._id,
		userId: user._id,
	};
}

async function requireBrokerParticipant(
	ctx: Pick<QueryCtx, "db">,
	brokerId: Id<"brokers">
) {
	const broker = await ctx.db.get(brokerId);
	if (!broker) {
		throw new ConvexError("Broker participant not found");
	}

	const user = await ctx.db.get(broker.userId);
	if (!user) {
		throw new ConvexError("Broker participant user not found");
	}

	return {
		brokerId: broker._id,
		email: normalizeText(user.email),
		fullName: toFullName(user),
		userId: user._id,
	};
}

async function resolveLawyerPrimaryParticipant(
	ctx: Pick<QueryCtx, "db">,
	args: {
		lawyerType?: "guest_lawyer" | "platform_lawyer";
		mortgageId: Id<"mortgages">;
	}
): Promise<ResolvedLawyerParticipant | undefined> {
	if (!args.lawyerType) {
		return undefined;
	}

	const assignments = await ctx.db
		.query("closingTeamAssignments")
		.withIndex("by_mortgage", (query) =>
			query.eq("mortgageId", args.mortgageId)
		)
		.collect();
	const primaryAssignment =
		assignments.find((assignment) => assignment.role === "closing_lawyer") ??
		assignments.find((assignment) => assignment.role === "reviewing_lawyer");

	if (primaryAssignment) {
		const assignedUser = await getUserByAuthId(ctx, primaryAssignment.userId);
		if (assignedUser) {
			return {
				email: normalizeText(assignedUser.email),
				fullName: toFullName(assignedUser),
				lawyerType: args.lawyerType,
				userId: assignedUser._id,
			};
		}
	}

	return undefined;
}

async function resolveLatestValuationSnapshot(
	ctx: Pick<QueryCtx, "db">,
	mortgageId: Id<"mortgages">
) {
	return ctx.db
		.query("mortgageValuationSnapshots")
		.withIndex("by_mortgage_created_at", (query) =>
			query.eq("mortgageId", mortgageId)
		)
		.order("desc")
		.first();
}

async function buildParticipantSnapshot(
	ctx: Pick<QueryCtx, "db">,
	dealId: Id<"deals">
): Promise<ParticipantSnapshot> {
	const { deal, listing, mortgage, property } = await requireDealContext(
		ctx,
		dealId
	);
	if (!deal.lenderId) {
		throw new ConvexError(
			"Deal package creation requires a canonical lenderId"
		);
	}
	const [
		lender,
		brokerOfRecord,
		assignedBroker,
		lawyerPrimary,
		borrowerLinks,
		latestValuationSnapshot,
	] = await Promise.all([
		requireLenderParticipant(ctx, deal.lenderId),
		requireBrokerParticipant(ctx, mortgage.brokerOfRecordId),
		mortgage.assignedBrokerId
			? requireBrokerParticipant(ctx, mortgage.assignedBrokerId)
			: Promise.resolve(undefined),
		resolveLawyerPrimaryParticipant(ctx, {
			lawyerType: deal.lawyerType,
			mortgageId: mortgage._id,
		}),
		ctx.db
			.query("mortgageBorrowers")
			.withIndex("by_mortgage", (query) => query.eq("mortgageId", mortgage._id))
			.collect(),
		resolveLatestValuationSnapshot(ctx, mortgage._id),
	]);

	const borrowers = (
		await Promise.all(
			borrowerLinks.map(async (link) => {
				const borrower = await ctx.db.get(link.borrowerId);
				if (!borrower) {
					throw new ConvexError(
						"Mortgage borrower link points to missing borrower"
					);
				}

				const user = await ctx.db.get(borrower.userId);
				if (!user) {
					throw new ConvexError("Borrower user not found");
				}

				return {
					borrowerId: borrower._id,
					email: normalizeText(user.email),
					fullName: toFullName(user),
					role: link.role,
					userId: user._id,
				};
			})
		)
	).sort((left, right) => {
		const order = { primary: 0, co_borrower: 1, guarantor: 2 } as const;
		return order[left.role] - order[right.role];
	});

	return {
		assignedBroker,
		borrowers,
		brokerOfRecord,
		lawyerPrimary,
		lender,
		latestValuationSnapshot,
		listing,
		mortgage,
		property,
	};
}

function buildDealVariableBag(snapshot: ParticipantSnapshot) {
	const primaryBorrower =
		snapshot.borrowers.find((borrower) => borrower.role === "primary") ??
		snapshot.borrowers[0];
	const coBorrowers = snapshot.borrowers.filter(
		(borrower) => borrower.role === "co_borrower"
	);

	return {
		assigned_broker_email: snapshot.assignedBroker?.email ?? "",
		assigned_broker_full_name: snapshot.assignedBroker?.fullName ?? "",
		borrower_co_1_email: coBorrowers[0]?.email ?? "",
		borrower_co_1_full_name: coBorrowers[0]?.fullName ?? "",
		borrower_co_2_email: coBorrowers[1]?.email ?? "",
		borrower_co_2_full_name: coBorrowers[1]?.fullName ?? "",
		borrower_primary_email: primaryBorrower?.email ?? "",
		borrower_primary_full_name: primaryBorrower?.fullName ?? "",
		broker_of_record_email: snapshot.brokerOfRecord.email,
		broker_of_record_full_name: snapshot.brokerOfRecord.fullName,
		lawyer_primary_email: snapshot.lawyerPrimary?.email ?? "",
		lawyer_primary_full_name: snapshot.lawyerPrimary?.fullName ?? "",
		listing_description: snapshot.listing?.description ?? "",
		listing_marketplace_copy: snapshot.listing?.marketplaceCopy ?? "",
		listing_title: snapshot.listing?.title ?? "",
		lender_primary_email: snapshot.lender.email,
		lender_primary_full_name: snapshot.lender.fullName,
		mortgage_amortization_months: String(snapshot.mortgage.amortizationMonths),
		mortgage_amount: String(snapshot.mortgage.principal),
		mortgage_first_payment_date: snapshot.mortgage.firstPaymentDate,
		mortgage_interest_rate: String(snapshot.mortgage.interestRate),
		mortgage_lien_position: String(snapshot.mortgage.lienPosition),
		mortgage_maturity_date: snapshot.mortgage.maturityDate,
		mortgage_payment_amount: String(snapshot.mortgage.paymentAmount),
		mortgage_payment_frequency: snapshot.mortgage.paymentFrequency,
		mortgage_principal: String(snapshot.mortgage.principal),
		mortgage_rate_type: snapshot.mortgage.rateType,
		mortgage_term_months: String(snapshot.mortgage.termMonths),
		mortgage_term_start_date: snapshot.mortgage.termStartDate,
		property_city: snapshot.property.city,
		property_postal_code: snapshot.property.postalCode,
		property_province: snapshot.property.province,
		property_street_address: snapshot.property.streetAddress,
		property_type: snapshot.property.propertyType,
		property_unit: snapshot.property.unit ?? "",
		valuation_date:
			snapshot.latestValuationSnapshot?.valuationDate ??
			snapshot.mortgage.termStartDate,
		valuation_value_as_is: String(
			snapshot.latestValuationSnapshot?.valueAsIs ?? 0
		),
	};
}

function buildSignatoryMappings(snapshot: ParticipantSnapshot) {
	const primaryBorrower =
		snapshot.borrowers.find((borrower) => borrower.role === "primary") ??
		snapshot.borrowers[0];
	const coBorrowers = snapshot.borrowers.filter(
		(borrower) => borrower.role === "co_borrower"
	);

	return [
		{
			platformRole: "lender_primary",
			name: snapshot.lender.fullName,
			email: snapshot.lender.email,
		},
		...(primaryBorrower
			? [
					{
						platformRole: "borrower_primary",
						name: primaryBorrower.fullName,
						email: primaryBorrower.email,
					},
				]
			: []),
		...(coBorrowers[0]
			? [
					{
						platformRole: "borrower_co_1",
						name: coBorrowers[0].fullName,
						email: coBorrowers[0].email,
					},
				]
			: []),
		...(coBorrowers[1]
			? [
					{
						platformRole: "borrower_co_2",
						name: coBorrowers[1].fullName,
						email: coBorrowers[1].email,
					},
				]
			: []),
		{
			platformRole: "broker_of_record",
			name: snapshot.brokerOfRecord.fullName,
			email: snapshot.brokerOfRecord.email,
		},
		...(snapshot.assignedBroker
			? [
					{
						platformRole: "assigned_broker",
						name: snapshot.assignedBroker.fullName,
						email: snapshot.assignedBroker.email,
					},
				]
			: []),
		...(snapshot.lawyerPrimary
			? [
					{
						platformRole: "lawyer_primary",
						name: snapshot.lawyerPrimary.fullName,
						email: snapshot.lawyerPrimary.email,
					},
				]
			: []),
	].filter(
		(entry) => entry.email.trim().length > 0 && entry.name.trim().length > 0
	);
}

function buildSignatoryParticipants(
	snapshot: ParticipantSnapshot
): SignatoryParticipant[] {
	const primaryBorrower =
		snapshot.borrowers.find((borrower) => borrower.role === "primary") ??
		snapshot.borrowers[0];
	const coBorrowers = snapshot.borrowers.filter(
		(borrower) => borrower.role === "co_borrower"
	);

	return [
		{
			platformRole: "lender_primary",
			name: snapshot.lender.fullName,
			email: snapshot.lender.email,
			userId: snapshot.lender.userId,
		},
		...(primaryBorrower
			? [
					{
						platformRole: "borrower_primary",
						name: primaryBorrower.fullName,
						email: primaryBorrower.email,
						userId: primaryBorrower.userId,
					},
				]
			: []),
		...(coBorrowers[0]
			? [
					{
						platformRole: "borrower_co_1",
						name: coBorrowers[0].fullName,
						email: coBorrowers[0].email,
						userId: coBorrowers[0].userId,
					},
				]
			: []),
		...(coBorrowers[1]
			? [
					{
						platformRole: "borrower_co_2",
						name: coBorrowers[1].fullName,
						email: coBorrowers[1].email,
						userId: coBorrowers[1].userId,
					},
				]
			: []),
		{
			platformRole: "broker_of_record",
			name: snapshot.brokerOfRecord.fullName,
			email: snapshot.brokerOfRecord.email,
			userId: snapshot.brokerOfRecord.userId,
		},
		...(snapshot.assignedBroker
			? [
					{
						platformRole: "assigned_broker",
						name: snapshot.assignedBroker.fullName,
						email: snapshot.assignedBroker.email,
						userId: snapshot.assignedBroker.userId,
					},
				]
			: []),
		...(snapshot.lawyerPrimary
			? [
					{
						platformRole: "lawyer_primary",
						name: snapshot.lawyerPrimary.fullName,
						email: snapshot.lawyerPrimary.email,
						userId: snapshot.lawyerPrimary.userId,
					},
				]
			: []),
	].filter(
		(entry) => entry.email.trim().length > 0 && entry.name.trim().length > 0
	);
}

function canLaunchEmbeddedSigning(args: {
	envelopeStatus: EnvelopeRow["status"] | null;
	providerRecipientId: string | null;
	recipientStatus: RecipientRow["status"];
	userId: Id<"users"> | null;
	viewer?: DealPackageViewerContext;
}) {
	if (!(args.viewer?.userId && args.userId)) {
		return false;
	}

	if (args.viewer.userId !== args.userId) {
		return false;
	}

	if (!args.providerRecipientId) {
		return false;
	}

	if (
		args.recipientStatus === "signed" ||
		args.recipientStatus === "declined"
	) {
		return false;
	}

	return (
		args.envelopeStatus === "sent" || args.envelopeStatus === "partially_signed"
	);
}

async function buildSigningSurface(
	ctx: Pick<QueryCtx, "db">,
	instance: Pick<
		InstanceRow,
		"generatedDocumentId" | "sourceBlueprintSnapshot"
	>,
	viewer?: DealPackageViewerContext
): Promise<PackageInstanceSigningSurface | null> {
	if (instance.sourceBlueprintSnapshot.class !== "private_templated_signable") {
		return null;
	}

	const generatedDocumentId = instance.generatedDocumentId;
	const generatedDocument = generatedDocumentId
		? await ctx.db.get(generatedDocumentId)
		: null;
	let envelope: EnvelopeRow | null = null;
	if (generatedDocumentId) {
		envelope = await ctx.db
			.query("signatureEnvelopes")
			.withIndex("by_generated_document", (query) =>
				query.eq("generatedDocumentId", generatedDocumentId)
			)
			.unique();
	}
	const recipientRows = envelope
		? await ctx.db
				.query("signatureRecipients")
				.withIndex("by_envelope", (query) =>
					query.eq("envelopeId", envelope._id)
				)
				.collect()
		: [];

	const recipients = recipientRows.map((recipient) => ({
		declinedAt: recipient.declinedAt ?? null,
		email: recipient.email,
		isCurrentViewer:
			Boolean(viewer?.userId) && viewer?.userId === recipient.userId,
		name: recipient.name,
		openedAt: recipient.openedAt ?? null,
		platformRole: recipient.platformRole,
		providerRecipientId: recipient.providerRecipientId ?? null,
		providerRole: recipient.providerRole,
		signedAt: recipient.signedAt ?? null,
		signingOrder: recipient.signingOrder,
		status: recipient.status,
		userId: recipient.userId ?? null,
	}));

	return {
		canLaunchEmbeddedSigning: recipients.some((recipient) =>
			canLaunchEmbeddedSigning({
				envelopeStatus: envelope?.status ?? null,
				providerRecipientId: recipient.providerRecipientId,
				recipientStatus: recipient.status,
				userId: recipient.userId,
				viewer,
			})
		),
		envelopeId: envelope?._id ?? null,
		generatedDocumentSigningStatus: generatedDocument?.signingStatus ?? null,
		lastError: envelope?.lastError ?? null,
		lastProviderSyncAt: envelope?.lastProviderSyncAt ?? null,
		providerCode: envelope?.providerCode ?? null,
		providerEnvelopeId: envelope?.providerEnvelopeId ?? null,
		recipients,
		status: envelope?.status ?? null,
	};
}

async function buildPackageSurface(
	ctx: Pick<QueryCtx, "db" | "storage">,
	dealId: Id<"deals">,
	viewer?: DealPackageViewerContext
): Promise<PackageSurface> {
	const packageRow = await ctx.db
		.query("dealDocumentPackages")
		.withIndex("by_deal", (query) => query.eq("dealId", dealId))
		.unique();

	if (!packageRow) {
		return { instances: [], package: null };
	}

	const rows = await ctx.db
		.query("dealDocumentInstances")
		.withIndex("by_package", (query) => query.eq("packageId", packageRow._id))
		.collect();

	const instances = await Promise.all(
		rows
			.sort((left, right) => {
				if (
					left.sourceBlueprintSnapshot.displayOrder !==
					right.sourceBlueprintSnapshot.displayOrder
				) {
					return (
						left.sourceBlueprintSnapshot.displayOrder -
						right.sourceBlueprintSnapshot.displayOrder
					);
				}
				return left.createdAt - right.createdAt;
			})
			.map(async (row) => {
				let url: string | null = null;
				const signing = await buildSigningSurface(ctx, row, viewer);
				if (row.assetId) {
					const asset = await ctx.db.get(row.assetId);
					url = asset ? await ctx.storage.getUrl(asset.fileRef) : null;
				} else if (
					row.generatedDocumentId &&
					row.sourceBlueprintSnapshot.class !== "private_templated_signable"
				) {
					const generatedDocument = await ctx.db.get(row.generatedDocumentId);
					url = generatedDocument
						? await ctx.storage.getUrl(generatedDocument.pdfStorageId)
						: null;
				}

				return {
					archivedAt: row.archivedAt ?? null,
					assetId: row.assetId ?? null,
					category: row.sourceBlueprintSnapshot.category ?? null,
					class: row.sourceBlueprintSnapshot.class,
					createdAt: row.createdAt,
					dealId: row.dealId,
					displayName: row.sourceBlueprintSnapshot.displayName,
					generatedDocumentId: row.generatedDocumentId ?? null,
					instanceId: row._id,
					kind: row.kind,
					lastError: row.lastError ?? null,
					mortgageId: row.mortgageId,
					packageId: row.packageId,
					packageKey: row.sourceBlueprintSnapshot.packageKey ?? null,
					packageLabel: row.sourceBlueprintSnapshot.packageLabel ?? null,
					sourceBlueprintId: row.sourceBlueprintId ?? null,
					status: row.status,
					signing,
					templateId: row.sourceBlueprintSnapshot.templateId ?? null,
					templateVersion: row.sourceBlueprintSnapshot.templateVersion ?? null,
					url,
				};
			})
	);

	return {
		instances,
		package: {
			archivedAt: packageRow.archivedAt ?? null,
			createdAt: packageRow.createdAt,
			dealId: packageRow.dealId,
			lastError: packageRow.lastError ?? null,
			mortgageId: packageRow.mortgageId,
			packageId: packageRow._id,
			readyAt: packageRow.readyAt ?? null,
			retryCount: packageRow.retryCount,
			status: packageRow.status,
			updatedAt: packageRow.updatedAt,
		},
	};
}

function summarizePackageStatus(
	rows: ReadonlyArray<
		Pick<InstanceRow, "archivedAt" | "lastError" | "status"> & {
			sourceBlueprintSnapshot: Pick<
				InstanceRow["sourceBlueprintSnapshot"],
				"class"
			>;
		}
	>
): {
	lastError?: string;
	status: DealDocumentPackageStatus;
} {
	const activeRows = rows.filter((row) => !row.archivedAt);
	const failedRows = activeRows.filter(
		(row) =>
			row.status === "generation_failed" ||
			row.status === "signature_pending_recipient_resolution" ||
			row.status === "signature_draft" ||
			row.status === "signature_declined" ||
			row.status === "signature_voided"
	);
	const readyRows = activeRows.filter(
		(row) =>
			row.status === "available" ||
			row.status === "signature_sent" ||
			row.status === "signature_partially_signed" ||
			row.status === "signed"
	);

	if (failedRows.length === 0) {
		return { status: "ready" };
	}

	const lastError =
		failedRows.find((row) => row.lastError && row.lastError.length > 0)
			?.lastError ?? "Document package generation failed";

	if (readyRows.length > 0) {
		return { lastError, status: "partial_failure" };
	}

	return { lastError, status: "failed" };
}

export const resolveDealParticipantSnapshotInternal = internalQuery({
	args: {
		dealId: v.id("deals"),
	},
	handler: async (ctx, args) => {
		return buildParticipantSnapshot(ctx, args.dealId);
	},
});

export const resolveDealDocumentVariablesInternal = internalQuery({
	args: {
		dealId: v.id("deals"),
	},
	handler: async (ctx, args) => {
		const snapshot = await buildParticipantSnapshot(ctx, args.dealId);
		return buildDealVariableBag(snapshot);
	},
});

export const resolveDealDocumentSignatoriesInternal = internalQuery({
	args: {
		dealId: v.id("deals"),
	},
	handler: async (ctx, args) => {
		const snapshot = await buildParticipantSnapshot(ctx, args.dealId);
		return buildSignatoryMappings(snapshot);
	},
});

export const getPackageByDealInternal = internalQuery({
	args: { dealId: v.id("deals") },
	handler: async (ctx, args) => {
		return ctx.db
			.query("dealDocumentPackages")
			.withIndex("by_deal", (query) => query.eq("dealId", args.dealId))
			.unique();
	},
});

export const listPackageInstancesInternal = internalQuery({
	args: { packageId: v.id("dealDocumentPackages") },
	handler: async (ctx, args) => {
		return ctx.db
			.query("dealDocumentInstances")
			.withIndex("by_package", (query) => query.eq("packageId", args.packageId))
			.collect();
	},
});

export const listActivePackageBlueprintInputsInternal = internalQuery({
	args: { mortgageId: v.id("mortgages") },
	handler: async (ctx, args) => {
		const blueprints = await listMortgageBlueprintRows(ctx, {
			includeArchived: false,
			mortgageId: args.mortgageId,
		});
		return blueprints.filter(
			(blueprint) => blueprint.class !== "public_static"
		);
	},
});

export const ensurePackageHeaderInternal = internalMutation({
	args: {
		blueprintSnapshots: v.array(dealPackageBlueprintSnapshotValidator),
		dealId: v.id("deals"),
		incrementRetryCount: v.boolean(),
		mortgageId: v.id("mortgages"),
		now: v.number(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("dealDocumentPackages")
			.withIndex("by_deal", (query) => query.eq("dealId", args.dealId))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				blueprintSnapshots:
					existing.blueprintSnapshots ?? args.blueprintSnapshots,
				lastError: undefined,
				retryCount: existing.retryCount + (args.incrementRetryCount ? 1 : 0),
				status: "pending",
				updatedAt: args.now,
			});
			return existing._id;
		}

		return ctx.db.insert("dealDocumentPackages", {
			archivedAt: undefined,
			blueprintSnapshots: args.blueprintSnapshots,
			createdAt: args.now,
			dealId: args.dealId,
			lastError: undefined,
			mortgageId: args.mortgageId,
			readyAt: undefined,
			retryCount: 0,
			status: "pending",
			updatedAt: args.now,
		});
	},
});

export const createDealDocumentInstance = internalMutation({
	args: {
		archivedAt: v.optional(v.number()),
		assetId: v.optional(v.id("documentAssets")),
		createdAt: v.number(),
		dealId: v.id("deals"),
		generatedDocumentId: v.optional(v.id("generatedDocuments")),
		kind: dealDocumentInstanceKindValidator,
		lastError: v.optional(v.string()),
		mortgageId: v.id("mortgages"),
		packageId: v.id("dealDocumentPackages"),
		sourceBlueprintId: v.optional(v.id("mortgageDocumentBlueprints")),
		sourceBlueprintSnapshot: v.object({
			category: v.optional(v.string()),
			class: mortgageDocumentBlueprintClassValidator,
			description: v.optional(v.string()),
			displayName: v.string(),
			displayOrder: v.number(),
			packageKey: v.optional(v.string()),
			packageLabel: v.optional(v.string()),
			templateId: v.optional(v.id("documentTemplates")),
			templateVersion: v.optional(v.number()),
		}),
		status: dealDocumentInstanceStatusValidator,
		updatedAt: v.number(),
	},
	handler: async (ctx, args) => {
		return ctx.db.insert("dealDocumentInstances", args);
	},
});

export const archiveDealDocumentInstance = internalMutation({
	args: {
		instanceId: v.id("dealDocumentInstances"),
		now: v.number(),
	},
	handler: async (ctx, args) => {
		const instance = await ctx.db.get(args.instanceId);
		if (!instance || instance.status === "archived") {
			return;
		}

		await ctx.db.patch(args.instanceId, {
			archivedAt: args.now,
			status: "archived",
			updatedAt: args.now,
		});
	},
});

export const insertGeneratedDocumentInternal = internalMutation({
	args: {
		dealId: v.id("deals"),
		documensoEnvelopeId: v.optional(v.string()),
		groupId: v.optional(v.id("documentTemplateGroups")),
		metadata: v.optional(v.any()),
		name: v.string(),
		pdfStorageId: v.id("_storage"),
		signingStatus: v.optional(generatedDocumentSigningStatusValidator),
		templateId: v.id("documentTemplates"),
		templateVersionUsed: v.number(),
	},
	handler: async (ctx, args) => {
		return ctx.db.insert("generatedDocuments", {
			documensoEnvelopeId: args.documensoEnvelopeId,
			entityId: String(args.dealId),
			entityType: "deal",
			generatedAt: Date.now(),
			generatedBy: "deal_document_package",
			groupId: args.groupId,
			metadata: args.metadata,
			name: args.name,
			pdfStorageId: args.pdfStorageId,
			sensitivityTier: "private",
			signingStatus: args.signingStatus ?? "not_applicable",
			templateId: args.templateId,
			templateVersionUsed: args.templateVersionUsed,
			updatedAt: Date.now(),
		});
	},
});

export const patchGeneratedDocumentSigningStateInternal = internalMutation({
	args: {
		completionCertificateStorageId: v.optional(v.id("_storage")),
		documensoEnvelopeId: v.optional(v.string()),
		finalPdfStorageId: v.optional(v.id("_storage")),
		generatedDocumentId: v.id("generatedDocuments"),
		now: v.number(),
		signingCompletedAt: v.optional(v.number()),
		signingStatus: generatedDocumentSigningStatusValidator,
	},
	handler: async (ctx, args) => {
		const generatedDocument = await ctx.db.get(args.generatedDocumentId);
		if (!generatedDocument) {
			throw new ConvexError("Generated document not found");
		}

		await ctx.db.patch(args.generatedDocumentId, {
			completionCertificateStorageId: args.completionCertificateStorageId,
			documensoEnvelopeId:
				args.documensoEnvelopeId ?? generatedDocument.documensoEnvelopeId,
			finalPdfStorageId: args.finalPdfStorageId,
			signingCompletedAt:
				args.signingCompletedAt ?? generatedDocument.signingCompletedAt,
			signingStatus: args.signingStatus,
			updatedAt: args.now,
		});
	},
});

export const createSignatureEnvelopeWithRecipientsInternal = internalMutation({
	args: {
		dealId: v.id("deals"),
		generatedDocumentId: v.id("generatedDocuments"),
		lastError: v.optional(v.string()),
		now: v.number(),
		providerCode: signatureProviderCodeValidator,
		providerEnvelopeId: v.string(),
		recipients: v.array(
			v.object({
				email: v.string(),
				name: v.string(),
				platformRole: v.string(),
				providerRecipientId: v.optional(v.string()),
				providerRole: signatureProviderRoleValidator,
				signingOrder: v.number(),
				status: signatureRecipientStatusValidator,
				userId: v.optional(v.id("users")),
			})
		),
		status: signatureEnvelopeStatusValidator,
	},
	handler: async (ctx, args) => {
		const envelopeId = await ctx.db.insert("signatureEnvelopes", {
			createdAt: args.now,
			dealId: args.dealId,
			generatedDocumentId: args.generatedDocumentId,
			lastError: args.lastError,
			lastProviderSyncAt: args.now,
			providerCode: args.providerCode,
			providerEnvelopeId: args.providerEnvelopeId,
			status: args.status,
			updatedAt: args.now,
		});

		for (const recipient of args.recipients) {
			await ctx.db.insert("signatureRecipients", {
				createdAt: args.now,
				declinedAt: undefined,
				email: recipient.email,
				envelopeId,
				name: recipient.name,
				openedAt: undefined,
				platformRole: recipient.platformRole,
				providerRecipientId: recipient.providerRecipientId,
				providerRole: recipient.providerRole,
				signedAt: undefined,
				signingOrder: recipient.signingOrder,
				status: recipient.status,
				updatedAt: args.now,
				userId: recipient.userId,
			});
		}

		await ctx.db.patch(args.generatedDocumentId, {
			documensoEnvelopeId: args.providerEnvelopeId,
			signingStatus: mapEnvelopeStatusToGeneratedDocumentSigningStatus(
				args.status
			),
			updatedAt: args.now,
		});

		return envelopeId;
	},
});

export const syncSignatureEnvelopeStateInternal = internalMutation({
	args: {
		completionCertificateStorageId: v.optional(v.id("_storage")),
		envelopeId: v.id("signatureEnvelopes"),
		finalPdfStorageId: v.optional(v.id("_storage")),
		lastError: v.optional(v.string()),
		now: v.number(),
		recipients: v.array(
			v.object({
				declinedAt: v.optional(v.number()),
				openedAt: v.optional(v.number()),
				providerRecipientId: v.string(),
				signedAt: v.optional(v.number()),
				status: signatureRecipientStatusValidator,
			})
		),
		status: signatureEnvelopeStatusValidator,
	},
	handler: async (ctx, args) => {
		const envelope = await ctx.db.get(args.envelopeId);
		if (!envelope) {
			throw new ConvexError("Signature envelope not found");
		}

		await ctx.db.patch(envelope._id, {
			lastError: args.lastError,
			lastProviderSyncAt: args.now,
			status: args.status,
			updatedAt: args.now,
		});

		const existingRecipients = await ctx.db
			.query("signatureRecipients")
			.withIndex("by_envelope", (query) => query.eq("envelopeId", envelope._id))
			.collect();
		const recipientByProviderId = new Map(
			existingRecipients
				.filter(
					(
						recipient
					): recipient is RecipientRow & { providerRecipientId: string } =>
						Boolean(recipient.providerRecipientId)
				)
				.map((recipient) => [recipient.providerRecipientId, recipient])
		);

		for (const recipientUpdate of args.recipients) {
			const recipient = recipientByProviderId.get(
				recipientUpdate.providerRecipientId
			);
			if (!recipient) {
				continue;
			}

			await ctx.db.patch(recipient._id, {
				declinedAt: recipientUpdate.declinedAt,
				openedAt: recipientUpdate.openedAt,
				signedAt: recipientUpdate.signedAt,
				status: recipientUpdate.status,
				updatedAt: args.now,
			});
		}

		const generatedDocument = await ctx.db.get(envelope.generatedDocumentId);
		if (generatedDocument) {
			await ctx.db.patch(generatedDocument._id, {
				completionCertificateStorageId: args.completionCertificateStorageId,
				documensoEnvelopeId: envelope.providerEnvelopeId,
				finalPdfStorageId: args.finalPdfStorageId,
				signingCompletedAt:
					args.status === "completed"
						? (generatedDocument.signingCompletedAt ?? args.now)
						: generatedDocument.signingCompletedAt,
				signingStatus: mapEnvelopeStatusToGeneratedDocumentSigningStatus(
					args.status
				),
				updatedAt: args.now,
			});
		}

		const dealInstances = await ctx.db
			.query("dealDocumentInstances")
			.withIndex("by_deal", (query) => query.eq("dealId", envelope.dealId))
			.collect();
		const activeInstances = dealInstances.filter(
			(instance) =>
				!instance.archivedAt &&
				instance.generatedDocumentId === envelope.generatedDocumentId
		);

		for (const instance of activeInstances) {
			await ctx.db.patch(instance._id, {
				lastError: args.lastError,
				status: mapEnvelopeStatusToDealDocumentInstanceStatus(args.status),
				updatedAt: args.now,
			});
		}

		const packageId = activeInstances[0]?.packageId;
		if (!packageId) {
			return;
		}

		const packageRows = await ctx.db
			.query("dealDocumentInstances")
			.withIndex("by_package", (query) => query.eq("packageId", packageId))
			.collect();
		const summary = summarizePackageStatus(packageRows);

		await ctx.db.patch(packageId, {
			lastError: summary.lastError,
			readyAt: summary.status === "ready" ? args.now : undefined,
			status: summary.status,
			updatedAt: args.now,
		});
	},
});

export const getViewerUserByAuthIdInternal = internalQuery({
	args: {
		authId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await getUserByAuthId(ctx, args.authId);
		if (!user) {
			return null;
		}

		return {
			email: user.email,
			userId: user._id,
		};
	},
});

export const getSignableDocumentEnvelopeByInstanceInternal = internalQuery({
	args: {
		dealId: v.id("deals"),
		instanceId: v.id("dealDocumentInstances"),
	},
	handler: async (ctx, args) => {
		const instance = await ctx.db.get(args.instanceId);
		if (
			!instance ||
			instance.dealId !== args.dealId ||
			instance.archivedAt ||
			instance.sourceBlueprintSnapshot.class !== "private_templated_signable" ||
			!instance.generatedDocumentId
		) {
			return null;
		}

		const generatedDocument = await ctx.db.get(instance.generatedDocumentId);
		if (!generatedDocument) {
			return null;
		}

		const envelope = await ctx.db
			.query("signatureEnvelopes")
			.withIndex("by_generated_document", (query) =>
				query.eq("generatedDocumentId", generatedDocument._id)
			)
			.unique();
		if (!envelope) {
			return null;
		}

		const recipients = await ctx.db
			.query("signatureRecipients")
			.withIndex("by_envelope", (query) => query.eq("envelopeId", envelope._id))
			.collect();

		return {
			dealId: instance.dealId,
			envelope: {
				envelopeId: envelope._id,
				providerCode: envelope.providerCode,
				providerEnvelopeId: envelope.providerEnvelopeId,
				status: envelope.status,
			},
			generatedDocumentId: generatedDocument._id,
			instanceId: instance._id,
			recipients: recipients.map((recipient) => ({
				email: recipient.email,
				name: recipient.name,
				platformRole: recipient.platformRole,
				providerRecipientId: recipient.providerRecipientId ?? null,
				providerRole: recipient.providerRole,
				signingOrder: recipient.signingOrder,
				status: recipient.status,
				userId: recipient.userId ?? null,
			})),
		};
	},
});

export const finalizePackageInternal = internalMutation({
	args: {
		lastError: v.optional(v.string()),
		now: v.number(),
		packageId: v.id("dealDocumentPackages"),
		status: dealDocumentPackageStatusValidator,
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.packageId, {
			lastError: args.lastError,
			readyAt: args.status === "ready" ? args.now : undefined,
			status: args.status,
			updatedAt: args.now,
		});
	},
});

function getWorkItemSourceBlueprintSnapshot(
	workItem: PackageWorkItem
): DealDocumentSourceBlueprintSnapshot {
	if (workItem.type === "snapshot") {
		return workItem.snapshot.sourceBlueprintSnapshot;
	}

	return workItem.instance.sourceBlueprintSnapshot;
}

function getWorkItemSourceBlueprintId(workItem: PackageWorkItem) {
	if (workItem.type === "snapshot") {
		return workItem.snapshot.sourceBlueprintId;
	}

	return workItem.instance.sourceBlueprintId;
}

function getWorkItemAssetId(workItem: PackageWorkItem) {
	if (workItem.type === "snapshot") {
		return workItem.snapshot.assetId;
	}

	return workItem.instance.assetId;
}

function buildCreateDocumentPackageResult(args: {
	dealId: Id<"deals">;
	packageId: Id<"dealDocumentPackages">;
	status: DealDocumentPackageStatus;
}): CreateDocumentPackageResult {
	return {
		dealId: args.dealId,
		packageId: args.packageId,
		status: args.status,
	};
}

function isInstanceForSnapshot(
	instance: Pick<
		InstanceRow,
		"archivedAt" | "assetId" | "sourceBlueprintId" | "sourceBlueprintSnapshot"
	>,
	snapshot: DealPackageBlueprintSnapshot
) {
	if (instance.archivedAt) {
		return false;
	}

	if (instance.sourceBlueprintId && snapshot.sourceBlueprintId) {
		return instance.sourceBlueprintId === snapshot.sourceBlueprintId;
	}

	return (
		instance.assetId === (snapshot.assetId ?? undefined) &&
		instance.sourceBlueprintSnapshot.class ===
			snapshot.sourceBlueprintSnapshot.class &&
		instance.sourceBlueprintSnapshot.displayName ===
			snapshot.sourceBlueprintSnapshot.displayName &&
		instance.sourceBlueprintSnapshot.displayOrder ===
			snapshot.sourceBlueprintSnapshot.displayOrder &&
		instance.sourceBlueprintSnapshot.packageKey ===
			snapshot.sourceBlueprintSnapshot.packageKey &&
		instance.sourceBlueprintSnapshot.templateId ===
			snapshot.sourceBlueprintSnapshot.templateId &&
		instance.sourceBlueprintSnapshot.templateVersion ===
			snapshot.sourceBlueprintSnapshot.templateVersion
	);
}

function buildPackageWorkItems(args: {
	blueprintSnapshots: DealPackageBlueprintSnapshot[];
	existingInstances: InstanceRow[];
}): PackageWorkItem[] {
	const retryItems = args.existingInstances
		.filter(
			(instance) =>
				instance.status === "generation_failed" ||
				instance.status === "signature_pending_recipient_resolution"
		)
		.map((instance) => ({
			instance,
			type: "instance_retry" as const,
		}));

	const missingSnapshotItems = args.blueprintSnapshots
		.filter(
			(snapshot) =>
				!args.existingInstances.some((instance) =>
					isInstanceForSnapshot(instance, snapshot)
				)
		)
		.map((snapshot) => ({
			snapshot,
			type: "snapshot" as const,
		}));

	return [...retryItems, ...missingSnapshotItems].sort((left, right) => {
		const leftSnapshot = getWorkItemSourceBlueprintSnapshot(left);
		const rightSnapshot = getWorkItemSourceBlueprintSnapshot(right);
		if (leftSnapshot.displayOrder !== rightSnapshot.displayOrder) {
			return leftSnapshot.displayOrder - rightSnapshot.displayOrder;
		}
		return leftSnapshot.displayName.localeCompare(rightSnapshot.displayName);
	});
}

async function createPackageInstance(
	ctx: DealPackageActionCtx,
	args: {
		assetId?: Id<"documentAssets">;
		dealId: Id<"deals">;
		generatedDocumentId?: Id<"generatedDocuments">;
		kind: Doc<"dealDocumentInstances">["kind"];
		lastError?: string;
		mortgageId: Id<"mortgages">;
		packageId: Id<"dealDocumentPackages">;
		sourceBlueprintId?: Id<"mortgageDocumentBlueprints">;
		sourceBlueprintSnapshot: DealDocumentSourceBlueprintSnapshot;
		status: Doc<"dealDocumentInstances">["status"];
	}
) {
	const now = Date.now();
	return ctx.runMutation(
		internal.documents.dealPackages.createDealDocumentInstance,
		{
			archivedAt: undefined,
			assetId: args.assetId,
			createdAt: now,
			dealId: args.dealId,
			generatedDocumentId: args.generatedDocumentId,
			kind: args.kind,
			lastError: args.lastError,
			mortgageId: args.mortgageId,
			packageId: args.packageId,
			sourceBlueprintId: args.sourceBlueprintId,
			sourceBlueprintSnapshot: args.sourceBlueprintSnapshot,
			status: args.status,
			updatedAt: now,
		}
	);
}

async function archiveRetryInstanceIfNeeded(
	ctx: DealPackageActionCtx,
	workItem: PackageWorkItem
) {
	if (workItem.type !== "instance_retry") {
		return;
	}

	await ctx.runMutation(
		internal.documents.dealPackages.archiveDealDocumentInstance,
		{
			instanceId: workItem.instance._id,
			now: Date.now(),
		}
	);
}

function isRecipientResolutionError(error: unknown) {
	return (
		error instanceof Error && SIGNATORY_MAPPING_ERROR_RE.test(error.message)
	);
}

async function insertGeneratedDocumentRecord(
	ctx: DealPackageActionCtx,
	runtime: DealPackageRuntimeState,
	workItem: PackageWorkItem,
	sourceBlueprintSnapshot: DealDocumentSourceBlueprintSnapshot,
	args: {
		documensoEnvelopeId?: string;
		pdfRef: Id<"_storage">;
		signingStatus?: GeneratedDocumentRow["signingStatus"];
		templateVersionUsed: number;
	}
) {
	if (!sourceBlueprintSnapshot.templateId) {
		throw new ConvexError("Generated package instance is missing a templateId");
	}

	return ctx.runMutation(
		internal.documents.dealPackages.insertGeneratedDocumentInternal,
		{
			dealId: runtime.dealId,
			documensoEnvelopeId: args.documensoEnvelopeId,
			groupId: undefined,
			metadata: buildGeneratedDocumentMetadata({
				packageId: runtime.packageId,
				sourceBlueprintId: getWorkItemSourceBlueprintId(workItem),
			}),
			name: sourceBlueprintSnapshot.displayName,
			pdfStorageId: args.pdfRef,
			signingStatus: args.signingStatus,
			templateId: sourceBlueprintSnapshot.templateId,
			templateVersionUsed:
				sourceBlueprintSnapshot.templateVersion ?? args.templateVersionUsed,
		}
	);
}

async function createStaticReferenceInstance(
	ctx: DealPackageActionCtx,
	runtime: DealPackageRuntimeState,
	workItem: PackageWorkItem,
	sourceBlueprintSnapshot: DealDocumentSourceBlueprintSnapshot
) {
	const assetId = getWorkItemAssetId(workItem);
	if (!assetId) {
		await createPackageInstance(ctx, {
			dealId: runtime.dealId,
			kind: "static_reference",
			lastError: "Static blueprint is missing its source asset",
			mortgageId: runtime.mortgageId,
			packageId: runtime.packageId,
			sourceBlueprintId: getWorkItemSourceBlueprintId(workItem),
			sourceBlueprintSnapshot,
			status: "generation_failed",
		});
		return;
	}

	await createPackageInstance(ctx, {
		assetId,
		dealId: runtime.dealId,
		kind: "static_reference",
		mortgageId: runtime.mortgageId,
		packageId: runtime.packageId,
		sourceBlueprintId: getWorkItemSourceBlueprintId(workItem),
		sourceBlueprintSnapshot,
		status: "available",
	});
}

function buildTemplateGenerationFailureMessage(args: {
	missingVariables: string[];
}) {
	if (args.missingVariables.length > 0) {
		return `Missing variables: ${args.missingVariables.join(", ")}`;
	}

	return "Template generation failed";
}

function buildGeneratedDocumentMetadata(args: {
	packageId: Id<"dealDocumentPackages">;
	sourceBlueprintId?: Id<"mortgageDocumentBlueprints">;
}) {
	return {
		packageId: String(args.packageId),
		sourceBlueprintId: args.sourceBlueprintId
			? String(args.sourceBlueprintId)
			: undefined,
	};
}

async function createPendingRecipientResolutionInstance(
	ctx: DealPackageActionCtx,
	runtime: DealPackageRuntimeState,
	workItem: PackageWorkItem,
	sourceBlueprintSnapshot: DealDocumentSourceBlueprintSnapshot,
	message: string
) {
	await createPackageInstance(ctx, {
		dealId: runtime.dealId,
		kind: "generated",
		lastError: message,
		mortgageId: runtime.mortgageId,
		packageId: runtime.packageId,
		sourceBlueprintId: getWorkItemSourceBlueprintId(workItem),
		sourceBlueprintSnapshot,
		status: "signature_pending_recipient_resolution",
	});
}

async function createGeneratedFailureInstance(
	ctx: DealPackageActionCtx,
	runtime: DealPackageRuntimeState,
	workItem: PackageWorkItem,
	sourceBlueprintSnapshot: DealDocumentSourceBlueprintSnapshot,
	message: string
) {
	await createPackageInstance(ctx, {
		dealId: runtime.dealId,
		kind: "generated",
		lastError: message,
		mortgageId: runtime.mortgageId,
		packageId: runtime.packageId,
		sourceBlueprintId: getWorkItemSourceBlueprintId(workItem),
		sourceBlueprintSnapshot,
		status: "generation_failed",
	});
}

async function createGeneratedSuccessInstance(
	ctx: DealPackageActionCtx,
	runtime: DealPackageRuntimeState,
	workItem: PackageWorkItem,
	sourceBlueprintSnapshot: DealDocumentSourceBlueprintSnapshot,
	args: {
		pdfRef: Id<"_storage">;
		templateVersionUsed: number;
	}
) {
	if (!sourceBlueprintSnapshot.templateId) {
		throw new ConvexError("Generated package instance is missing a templateId");
	}

	const generatedDocumentId = await insertGeneratedDocumentRecord(
		ctx,
		runtime,
		workItem,
		sourceBlueprintSnapshot,
		{
			pdfRef: args.pdfRef,
			signingStatus: "not_applicable",
			templateVersionUsed: args.templateVersionUsed,
		}
	);

	await createPackageInstance(ctx, {
		dealId: runtime.dealId,
		generatedDocumentId,
		kind: "generated",
		mortgageId: runtime.mortgageId,
		packageId: runtime.packageId,
		sourceBlueprintId: getWorkItemSourceBlueprintId(workItem),
		sourceBlueprintSnapshot,
		status: "available",
	});
}

function toSignatureProviderRecipients(
	recipients: Array<{
		email: string;
		fields: Array<{
			fieldMeta?: {
				helpText?: string;
				placeholder?: string;
				readOnly?: boolean;
			};
			height: number;
			pageNumber: number;
			positionX: number;
			positionY: number;
			required: boolean;
			type: string;
			width: number;
		}>;
		name: string;
		platformRole: string;
		role: "APPROVER" | "SIGNER" | "VIEWER";
		signingOrder: number;
	}>
): SignatureProviderRecipientInput[] {
	return recipients.map((recipient) => ({
		email: recipient.email,
		fields: recipient.fields.map((field) => ({
			fieldMeta: field.fieldMeta,
			height: field.height,
			pageNumber: field.pageNumber,
			positionX: field.positionX,
			positionY: field.positionY,
			required: field.required,
			type: field.type,
			width: field.width,
		})),
		name: recipient.name,
		platformRole: recipient.platformRole,
		providerRole: recipient.role,
		signingOrder: recipient.signingOrder,
	}));
}

function buildEnvelopeRecipientRows(args: {
	createEnvelopeResult: SignatureProviderCreateEnvelopeResult;
	runtime: DealPackageRuntimeState;
	signatureRecipients: SignatureProviderRecipientInput[];
}) {
	const participantsByRole = new Map(
		args.runtime.signatoryParticipants.map((participant) => [
			participant.platformRole,
			participant,
		])
	);
	const providerRecipientsByRole = new Map(
		args.createEnvelopeResult.recipients.map((recipient) => [
			recipient.platformRole,
			recipient,
		])
	);

	return args.signatureRecipients.map((recipient) => {
		const providerRecipient = providerRecipientsByRole.get(
			recipient.platformRole
		);
		const participant = participantsByRole.get(recipient.platformRole);
		return {
			email: recipient.email,
			name: recipient.name,
			platformRole: recipient.platformRole,
			providerRecipientId: providerRecipient?.providerRecipientId,
			providerRole: recipient.providerRole,
			signingOrder: recipient.signingOrder,
			status: "pending" as const,
			userId: participant?.userId,
		};
	});
}

async function createSignableGeneratedInstance(
	ctx: DealPackageActionCtx,
	runtime: DealPackageRuntimeState,
	workItem: PackageWorkItem,
	sourceBlueprintSnapshot: DealDocumentSourceBlueprintSnapshot
) {
	if (!sourceBlueprintSnapshot.templateId) {
		return;
	}

	try {
		const generationResult = await ctx.runAction(
			internal.documentEngine.generation.generateSingleTemplate,
			{
				pinnedVersion: sourceBlueprintSnapshot.templateVersion ?? undefined,
				signatoryMapping: runtime.signatories,
				templateId: sourceBlueprintSnapshot.templateId,
				variables: runtime.variables,
			}
		);

		if (!(generationResult.success && generationResult.pdfRef)) {
			await createGeneratedFailureInstance(
				ctx,
				runtime,
				workItem,
				sourceBlueprintSnapshot,
				buildTemplateGenerationFailureMessage({
					missingVariables: generationResult.missingVariables,
				})
			);
			return;
		}

		const signatureRecipients = toSignatureProviderRecipients(
			generationResult.documensoConfig?.recipients ?? []
		);
		const generatedDocumentId = await insertGeneratedDocumentRecord(
			ctx,
			runtime,
			workItem,
			sourceBlueprintSnapshot,
			{
				pdfRef: generationResult.pdfRef,
				signingStatus: "draft",
				templateVersionUsed: generationResult.templateVersionUsed,
			}
		);
		const provider = getSignatureProvider("documenso", {
			fetchFn: fetch,
			getStorageBlob: (storageId) => ctx.storage.get(storageId),
		});

		try {
			const createdEnvelope = await provider.createEnvelope({
				dealId: runtime.dealId,
				generatedDocumentId,
				pdfStorageId: generationResult.pdfRef,
				recipients: signatureRecipients,
				title: sourceBlueprintSnapshot.displayName,
			});

			await ctx.runMutation(
				internal.documents.dealPackages
					.createSignatureEnvelopeWithRecipientsInternal,
				{
					dealId: runtime.dealId,
					generatedDocumentId,
					lastError: createdEnvelope.lastError,
					now: Date.now(),
					providerCode: "documenso",
					providerEnvelopeId: createdEnvelope.providerEnvelopeId,
					recipients: buildEnvelopeRecipientRows({
						createEnvelopeResult: createdEnvelope,
						runtime,
						signatureRecipients,
					}),
					status: createdEnvelope.status,
				}
			);

			await createPackageInstance(ctx, {
				dealId: runtime.dealId,
				generatedDocumentId,
				kind: "generated",
				lastError: createdEnvelope.lastError,
				mortgageId: runtime.mortgageId,
				packageId: runtime.packageId,
				sourceBlueprintId: getWorkItemSourceBlueprintId(workItem),
				sourceBlueprintSnapshot,
				status: mapEnvelopeStatusToDealDocumentInstanceStatus(
					createdEnvelope.status
				),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await ctx.runMutation(
				internal.documents.dealPackages
					.patchGeneratedDocumentSigningStateInternal,
				{
					generatedDocumentId,
					now: Date.now(),
					signingStatus: "provider_error",
				}
			);
			await createPackageInstance(ctx, {
				dealId: runtime.dealId,
				generatedDocumentId,
				kind: "generated",
				lastError: message,
				mortgageId: runtime.mortgageId,
				packageId: runtime.packageId,
				sourceBlueprintId: getWorkItemSourceBlueprintId(workItem),
				sourceBlueprintSnapshot,
				status: "generation_failed",
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (isRecipientResolutionError(error)) {
			await createPendingRecipientResolutionInstance(
				ctx,
				runtime,
				workItem,
				sourceBlueprintSnapshot,
				message
			);
			return;
		}

		await createGeneratedFailureInstance(
			ctx,
			runtime,
			workItem,
			sourceBlueprintSnapshot,
			message
		);
	}
}

async function createNonSignableGeneratedInstance(
	ctx: DealPackageActionCtx,
	runtime: DealPackageRuntimeState,
	workItem: PackageWorkItem,
	sourceBlueprintSnapshot: DealDocumentSourceBlueprintSnapshot
) {
	if (!sourceBlueprintSnapshot.templateId) {
		return;
	}

	try {
		const generationResult = await ctx.runAction(
			internal.documentEngine.generation.generateSingleTemplate,
			{
				pinnedVersion: sourceBlueprintSnapshot.templateVersion ?? undefined,
				signatoryMapping: runtime.signatories,
				templateId: sourceBlueprintSnapshot.templateId,
				variables: runtime.variables,
			}
		);

		if (!(generationResult.success && generationResult.pdfRef)) {
			await createGeneratedFailureInstance(
				ctx,
				runtime,
				workItem,
				sourceBlueprintSnapshot,
				buildTemplateGenerationFailureMessage({
					missingVariables: generationResult.missingVariables,
				})
			);
			return;
		}

		await createGeneratedSuccessInstance(
			ctx,
			runtime,
			workItem,
			sourceBlueprintSnapshot,
			{
				pdfRef: generationResult.pdfRef,
				templateVersionUsed: generationResult.templateVersionUsed,
			}
		);
	} catch (error) {
		await createGeneratedFailureInstance(
			ctx,
			runtime,
			workItem,
			sourceBlueprintSnapshot,
			error instanceof Error ? error.message : String(error)
		);
	}
}

async function processPackageWorkItem(
	ctx: DealPackageActionCtx,
	runtime: DealPackageRuntimeState,
	workItem: PackageWorkItem
) {
	await archiveRetryInstanceIfNeeded(ctx, workItem);

	const sourceBlueprintSnapshot = getWorkItemSourceBlueprintSnapshot(workItem);
	if (sourceBlueprintSnapshot.class === "private_templated_signable") {
		await createSignableGeneratedInstance(
			ctx,
			runtime,
			workItem,
			sourceBlueprintSnapshot
		);
		return;
	}

	if (sourceBlueprintSnapshot.class === "private_static") {
		await createStaticReferenceInstance(
			ctx,
			runtime,
			workItem,
			sourceBlueprintSnapshot
		);
		return;
	}

	if (sourceBlueprintSnapshot.class === "private_templated_non_signable") {
		await createNonSignableGeneratedInstance(
			ctx,
			runtime,
			workItem,
			sourceBlueprintSnapshot
		);
	}
}

async function prepareDealPackageRuntime(
	ctx: DealPackageActionCtx,
	args: DealPackageActionArgs
): Promise<DealPackagePreparation> {
	const snapshot = await ctx.runQuery(
		internal.documents.dealPackages.resolveDealParticipantSnapshotInternal,
		{
			dealId: args.dealId,
		}
	);
	const variables = buildDealVariableBag(snapshot);
	const signatories = buildSignatoryMappings(snapshot);
	const signatoryParticipants = buildSignatoryParticipants(snapshot);
	const existingPackage = await ctx.runQuery(
		internal.documents.dealPackages.getPackageByDealInternal,
		{
			dealId: args.dealId,
		}
	);
	const activeBlueprints =
		existingPackage?.blueprintSnapshots &&
		existingPackage.blueprintSnapshots.length > 0
			? []
			: await ctx.runQuery(
					internal.documents.dealPackages
						.listActivePackageBlueprintInputsInternal,
					{
						mortgageId: snapshot.mortgage._id,
					}
				);
	const blueprintSnapshots =
		existingPackage?.blueprintSnapshots &&
		existingPackage.blueprintSnapshots.length > 0
			? existingPackage.blueprintSnapshots
			: activeBlueprints.map((blueprint: BlueprintRow) =>
					toPackageBlueprintSnapshot(blueprint)
				);
	if (
		existingPackage?.status === "ready" &&
		!args.retry &&
		existingPackage.blueprintSnapshots &&
		existingPackage.blueprintSnapshots.length > 0
	) {
		return {
			result: buildCreateDocumentPackageResult({
				dealId: args.dealId,
				packageId: existingPackage._id,
				status: existingPackage.status,
			}),
		};
	}

	const packageId = await ctx.runMutation(
		internal.documents.dealPackages.ensurePackageHeaderInternal,
		{
			blueprintSnapshots,
			dealId: args.dealId,
			incrementRetryCount: Boolean(existingPackage),
			mortgageId: snapshot.mortgage._id,
			now: Date.now(),
		}
	);
	const existingInstances = await ctx.runQuery(
		internal.documents.dealPackages.listPackageInstancesInternal,
		{
			packageId,
		}
	);

	return {
		packageId,
		runtime: {
			dealId: args.dealId,
			mortgageId: snapshot.mortgage._id,
			packageId,
			signatories,
			signatoryParticipants,
			variables,
		},
		workItems: buildPackageWorkItems({
			blueprintSnapshots,
			existingInstances,
		}),
	};
}

async function finalizeDealPackage(
	ctx: DealPackageActionCtx,
	args: {
		dealId: Id<"deals">;
		packageId: Id<"dealDocumentPackages">;
	}
) {
	const finalRows = await ctx.runQuery(
		internal.documents.dealPackages.listPackageInstancesInternal,
		{ packageId: args.packageId }
	);
	const summary = summarizePackageStatus(finalRows);
	await ctx.runMutation(
		internal.documents.dealPackages.finalizePackageInternal,
		{
			lastError: summary.lastError,
			now: Date.now(),
			packageId: args.packageId,
			status: summary.status,
		}
	);

	return buildCreateDocumentPackageResult({
		dealId: args.dealId,
		packageId: args.packageId,
		status: summary.status,
	});
}

async function createDocumentPackageForDeal(
	ctx: DealPackageActionCtx,
	args: DealPackageActionArgs
): Promise<CreateDocumentPackageResult> {
	const preparation = await prepareDealPackageRuntime(ctx, args);
	if ("result" in preparation) {
		return preparation.result;
	}

	for (const workItem of preparation.workItems) {
		await processPackageWorkItem(ctx, preparation.runtime, workItem);
	}

	return finalizeDealPackage(ctx, {
		dealId: args.dealId,
		packageId: preparation.packageId,
	});
}

const retryPackageGenerationAction = adminAction.use(
	requirePermissionAction("deal:manage")
);

export const runCreateDocumentPackageInternal = internalAction({
	args: {
		dealId: v.id("deals"),
		retry: v.boolean(),
	},
	handler: async (ctx, args): Promise<CreateDocumentPackageResult> => {
		return createDocumentPackageForDeal(ctx, args);
	},
});

export const retryPackageGeneration = retryPackageGenerationAction
	.input({
		dealId: v.id("deals"),
	})
	.handler(async (ctx, args) => {
		return createDocumentPackageForDeal(ctx, {
			dealId: args.dealId,
			retry: true,
		});
	})
	.public();

export const getPortalDocumentPackage = dealQuery
	.input({
		dealId: v.id("deals"),
	})
	.handler(async (ctx, args) => {
		await assertDealAccess(ctx, args.dealId);

		const viewerUser = await getUserByAuthId(ctx, ctx.viewer.authId);
		return buildPackageSurface(ctx, args.dealId, {
			isFairLendAdmin: ctx.viewer.isFairLendAdmin,
			userId: viewerUser?._id,
		});
	})
	.public();

export async function readDealDocumentPackageSurface(
	ctx: Pick<QueryCtx, "db" | "storage">,
	dealId: Id<"deals">,
	viewer?: DealPackageViewerContext
) {
	return buildPackageSurface(ctx, dealId, viewer);
}
