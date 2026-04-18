import { ConvexError, v } from "convex/values";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type MutationCtx,
} from "../_generated/server";
import type { DealDocumentPackageStatus } from "../documents/contracts";
import { adminAction, adminMutation } from "../fluent";

type AdminMutationCtx = MutationCtx & {
	viewer: {
		authId: string;
		orgId?: string;
	};
};

interface StoredPdf {
	fileHash: string;
	fileRef: Id<"_storage">;
	fileSize: number;
	pageCount: number;
	pageDimensions: Array<{ height: number; page: number; width: number }>;
}

interface StorageWriterCtx {
	storage: {
		store: (blob: Blob) => Promise<Id<"_storage">>;
	};
}

async function createPdfBytes(label: string) {
	const pdf = await PDFDocument.create();
	const page = pdf.addPage([612, 792]);
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	page.drawText(label, {
		color: rgb(0, 0, 0),
		font,
		size: 20,
		x: 72,
		y: 700,
	});
	return new Uint8Array(await pdf.save());
}

async function sha256Hex(bytes: Uint8Array) {
	const digestInput = new Uint8Array(bytes);
	const digest = await crypto.subtle.digest("SHA-256", digestInput);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function storePdf(
	ctx: StorageWriterCtx,
	label: string
): Promise<StoredPdf> {
	const bytes = await createPdfBytes(label);
	const fileRef = await ctx.storage.store(
		new Blob([new Uint8Array(bytes)], { type: "application/pdf" })
	);
	const pdfDoc = await PDFDocument.load(bytes);
	const pageDimensions = Array.from(
		{ length: pdfDoc.getPageCount() },
		(_, index) => {
			const page = pdfDoc.getPage(index);
			const { height, width } = page.getSize();
			return { height, page: index, width };
		}
	);

	return {
		fileHash: await sha256Hex(bytes),
		fileRef,
		fileSize: bytes.byteLength,
		pageCount: pdfDoc.getPageCount(),
		pageDimensions,
	};
}

async function ensureSystemVariableRecord(
	ctx: Pick<MutationCtx, "db">,
	args: {
		key: string;
		label: string;
	}
) {
	const existing = await ctx.db
		.query("systemVariables")
		.withIndex("by_key", (query) => query.eq("key", args.key))
		.unique();
	if (existing) {
		return existing._id;
	}

	return ctx.db.insert("systemVariables", {
		createdAt: Date.now(),
		key: args.key,
		label: args.label,
		type: "string",
	});
}

async function insertStaticBlueprintFixture(
	ctx: Pick<MutationCtx, "db">,
	args: {
		description: string;
		displayName: string;
		fileHash: string;
		fileRef: Id<"_storage">;
		fileSize: number;
		mortgageId: Id<"mortgages">;
		pageCount: number;
		packageKey: string;
		packageLabel: string;
		viewerUserId: Id<"users">;
	}
) {
	const assetId = await ctx.db.insert("documentAssets", {
		description: args.description,
		fileHash: args.fileHash,
		fileRef: args.fileRef,
		fileSize: args.fileSize,
		mimeType: "application/pdf",
		name: args.displayName,
		originalFilename: `${args.displayName.toLowerCase().replace(/\s+/g, "-")}.pdf`,
		pageCount: args.pageCount,
		source: "admin_upload",
		uploadedAt: Date.now(),
		uploadedByUserId: args.viewerUserId,
	});
	const existingBlueprints = await ctx.db
		.query("mortgageDocumentBlueprints")
		.withIndex("by_mortgage_created_at", (query) =>
			query.eq("mortgageId", args.mortgageId)
		)
		.collect();
	const blueprintId = await ctx.db.insert("mortgageDocumentBlueprints", {
		archivedAt: undefined,
		archivedByUserId: undefined,
		assetId,
		category: "private",
		class: "private_static",
		createdAt: Date.now(),
		createdByUserId: args.viewerUserId,
		description: args.description,
		displayName: args.displayName,
		displayOrder:
			existingBlueprints.reduce(
				(maxOrder, blueprint) => Math.max(maxOrder, blueprint.displayOrder),
				-1
			) + 1,
		mortgageId: args.mortgageId,
		packageKey: args.packageKey,
		packageLabel: args.packageLabel,
		sourceDraftId: undefined,
		sourceKind: "asset",
		status: "active",
		templateId: undefined,
		templateSnapshotMeta: undefined,
		templateVersion: undefined,
	});

	return { assetId, blueprintId };
}

async function insertNonSignableTemplateBlueprintFixture(
	ctx: Pick<MutationCtx, "db">,
	args: {
		basePdf: StoredPdf;
		description: string;
		displayName: string;
		mortgageId: Id<"mortgages">;
		packageKey: string;
		packageLabel: string;
		variableKey: string;
		viewerUserId: Id<"users">;
	}
) {
	await ensureSystemVariableRecord(ctx, {
		key: args.variableKey,
		label: args.variableKey,
	});
	const basePdfId = await ctx.db.insert("documentBasePdfs", {
		description: `${args.displayName} base pdf`,
		fileHash: args.basePdf.fileHash,
		fileRef: args.basePdf.fileRef,
		fileSize: args.basePdf.fileSize,
		name: `${args.displayName} Base`,
		pageCount: args.basePdf.pageCount,
		pageDimensions: args.basePdf.pageDimensions,
		uploadedAt: Date.now(),
		uploadedBy: "e2e",
	});
	const templateId = await ctx.db.insert("documentTemplates", {
		basePdfHash: args.basePdf.fileHash,
		basePdfId,
		createdAt: Date.now(),
		currentPublishedVersion: 1,
		description: args.description,
		draft: {
			fields: [
				{
					id: `${args.displayName}-field`,
					label: "Borrower",
					position: {
						height: 18,
						page: 0,
						width: 220,
						x: 72,
						y: 120,
					},
					type: "interpolable",
					variableKey: args.variableKey,
				},
			],
			pdfmeSchema: [],
			signatories: [],
		},
		hasDraftChanges: false,
		name: args.displayName,
		updatedAt: Date.now(),
	});
	await ctx.db.insert("documentTemplateVersions", {
		basePdfHash: args.basePdf.fileHash,
		basePdfId,
		publishedAt: Date.now(),
		publishedBy: "e2e",
		snapshot: {
			fields: [
				{
					id: `${args.displayName}-field`,
					label: "Borrower",
					position: {
						height: 18,
						page: 0,
						width: 220,
						x: 72,
						y: 120,
					},
					type: "interpolable",
					variableKey: args.variableKey,
				},
			],
			pdfmeSchema: [],
			signatories: [],
		},
		templateId,
		version: 1,
	});
	const existingBlueprints = await ctx.db
		.query("mortgageDocumentBlueprints")
		.withIndex("by_mortgage_created_at", (query) =>
			query.eq("mortgageId", args.mortgageId)
		)
		.collect();
	await ctx.db.insert("mortgageDocumentBlueprints", {
		archivedAt: undefined,
		archivedByUserId: undefined,
		assetId: undefined,
		category: "private",
		class: "private_templated_non_signable",
		createdAt: Date.now(),
		createdByUserId: args.viewerUserId,
		description: args.description,
		displayName: args.displayName,
		displayOrder:
			existingBlueprints.reduce(
				(maxOrder, blueprint) => Math.max(maxOrder, blueprint.displayOrder),
				-1
			) + 1,
		mortgageId: args.mortgageId,
		packageKey: args.packageKey,
		packageLabel: args.packageLabel,
		sourceDraftId: undefined,
		sourceKind: "template_version",
		status: "active",
		templateId,
		templateSnapshotMeta: undefined,
		templateVersion: 1,
	});

	return { basePdfId, templateId };
}

export const resolveViewerUserIdInternal = internalQuery({
	args: {
		authId: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("authId", (query) => query.eq("authId", args.authId))
			.unique();
		if (!user) {
			throw new ConvexError("Viewer user not found");
		}

		return user._id;
	},
});

export const insertStaticBlueprintFixtureInternal = internalMutation({
	args: {
		description: v.string(),
		displayName: v.string(),
		fileHash: v.string(),
		fileRef: v.id("_storage"),
		fileSize: v.number(),
		mortgageId: v.id("mortgages"),
		pageCount: v.number(),
		packageKey: v.string(),
		packageLabel: v.string(),
		viewerUserId: v.id("users"),
	},
	handler: async (ctx, args) => {
		return insertStaticBlueprintFixture(ctx, args);
	},
});

export const insertNonSignableTemplateBlueprintFixtureInternal =
	internalMutation({
		args: {
			basePdf: v.object({
				fileHash: v.string(),
				fileRef: v.id("_storage"),
				fileSize: v.number(),
				pageCount: v.number(),
				pageDimensions: v.array(
					v.object({
						height: v.number(),
						page: v.number(),
						width: v.number(),
					})
				),
			}),
			description: v.string(),
			displayName: v.string(),
			mortgageId: v.id("mortgages"),
			packageKey: v.string(),
			packageLabel: v.string(),
			variableKey: v.string(),
			viewerUserId: v.id("users"),
		},
		handler: async (ctx, args) => {
			return insertNonSignableTemplateBlueprintFixture(ctx, args);
		},
	});

async function ensureActiveLender(ctx: AdminMutationCtx) {
	const existingLender = await ctx.db
		.query("lenders")
		.withIndex("by_org_status", (query) =>
			query.eq("orgId", ctx.viewer.orgId ?? "").eq("status", "active")
		)
		.first();
	if (existingLender) {
		const lenderUser = await ctx.db.get(existingLender.userId);
		if (!lenderUser?.authId) {
			throw new ConvexError("Active lender user is missing an authId");
		}

		return {
			lenderAuthId: lenderUser.authId,
			lenderId: existingLender._id,
		};
	}

	const users = await ctx.db.query("users").collect();
	const lenderUser =
		users.find((user) => user.authId && user.authId !== ctx.viewer.authId) ??
		users.find((user) => Boolean(user.authId)) ??
		null;
	if (!lenderUser?.authId) {
		throw new ConvexError(
			"No synced user is available to seed an active lender"
		);
	}

	const now = Date.now();
	const brokerId = await ctx.db.insert("brokers", {
		createdAt: now,
		lastTransitionAt: now,
		onboardedAt: now,
		orgId: ctx.viewer.orgId,
		status: "active",
		userId: lenderUser._id,
	});
	const lenderId = await ctx.db.insert("lenders", {
		accreditationStatus: "accredited",
		activatedAt: now,
		brokerId,
		createdAt: now,
		onboardingEntryPath: "admin_direct",
		orgId: ctx.viewer.orgId,
		status: "active",
		userId: lenderUser._id,
	});

	return {
		lenderAuthId: lenderUser.authId,
		lenderId,
	};
}

export const createDealForMortgage = adminMutation
	.input({
		mortgageId: v.id("mortgages"),
	})
	.handler(async (ctx, args) => {
		const mortgage = await ctx.db.get(args.mortgageId);
		if (!mortgage) {
			throw new ConvexError("Mortgage not found");
		}

		const { lenderAuthId, lenderId } = await ensureActiveLender(ctx);
		const now = Date.now();
		const dealId = await ctx.db.insert("deals", {
			buyerId: lenderAuthId,
			closingDate: now,
			createdAt: now,
			createdBy: ctx.viewer.authId,
			fractionalShare: 2500,
			lenderId,
			lockingFeeAmount: 7500,
			mortgageId: args.mortgageId,
			orgId: mortgage.orgId,
			sellerId: ctx.viewer.authId,
			status: "initiated",
		});

		return { dealId, lenderId };
	})
	.public();

export const seedPrivatePackageBlueprints = adminAction
	.input({
		mortgageId: v.id("mortgages"),
		packageKey: v.string(),
		packageLabel: v.string(),
		variableKey: v.string(),
	})
	.handler(
		async (
			ctx,
			args
		): Promise<{
			assetIds: Id<"documentAssets">[];
			basePdfIds: Id<"documentBasePdfs">[];
			templateIds: Id<"documentTemplates">[];
		}> => {
			const viewerUserId: Id<"users"> = await ctx.runQuery(
				internal.test.dealPackageE2e.resolveViewerUserIdInternal,
				{
					authId: ctx.viewer.authId,
				}
			);
			const staticPdf = await storePdf(ctx, "Private static memo");
			const staticBlueprint: {
				assetId: Id<"documentAssets">;
				blueprintId: Id<"mortgageDocumentBlueprints">;
			} = await ctx.runMutation(
				internal.test.dealPackageE2e.insertStaticBlueprintFixtureInternal,
				{
					description: "Private static memo",
					displayName: "Private static memo",
					fileHash: staticPdf.fileHash,
					fileRef: staticPdf.fileRef,
					fileSize: staticPdf.fileSize,
					mortgageId: args.mortgageId,
					pageCount: staticPdf.pageCount,
					packageKey: args.packageKey,
					packageLabel: args.packageLabel,
					viewerUserId,
				}
			);
			const templatedBasePdf = await storePdf(ctx, "Counsel memo Base");
			const templatedBlueprint: {
				basePdfId: Id<"documentBasePdfs">;
				templateId: Id<"documentTemplates">;
			} = await ctx.runMutation(
				internal.test.dealPackageE2e
					.insertNonSignableTemplateBlueprintFixtureInternal,
				{
					basePdf: templatedBasePdf,
					description: "Generated counsel memo",
					displayName: "Counsel memo",
					mortgageId: args.mortgageId,
					packageKey: args.packageKey,
					packageLabel: args.packageLabel,
					variableKey: args.variableKey,
					viewerUserId,
				}
			);

			return {
				assetIds: [staticBlueprint.assetId],
				basePdfIds: [templatedBlueprint.basePdfId],
				templateIds: [templatedBlueprint.templateId],
			};
		}
	)
	.public();

export const seedLateStaticBlueprint = adminAction
	.input({
		displayName: v.string(),
		mortgageId: v.id("mortgages"),
		packageKey: v.string(),
		packageLabel: v.string(),
	})
	.handler(
		async (
			ctx,
			args
		): Promise<{
			assetId: Id<"documentAssets">;
		}> => {
			const viewerUserId: Id<"users"> = await ctx.runQuery(
				internal.test.dealPackageE2e.resolveViewerUserIdInternal,
				{
					authId: ctx.viewer.authId,
				}
			);
			const staticPdf = await storePdf(ctx, args.displayName);
			const result: {
				assetId: Id<"documentAssets">;
				blueprintId: Id<"mortgageDocumentBlueprints">;
			} = await ctx.runMutation(
				internal.test.dealPackageE2e.insertStaticBlueprintFixtureInternal,
				{
					description: args.displayName,
					displayName: args.displayName,
					fileHash: staticPdf.fileHash,
					fileRef: staticPdf.fileRef,
					fileSize: staticPdf.fileSize,
					mortgageId: args.mortgageId,
					pageCount: staticPdf.pageCount,
					packageKey: args.packageKey,
					packageLabel: args.packageLabel,
					viewerUserId,
				}
			);

			return { assetId: result.assetId };
		}
	)
	.public();

export const runDealPackageForE2e = adminAction
	.input({
		dealId: v.id("deals"),
		retry: v.optional(v.boolean()),
	})
	.handler(
		async (
			ctx,
			args
		): Promise<{
			dealId: Id<"deals">;
			packageId: Id<"dealDocumentPackages">;
			status: DealDocumentPackageStatus;
		}> => {
			return ctx.runAction(
				internal.documents.dealPackages.runCreateDocumentPackageInternal,
				{
					dealId: args.dealId,
					retry: args.retry ?? false,
				}
			);
		}
	)
	.public();

export const cleanupDealPackageScenario = adminMutation
	.input({
		assetIds: v.array(v.id("documentAssets")),
		basePdfIds: v.array(v.id("documentBasePdfs")),
		dealId: v.id("deals"),
		mortgageId: v.id("mortgages"),
		templateIds: v.array(v.id("documentTemplates")),
	})
	.handler(async (ctx, args) => {
		const packageRows = await ctx.db
			.query("dealDocumentPackages")
			.withIndex("by_deal", (query) => query.eq("dealId", args.dealId))
			.collect();
		const instanceRows = (
			await Promise.all(
				packageRows.map((packageRow) =>
					ctx.db
						.query("dealDocumentInstances")
						.withIndex("by_package", (query) =>
							query.eq("packageId", packageRow._id)
						)
						.collect()
				)
			)
		).flat();
		const generatedDocumentIds = instanceRows
			.map((instance) => instance.generatedDocumentId)
			.filter(
				(id): id is Id<"generatedDocuments"> => id !== undefined && id !== null
			);
		const generatedDocuments = (
			await Promise.all(generatedDocumentIds.map((id) => ctx.db.get(id)))
		).filter((document): document is NonNullable<typeof document> =>
			Boolean(document)
		);
		const dealAccessRows = await ctx.db
			.query("dealAccess")
			.withIndex("by_deal", (query) => query.eq("dealId", args.dealId))
			.collect();
		const blueprintRows = await ctx.db
			.query("mortgageDocumentBlueprints")
			.withIndex("by_mortgage_created_at", (query) =>
				query.eq("mortgageId", args.mortgageId)
			)
			.collect();

		for (const row of instanceRows) {
			await ctx.db.delete(row._id);
		}
		for (const row of packageRows) {
			await ctx.db.delete(row._id);
		}
		for (const document of generatedDocuments) {
			await ctx.storage.delete(document.pdfStorageId);
		}
		for (const id of generatedDocumentIds) {
			await ctx.db.delete(id);
		}
		for (const row of dealAccessRows) {
			await ctx.db.delete(row._id);
		}
		for (const row of blueprintRows) {
			await ctx.db.delete(row._id);
		}
		for (const templateId of args.templateIds) {
			const versions = await ctx.db
				.query("documentTemplateVersions")
				.withIndex("by_template", (query) => query.eq("templateId", templateId))
				.collect();
			for (const version of versions) {
				await ctx.db.delete(version._id);
			}
			await ctx.db.delete(templateId);
		}
		for (const basePdfId of args.basePdfIds) {
			const basePdf = await ctx.db.get(basePdfId);
			if (basePdf) {
				await ctx.storage.delete(basePdf.fileRef);
			}
			await ctx.db.delete(basePdfId);
		}
		for (const assetId of args.assetIds) {
			const asset = await ctx.db.get(assetId);
			if (asset) {
				await ctx.storage.delete(asset.fileRef);
			}
			await ctx.db.delete(assetId);
		}

		await ctx.db.delete(args.dealId);

		return {
			deletedAssets: args.assetIds.length,
			deletedBasePdfs: args.basePdfIds.length,
			deletedBlueprints: blueprintRows.length,
			deletedDealAccessRows: dealAccessRows.length,
			deletedGeneratedDocuments: generatedDocumentIds.length,
			deletedInstances: instanceRows.length,
			deletedPackages: packageRows.length,
			deletedTemplates: args.templateIds.length,
		};
	})
	.public();
