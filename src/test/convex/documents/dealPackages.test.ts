import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { api, internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../convex/constants";
import {
	createMockViewer,
	createTestConvex,
	ensureSeededIdentity,
} from "../../auth/helpers";
import { FAIRLEND_ADMIN } from "../../auth/identities";

async function sha256Hex(bytes: Uint8Array) {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function createPdfBytes(label: string) {
	const pdf = await PDFDocument.create();
	const page = pdf.addPage([612, 792]);
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	page.drawText(label, {
		x: 72,
		y: 700,
		size: 20,
		font,
		color: rgb(0, 0, 0),
	});
	return new Uint8Array(await pdf.save());
}

interface MockDocumensoOptions {
	envelopeStatus?: "COMPLETED" | "PENDING";
	failCertificateDownload?: boolean;
	failCreate?: boolean;
	failDistribute?: boolean;
	failSignedDownload?: boolean;
	includeCompletionCertificate?: boolean;
	recipientEmail?: string;
	recipientName?: string;
	recipientSigningStatus?: "SIGNED" | null;
	signingUrl?: string;
}

function installMockDocumensoFetch(options?: MockDocumensoOptions) {
	const envelopeId = "doc_env_1";
	const envelopeItemId = "doc_item_1";
	const completionCertificateItemId = "doc_cert_1";
	const recipientId = "doc_rcpt_1";
	const signingUrl =
		options?.signingUrl ?? "https://documenso.test/sign/session_1";
	const recipientSigningStatus = options?.recipientSigningStatus ?? null;
	const envelopeStatus = options?.envelopeStatus ?? "PENDING";
	const signedPdfBytes = new TextEncoder().encode("signed pdf bytes");
	const completionCertificateBytes = new TextEncoder().encode(
		"completion certificate bytes"
	);
	const envelopeItems = [
		{
			id: envelopeItemId,
			name: "Borrower signature packet",
			type: "DOCUMENT",
		},
		...(options?.includeCompletionCertificate
			? [
					{
						id: completionCertificateItemId,
						name: "Completion Certificate",
						type: "CERTIFICATE",
					},
				]
			: []),
	];

	const recipientPayload = {
		email: options?.recipientEmail ?? "borrower.phase7@test.fairlend.ca",
		id: recipientId,
		name: options?.recipientName ?? "Ada Borrower",
		readStatus: recipientSigningStatus ? "OPENED" : null,
		role: "SIGNER",
		signedAt:
			recipientSigningStatus === "SIGNED"
				? "2026-05-15T16:00:00.000Z"
				: null,
		signingOrder: 0,
		signingStatus: recipientSigningStatus,
		signingUrl,
		token: "token_1",
	};

	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const parsedUrl = new URL(url);
		const version = parsedUrl.searchParams.get("version");
		if (url.endsWith("/envelope/create")) {
			if (options?.failCreate) {
				return new Response(JSON.stringify({ error: "create failed" }), {
					status: 500,
				});
			}
			return new Response(JSON.stringify({ id: envelopeId }), { status: 200 });
		}
		if (url.endsWith(`/envelope/${envelopeId}`)) {
			return new Response(
				JSON.stringify({
					envelopeItems,
					id: envelopeId,
					recipients: [recipientPayload],
					status: envelopeStatus,
					updatedAt: "2026-05-15T16:00:00.000Z",
				}),
				{ status: 200 }
			);
		}
		if (
			parsedUrl.pathname.endsWith(`/envelope/item/${envelopeItemId}/download`) &&
			version === "signed"
		) {
			if (options?.failSignedDownload) {
				return new Response(JSON.stringify({ error: "signed download failed" }), {
					status: 500,
				});
			}
			return new Response(signedPdfBytes, {
				headers: { "Content-Type": "application/pdf" },
				status: 200,
			});
		}
		if (
			parsedUrl.pathname.endsWith(`/envelope/item/${completionCertificateItemId}/download`)
		) {
			if (options?.failCertificateDownload) {
				return new Response(
					JSON.stringify({ error: "certificate download failed" }),
					{
						status: 500,
					}
				);
			}
			return new Response(completionCertificateBytes, {
				headers: { "Content-Type": "application/pdf" },
				status: 200,
			});
		}
		if (
			parsedUrl.pathname.endsWith(`/envelope/item/${envelopeItemId}/download`) &&
			version === "certificate"
		) {
			if (!options?.includeCompletionCertificate) {
				return new Response(
					JSON.stringify({ error: "certificate not available" }),
					{ status: 404 }
				);
			}
			if (options?.failCertificateDownload) {
				return new Response(
					JSON.stringify({ error: "certificate download failed" }),
					{
						status: 500,
					}
				);
			}
			return new Response(completionCertificateBytes, {
				headers: { "Content-Type": "application/pdf" },
				status: 200,
			});
		}
		if (url.endsWith("/envelope/distribute")) {
			if (options?.failDistribute) {
				return new Response(JSON.stringify({ error: "distribution failed" }), {
					status: 500,
				});
			}
			return new Response(
				JSON.stringify({
					id: envelopeId,
					recipients: [recipientPayload],
					success: true,
				}),
				{ status: 200 }
			);
		}
		if (url.endsWith(`/envelope/recipient/${recipientId}`)) {
			return new Response(JSON.stringify(recipientPayload), { status: 200 });
		}

		return new Response(
			JSON.stringify({
				init,
				url,
			}),
			{ status: 404 }
		);
	});

	vi.stubGlobal("fetch", fetchMock);
	process.env.DOCUMENSO_API_TOKEN = "documenso_test_token";

	return {
		completionCertificateItemId,
		envelopeId,
		envelopeItemId,
		fetchMock,
		recipientId,
		signingUrl,
	};
}

function buildArchiveEffectArgs(dealId: Id<"deals">) {
	return {
		effectName: "archiveSignedDocuments",
		entityId: dealId,
		entityType: "deal" as const,
		eventType: "ALL_PARTIES_SIGNED",
		journalEntryId: "journal_archive_signed_documents",
		source: {
			actorId: "test-admin",
			actorType: "admin" as const,
			channel: "admin_dashboard" as const,
		},
	};
}

async function seedDocumentAsset(
	t: ReturnType<typeof createTestConvex>,
	args: {
		contents: Uint8Array;
		description?: string;
		name: string;
	}
) {
	await ensureSeededIdentity(t, FAIRLEND_ADMIN);

	return t.run(async (ctx) => {
		const adminUser = await ctx.db
			.query("users")
			.withIndex("authId", (query) => query.eq("authId", FAIRLEND_ADMIN.subject))
			.unique();
		if (!adminUser) {
			throw new Error("Admin user not found");
		}

		const fileRef = await (
			ctx.storage as unknown as {
				store: (blob: Blob) => Promise<Id<"_storage">>;
			}
		).store(new Blob([args.contents], { type: "application/pdf" }));

		return ctx.db.insert("documentAssets", {
			description: args.description ?? args.name,
			fileHash: await sha256Hex(args.contents),
			fileRef,
			fileSize: args.contents.byteLength,
			mimeType: "application/pdf",
			name: args.name,
			originalFilename: `${args.name.toLowerCase().replace(/\s+/g, "-")}.pdf`,
			pageCount: 1,
			source: "admin_upload",
			uploadedAt: Date.now(),
			uploadedByUserId: adminUser._id,
		});
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	delete process.env.DOCUMENSO_API_KEY;
	delete process.env.DOCUMENSO_API_TOKEN;
	delete process.env.DOCUMENSO_API_BASE_URL;
	delete process.env.DOCUMENSO_APP_BASE_URL;
	delete process.env.DOCUMENSO_TIMEOUT_MS;
});

async function seedPublishedTemplate(
	t: ReturnType<typeof createTestConvex>,
	args: {
		fields: Array<{
			id: string;
			position: {
				height: number;
				page: number;
				width: number;
				x: number;
				y: number;
			};
			required?: boolean;
			signableType?: "SIGNATURE";
			signatoryPlatformRole?: string;
			type: "interpolable" | "signable";
			variableKey?: string;
		}>;
		name: string;
		signatories?: Array<{
			order: number;
			platformRole: string;
			role: "approver" | "signatory" | "viewer";
		}>;
	}
) {
	const bytes = await createPdfBytes(args.name);
	const fileHash = await sha256Hex(bytes);

	return t.run(async (ctx) => {
		const fileRef = await (
			ctx.storage as unknown as {
				store: (blob: Blob) => Promise<Id<"_storage">>;
			}
		).store(new Blob([bytes], { type: "application/pdf" }));

		const basePdfId = await ctx.db.insert("documentBasePdfs", {
			fileHash,
			fileRef,
			fileSize: bytes.byteLength,
			name: `${args.name} Base`,
			pageCount: 1,
			pageDimensions: [{ height: 792, page: 0, width: 612 }],
			uploadedAt: Date.now(),
			uploadedBy: "test_admin",
		});
		const templateId = await ctx.db.insert("documentTemplates", {
			basePdfHash: fileHash,
			basePdfId,
			createdAt: Date.now(),
			currentPublishedVersion: 1,
			description: `${args.name} description`,
			draft: {
				fields: args.fields,
				pdfmeSchema: [],
				signatories: args.signatories ?? [],
			},
			hasDraftChanges: false,
			name: args.name,
			updatedAt: Date.now(),
		});
		await ctx.db.insert("documentTemplateVersions", {
			basePdfHash: fileHash,
			basePdfId,
			publishedAt: Date.now(),
			publishedBy: "test_admin",
			snapshot: {
				fields: args.fields,
				pdfmeSchema: [],
				signatories: args.signatories ?? [],
			},
			templateId,
			version: 1,
		});

		return templateId;
	});
}

async function seedSystemVariable(
	t: ReturnType<typeof createTestConvex>,
	key: string,
	label = key
) {
	return t.run(async (ctx) => {
		const existing = await ctx.db
			.query("systemVariables")
			.withIndex("by_key", (query) => query.eq("key", key))
			.unique();
		if (existing) {
			return existing._id;
		}

		return ctx.db.insert("systemVariables", {
			createdAt: Date.now(),
			key,
			label,
			type: "string",
		});
	});
}

async function insertListing(
	t: ReturnType<typeof createTestConvex>,
	args: {
		mortgageId: Id<"mortgages">;
		propertyId: Id<"properties">;
		title: string;
	}
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("listings", {
			adminNotes: undefined,
			approximateLatitude: undefined,
			approximateLongitude: undefined,
			borrowerSignal: { stale: true },
			city: "Toronto",
			createdAt: Date.now(),
			dataSource: "mortgage_pipeline",
			delistedAt: undefined,
			delistReason: undefined,
			description: "Deal listing projection",
			displayOrder: 0,
			featured: false,
			heroImages: [],
			interestRate: 9.5,
			lastTransitionAt: undefined,
			latestAppraisalDate: "2026-05-01",
			latestAppraisalValueAsIs: 425_000,
			lienPosition: 1,
			loanType: "conventional",
			ltvRatio: 58,
			machineContext: undefined,
			marketplaceCopy: "Marketplace copy",
			maturityDate: "2027-04-30",
			monthlyPayment: 2_450,
			mortgageId: args.mortgageId,
			paymentFrequency: "monthly",
			paymentHistory: { stale: true },
			principal: 250_000,
			propertyId: args.propertyId,
			propertyType: "residential",
			province: "ON",
			publicDocumentIds: [],
			publishedAt: undefined,
			rateType: "fixed",
			seoSlug: "deal-package-listing",
			status: "draft",
			termMonths: 12,
			title: args.title,
			updatedAt: Date.now(),
			viewCount: 0,
		});
	});
}

async function seedDealPackageFixture(
	t: ReturnType<typeof createTestConvex>,
	args?: {
		includeListing?: boolean;
		requireLawyerSignatory?: boolean;
		signablePlatformRole?: "borrower_primary" | "lawyer_primary" | "lender_primary";
		templatedVariableKey?: string;
	}
) {
	await ensureSeededIdentity(t, FAIRLEND_ADMIN);

	const lenderIdentity = createMockViewer({
		email: "lender.phase7@test.fairlend.ca",
		firstName: "Lena",
		lastName: "Lender",
		orgId: FAIRLEND_STAFF_ORG_ID,
		orgName: "FairLend Staff",
		roles: ["lender"],
		subject: "user_phase7_lender",
	});
	const sellerIdentity = createMockViewer({
		email: "seller.phase7@test.fairlend.ca",
		firstName: "Sam",
		lastName: "Seller",
		orgId: FAIRLEND_STAFF_ORG_ID,
		orgName: "FairLend Staff",
		roles: ["member"],
		subject: "user_phase7_seller",
	});
	const brokerIdentity = createMockViewer({
		email: "broker.phase7@test.fairlend.ca",
		firstName: "Brooke",
		lastName: "Broker",
		orgId: FAIRLEND_STAFF_ORG_ID,
		orgName: "FairLend Staff",
		roles: ["broker"],
		subject: "user_phase7_broker",
	});
	const borrowerIdentity = createMockViewer({
		email: "borrower.phase7@test.fairlend.ca",
		firstName: "Ada",
		lastName: "Borrower",
		orgId: FAIRLEND_STAFF_ORG_ID,
		orgName: "FairLend Staff",
		roles: ["member"],
		subject: "user_phase7_borrower",
	});
	const lawyerIdentity = createMockViewer({
		email: "lawyer.phase7@test.fairlend.ca",
		firstName: "Layla",
		lastName: "Lawyer",
		orgId: FAIRLEND_STAFF_ORG_ID,
		orgName: "FairLend Staff",
		roles: ["member"],
		subject: "user_phase7_lawyer",
	});

	const [lenderUserId, sellerUserId, brokerUserId, borrowerUserId] =
		await Promise.all([
			ensureSeededIdentity(t, lenderIdentity),
			ensureSeededIdentity(t, sellerIdentity),
			ensureSeededIdentity(t, brokerIdentity),
			ensureSeededIdentity(t, borrowerIdentity),
		]);
	await ensureSeededIdentity(t, lawyerIdentity);

	await seedSystemVariable(
		t,
		args?.templatedVariableKey ?? "borrower_primary_full_name",
		"Borrower primary full name"
	);

	const staticAssetId = await seedDocumentAsset(t, {
		contents: await createPdfBytes("Private static package doc"),
		name: "Private Static Package Doc",
	});
	const nonSignableTemplateId = await seedPublishedTemplate(t, {
		fields: [
			{
				id: "field_non_signable_1",
				position: { height: 18, page: 0, width: 220, x: 72, y: 120 },
				type: "interpolable",
				variableKey:
					args?.templatedVariableKey ?? "borrower_primary_full_name",
			},
		],
		name: "Mortgage Counsel Memo",
		signatories: args?.requireLawyerSignatory
			? [
					{
						order: 0,
						platformRole: "lawyer_primary",
						role: "viewer",
					},
				]
			: [],
	});
	const signableTemplateId = await seedPublishedTemplate(t, {
		fields: [
			{
				id: "field_signable_1",
				position: { height: 18, page: 0, width: 180, x: 72, y: 180 },
				required: true,
				signableType: "SIGNATURE",
				signatoryPlatformRole: args?.signablePlatformRole ?? "borrower_primary",
				type: "signable",
			},
		],
		name: "Borrower Signature Packet",
		signatories: [
			{
				order: 0,
				platformRole: args?.signablePlatformRole ?? "borrower_primary",
				role: "signatory",
			},
		],
	});

	return t.run(async (ctx) => {
		const adminUser = await ctx.db
			.query("users")
			.withIndex("authId", (query) => query.eq("authId", FAIRLEND_ADMIN.subject))
			.unique();
		if (!adminUser) {
			throw new Error("Admin user not found");
		}

		const brokerId = await ctx.db.insert("brokers", {
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
			onboardedAt: Date.now(),
			orgId: FAIRLEND_STAFF_ORG_ID,
			status: "active",
			userId: brokerUserId,
		});
		const lenderId = await ctx.db.insert("lenders", {
			accreditationStatus: "accredited",
			activatedAt: Date.now(),
			brokerId,
			createdAt: Date.now(),
			onboardingEntryPath: "admin_direct",
			orgId: FAIRLEND_STAFF_ORG_ID,
			status: "active",
			userId: lenderUserId,
		});
		const borrowerId = await ctx.db.insert("borrowers", {
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
			onboardedAt: Date.now(),
			orgId: FAIRLEND_STAFF_ORG_ID,
			status: "active",
			userId: borrowerUserId,
		});
		const propertyId = await ctx.db.insert("properties", {
			city: "Toronto",
			createdAt: Date.now(),
			postalCode: "M5H 1J9",
			propertyType: "residential",
			province: "ON",
			streetAddress: "123 King St W",
		});
		const mortgageId = await ctx.db.insert("mortgages", {
			amortizationMonths: 300,
			brokerOfRecordId: brokerId,
			collectionExecutionMode: "app_owned",
			collectionExecutionUpdatedAt: Date.now(),
			createdAt: Date.now(),
			creationSource: "admin_origination",
			firstPaymentDate: "2026-06-01",
			interestAdjustmentDate: "2026-05-01",
			interestRate: 9.5,
			lienPosition: 1,
			loanType: "conventional",
			machineContext: { lastPaymentAt: 0, missedPayments: 0 },
			maturityDate: "2027-04-30",
			orgId: FAIRLEND_STAFF_ORG_ID,
			originationPath: "admin_direct",
			originatedByUserId: FAIRLEND_ADMIN.subject,
			originatingWorkflowId: "origination_case_phase7",
			originatingWorkflowType: "admin_origination_case",
			paymentAmount: 2_450,
			paymentBootstrapScheduleRuleMissing: false,
			paymentFrequency: "monthly",
			principal: 250_000,
			propertyId,
			rateType: "fixed",
			status: "active",
			termMonths: 12,
			termStartDate: "2026-05-01",
			workflowSourceKey: "origination_case_phase7",
		});
		await ctx.db.insert("mortgageValuationSnapshots", {
			createdAt: Date.now(),
			createdByUserId: adminUser._id,
			mortgageId,
			relatedDocumentAssetId: undefined,
			source: "admin_origination",
			valuationDate: "2026-05-01",
			valueAsIs: 425_000,
		});
		await ctx.db.insert("mortgageBorrowers", {
			addedAt: Date.now(),
			borrowerId,
			mortgageId,
			role: "primary",
		});
		const dealId = await ctx.db.insert("deals", {
			buyerId: lenderIdentity.subject,
			closingDate: new Date("2026-05-15T12:00:00.000Z").getTime(),
			createdAt: Date.now(),
			createdBy: FAIRLEND_ADMIN.subject,
			fractionalShare: 2_500,
			lawyerType: args?.requireLawyerSignatory ? "platform_lawyer" : undefined,
			lockingFeeAmount: 7_500,
			lenderId,
			mortgageId,
			orgId: FAIRLEND_STAFF_ORG_ID,
			sellerId: sellerIdentity.subject,
			status: "initiated",
		});

		if (args?.includeListing) {
			await ctx.db.insert("listings", {
				adminNotes: undefined,
				approximateLatitude: undefined,
				approximateLongitude: undefined,
				borrowerSignal: { stale: true },
				city: "Toronto",
				createdAt: Date.now(),
				dataSource: "mortgage_pipeline",
				delistedAt: undefined,
				delistReason: undefined,
				description: "Deal listing projection",
				displayOrder: 0,
				featured: false,
				heroImages: [],
				interestRate: 9.5,
				lastTransitionAt: undefined,
				latestAppraisalDate: "2026-05-01",
				latestAppraisalValueAsIs: 425_000,
				lienPosition: 1,
				loanType: "conventional",
				ltvRatio: 58,
				machineContext: undefined,
				marketplaceCopy: "Marketplace copy",
				maturityDate: "2027-04-30",
				monthlyPayment: 2_450,
				mortgageId,
				paymentFrequency: "monthly",
				paymentHistory: { stale: true },
				principal: 250_000,
				propertyId,
				propertyType: "residential",
				province: "ON",
				publicDocumentIds: [],
				publishedAt: undefined,
				rateType: "fixed",
				seoSlug: "deal-package-listing",
				status: "draft",
				termMonths: 12,
				title: "King West bridge opportunity",
				updatedAt: Date.now(),
				viewCount: 0,
			});
		}

		await ctx.db.insert("mortgageDocumentBlueprints", {
			archivedAt: undefined,
			archivedByUserId: undefined,
			assetId: staticAssetId,
			category: "private",
			class: "private_static",
			createdAt: Date.now(),
			createdByUserId: adminUser._id,
			description: "Private static package document",
			displayName: "Private static memo",
			displayOrder: 0,
			mortgageId,
			packageKey: "closing",
			packageLabel: "Closing package",
			sourceDraftId: undefined,
			sourceKind: "asset",
			status: "active",
			templateId: undefined,
			templateSnapshotMeta: undefined,
			templateVersion: undefined,
		});
		await ctx.db.insert("mortgageDocumentBlueprints", {
			archivedAt: undefined,
			archivedByUserId: undefined,
			assetId: undefined,
			category: "private",
			class: "private_templated_non_signable",
			createdAt: Date.now(),
			createdByUserId: adminUser._id,
			description: "Generated counsel memo",
			displayName: "Counsel memo",
			displayOrder: 1,
			mortgageId,
			packageKey: "closing",
			packageLabel: "Closing package",
			sourceDraftId: undefined,
			sourceKind: "template_version",
			status: "active",
			templateId: nonSignableTemplateId,
			templateSnapshotMeta: undefined,
			templateVersion: 1,
		});
		await ctx.db.insert("mortgageDocumentBlueprints", {
			archivedAt: undefined,
			archivedByUserId: undefined,
			assetId: undefined,
			category: "private",
			class: "private_templated_signable",
			createdAt: Date.now(),
			createdByUserId: adminUser._id,
			description: "Signature packet placeholder",
			displayName: "Borrower signature packet",
			displayOrder: 2,
			mortgageId,
			packageKey: "closing",
			packageLabel: "Closing package",
			sourceDraftId: undefined,
			sourceKind: "template_version",
			status: "active",
			templateId: signableTemplateId,
			templateSnapshotMeta: undefined,
			templateVersion: 1,
		});

		return {
			brokerIdentity,
			borrowerId,
			borrowerIdentity,
			dealId,
			lenderIdentity,
			lawyerIdentity,
			mortgageId,
			propertyId,
		};
	});
}

describe("documents/dealPackages", () => {
	it("materializes immutable deal packages from active private mortgage blueprints", async () => {
		installMockDocumensoFetch();
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedDealPackageFixture(t, {
			includeListing: true,
			templatedVariableKey: "borrower_primary_full_name",
		});

		const result = await t.action(
			internal.documents.dealPackages.runCreateDocumentPackageInternal,
			{
				dealId: fixture.dealId,
				retry: false,
			}
		);
		const packageSurface = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);
		const dealDetail = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.deals.queries.getPortalDealDetail,
			{
				dealId: fixture.dealId,
			}
		);
		const generatedDocuments = await t.run((ctx) =>
			ctx.db.query("generatedDocuments").collect()
		);
		const signatureEnvelopes = await t.run((ctx) =>
			ctx.db.query("signatureEnvelopes").collect()
		);
		const signatureRecipients = await t.run((ctx) =>
			ctx.db.query("signatureRecipients").collect()
		);

		expect(result.status).toBe("ready");
		expect(packageSurface.package).toMatchObject({
			dealId: fixture.dealId,
			mortgageId: fixture.mortgageId,
			retryCount: 0,
			status: "ready",
		});
		expect(packageSurface.instances).toHaveLength(3);
		expect(
			packageSurface.instances.map((instance) => instance.displayName)
		).toEqual([
			"Private static memo",
			"Counsel memo",
			"Borrower signature packet",
		]);
		expect(packageSurface.instances).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					displayName: "Private static memo",
					kind: "static_reference",
					status: "available",
					url: expect.any(String),
				}),
				expect.objectContaining({
					displayName: "Counsel memo",
					generatedDocumentId: expect.any(String),
					kind: "generated",
					status: "available",
					url: expect.any(String),
				}),
				expect.objectContaining({
					displayName: "Borrower signature packet",
					generatedDocumentId: expect.any(String),
					kind: "generated",
					signing: expect.objectContaining({
						generatedDocumentSigningStatus: "sent",
						status: "sent",
					}),
					status: "signature_sent",
					url: null,
				}),
			])
		);
		expect(generatedDocuments).toHaveLength(2);
		expect(generatedDocuments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					entityId: String(fixture.dealId),
					entityType: "deal",
					name: "Counsel memo",
					signingStatus: "not_applicable",
				}),
				expect.objectContaining({
					documensoEnvelopeId: "doc_env_1",
					entityId: String(fixture.dealId),
					entityType: "deal",
					name: "Borrower signature packet",
					signingStatus: "sent",
				}),
			])
		);
		expect(signatureEnvelopes).toEqual([
			expect.objectContaining({
				dealId: fixture.dealId,
				providerCode: "documenso",
				providerEnvelopeId: "doc_env_1",
				status: "sent",
			}),
		]);
		expect(signatureRecipients).toEqual([
			expect.objectContaining({
				email: "borrower.phase7@test.fairlend.ca",
				platformRole: "borrower_primary",
				providerRecipientId: "doc_rcpt_1",
				status: "pending",
			}),
		]);
		expect(dealDetail.documentPackage?.status).toBe("ready");
		expect(
			dealDetail.documentInstances.filter(
				(instance) =>
					instance.status === "available" ||
					instance.status === "signature_sent"
			)
		).toHaveLength(3);
	});

	it("archives failed instances and creates successor rows on retry", async () => {
		installMockDocumensoFetch();
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedDealPackageFixture(t, {
			includeListing: false,
			requireLawyerSignatory: true,
			templatedVariableKey: "borrower_primary_full_name",
		});

		const firstResult = await t.action(
			internal.documents.dealPackages.runCreateDocumentPackageInternal,
			{
				dealId: fixture.dealId,
				retry: false,
			}
		);
		const packageAfterFirstRun = await t.withIdentity(
			FAIRLEND_ADMIN
		).query(api.documents.dealPackages.getPortalDocumentPackage, {
			dealId: fixture.dealId,
		});

		expect(firstResult.status).toBe("partial_failure");
		expect(packageAfterFirstRun.package).toMatchObject({
			retryCount: 0,
			status: "partial_failure",
		});
		expect(packageAfterFirstRun.instances).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					displayName: "Counsel memo",
					status: "generation_failed",
					lastError: expect.stringContaining("lawyer_primary"),
				}),
				expect.objectContaining({
					displayName: "Private static memo",
					status: "available",
				}),
			])
		);

		await t.run(async (ctx) => {
			await ctx.db.insert("closingTeamAssignments", {
				assignedAt: Date.now(),
				assignedBy: FAIRLEND_ADMIN.subject,
				mortgageId: fixture.mortgageId,
				role: "closing_lawyer",
				userId: fixture.lawyerIdentity.subject,
			});
		});

		const retryResult = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.documents.dealPackages.retryPackageGeneration,
			{
				dealId: fixture.dealId,
			}
		);
		const packageAfterRetry = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);
		const allInstances = await t.run((ctx) =>
			ctx.db
				.query("dealDocumentInstances")
				.withIndex("by_deal", (query) => query.eq("dealId", fixture.dealId))
				.collect()
		);

		expect(retryResult.status).toBe("ready");
		expect(packageAfterRetry.package).toMatchObject({
			retryCount: 1,
			status: "ready",
		});
		expect(
			packageAfterRetry.instances.filter(
				(instance) =>
					instance.displayName === "Counsel memo" &&
					instance.status === "available"
			)
		).toHaveLength(1);
		expect(
			allInstances.filter(
				(instance) =>
					instance.sourceBlueprintSnapshot.displayName === "Counsel memo" &&
					instance.status === "archived" &&
					instance.archivedAt
			)
		).toHaveLength(1);
	});

	it("replays missing package members from the frozen blueprint snapshot without adopting later blueprint changes", async () => {
		installMockDocumensoFetch();
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedDealPackageFixture(t, {
			includeListing: true,
			templatedVariableKey: "borrower_primary_full_name",
		});

		const frozenBlueprints = await t.query(
			internal.documents.dealPackages.listActivePackageBlueprintInputsInternal,
			{
				mortgageId: fixture.mortgageId,
			}
		);

		await t.run(async (ctx) => {
			const packageId = await ctx.db.insert("dealDocumentPackages", {
				archivedAt: undefined,
				blueprintSnapshots: frozenBlueprints.map((blueprint) => ({
					assetId: blueprint.assetId,
					sourceBlueprintId: blueprint._id,
					sourceBlueprintSnapshot: {
						category: blueprint.category,
						class: blueprint.class,
						description: blueprint.description,
						displayName: blueprint.displayName,
						displayOrder: blueprint.displayOrder,
						packageKey: blueprint.packageKey,
						packageLabel: blueprint.packageLabel,
						templateId: blueprint.templateId,
						templateVersion: blueprint.templateVersion,
					},
				})),
				createdAt: Date.now(),
				dealId: fixture.dealId,
				lastError: undefined,
				mortgageId: fixture.mortgageId,
				readyAt: undefined,
				retryCount: 0,
				status: "pending",
				updatedAt: Date.now(),
			});

			const staticBlueprint = frozenBlueprints.find(
				(blueprint) => blueprint.class === "private_static"
			);
			if (!staticBlueprint?.assetId) {
				throw new Error("Expected a frozen private static blueprint");
			}

			await ctx.db.insert("dealDocumentInstances", {
				archivedAt: undefined,
				assetId: staticBlueprint.assetId,
				createdAt: Date.now(),
				dealId: fixture.dealId,
				generatedDocumentId: undefined,
				kind: "static_reference",
				lastError: undefined,
				mortgageId: fixture.mortgageId,
				packageId,
				sourceBlueprintId: staticBlueprint._id,
				sourceBlueprintSnapshot: {
					category: staticBlueprint.category,
					class: staticBlueprint.class,
					description: staticBlueprint.description,
					displayName: staticBlueprint.displayName,
					displayOrder: staticBlueprint.displayOrder,
					packageKey: staticBlueprint.packageKey,
					packageLabel: staticBlueprint.packageLabel,
					templateId: staticBlueprint.templateId,
					templateVersion: staticBlueprint.templateVersion,
				},
				status: "available",
				updatedAt: Date.now(),
			});

			await ctx.db.insert("mortgageDocumentBlueprints", {
				archivedAt: undefined,
				archivedByUserId: undefined,
				assetId: staticBlueprint.assetId,
				category: "private",
				class: "private_static",
				createdAt: Date.now(),
				createdByUserId: frozenBlueprints[0]!.createdByUserId,
				description: "Late-added blueprint should not join the frozen package",
				displayName: "Late addendum",
				displayOrder: 99,
				mortgageId: fixture.mortgageId,
				packageKey: "closing",
				packageLabel: "Closing package",
				sourceDraftId: undefined,
				sourceKind: "asset",
				status: "active",
				templateId: undefined,
				templateSnapshotMeta: undefined,
				templateVersion: undefined,
			});
		});

		const result = await t.action(
			internal.documents.dealPackages.runCreateDocumentPackageInternal,
			{
				dealId: fixture.dealId,
				retry: false,
			}
		);
		const packageSurface = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);

		expect(result.status).toBe("ready");
		expect(packageSurface.package).toMatchObject({
			retryCount: 1,
			status: "ready",
		});
		expect(
			packageSurface.instances.map((instance) => instance.displayName)
		).toEqual([
			"Private static memo",
			"Counsel memo",
			"Borrower signature packet",
		]);
		expect(
			packageSurface.instances.some(
				(instance) => instance.displayName === "Late addendum"
			)
		).toBe(false);
	});

	it("keeps signable documents pending when recipient resolution is incomplete", async () => {
		installMockDocumensoFetch();
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedDealPackageFixture(t, {
			includeListing: true,
			signablePlatformRole: "lawyer_primary",
			templatedVariableKey: "borrower_primary_full_name",
		});

		const result = await t.action(
			internal.documents.dealPackages.runCreateDocumentPackageInternal,
			{
				dealId: fixture.dealId,
				retry: false,
			}
		);
		const packageSurface = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);
		const signatureEnvelopes = await t.run((ctx) =>
			ctx.db.query("signatureEnvelopes").collect()
		);

		expect(result.status).toBe("partial_failure");
		expect(packageSurface.instances).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					displayName: "Borrower signature packet",
					lastError: expect.stringContaining("lawyer_primary"),
					status: "signature_pending_recipient_resolution",
				}),
			])
		);
		expect(signatureEnvelopes).toHaveLength(0);
	});

	it("records provider failures when Documenso envelope creation fails", async () => {
		installMockDocumensoFetch({ failCreate: true });
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedDealPackageFixture(t, {
			includeListing: true,
			templatedVariableKey: "borrower_primary_full_name",
		});

		const result = await t.action(
			internal.documents.dealPackages.runCreateDocumentPackageInternal,
			{
				dealId: fixture.dealId,
				retry: false,
			}
		);
		const packageSurface = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);
		const signableInstance = packageSurface.instances.find(
			(instance) => instance.class === "private_templated_signable"
		);
		const generatedDocuments = await t.run((ctx) =>
			ctx.db.query("generatedDocuments").collect()
		);
		const signatureEnvelopes = await t.run((ctx) =>
			ctx.db.query("signatureEnvelopes").collect()
		);

		expect(result.status).toBe("partial_failure");
		expect(signableInstance).toMatchObject({
			lastError: expect.stringContaining("/envelope/create"),
			status: "generation_failed",
		});
		expect(generatedDocuments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					signingStatus: "provider_error",
				}),
			])
		);
		expect(signatureEnvelopes).toHaveLength(0);
	});

	it("accepts DOCUMENSO_API_KEY as a fallback credential name", async () => {
		const { fetchMock } = installMockDocumensoFetch();
		delete process.env.DOCUMENSO_API_TOKEN;
		process.env.DOCUMENSO_API_KEY = "documenso_test_key";

		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedDealPackageFixture(t, {
			includeListing: true,
			templatedVariableKey: "borrower_primary_full_name",
		});

		const result = await t.action(
			internal.documents.dealPackages.runCreateDocumentPackageInternal,
			{
				dealId: fixture.dealId,
				retry: false,
			}
		);
		const signatureEnvelopes = await t.run((ctx) =>
			ctx.db.query("signatureEnvelopes").collect()
		);

		expect(result.status).toBe("ready");
		expect(signatureEnvelopes).toHaveLength(1);
		expect(fetchMock).toHaveBeenCalled();
	});

	it("issues embedded signing sessions only to canonical recipients and syncs envelope completion", async () => {
		installMockDocumensoFetch({
			recipientEmail: "lender.phase7@test.fairlend.ca",
			recipientName: "Lena Lender",
		});
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedDealPackageFixture(t, {
			includeListing: true,
			signablePlatformRole: "lender_primary",
			templatedVariableKey: "borrower_primary_full_name",
		});

		await t.action(internal.documents.dealPackages.runCreateDocumentPackageInternal, {
			dealId: fixture.dealId,
			retry: false,
		});
		const packageSurface = await t.withIdentity(fixture.lenderIdentity).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);
		const signableInstance = packageSurface.instances.find(
			(instance) => instance.class === "private_templated_signable"
		);
		if (!signableInstance) {
			throw new Error("Expected a signable package instance");
		}

		const session = await t.withIdentity(fixture.lenderIdentity).action(
			api.documents.signature.sessions.createEmbeddedSigningSession,
			{
				dealId: fixture.dealId,
				instanceId: signableInstance.instanceId,
			}
		);

		expect(session).toMatchObject({
			expiresAt: expect.any(Number),
			url: "https://documenso.test/sign/session_1",
		});
		await expect(
			t.withIdentity(FAIRLEND_ADMIN).action(
				api.documents.signature.sessions.createEmbeddedSigningSession,
				{
					dealId: fixture.dealId,
					instanceId: signableInstance.instanceId,
				}
			)
		).rejects.toThrow(/no embedded signing recipient/i);

		installMockDocumensoFetch({
			envelopeStatus: "COMPLETED",
			recipientEmail: "lender.phase7@test.fairlend.ca",
			recipientName: "Lena Lender",
			recipientSigningStatus: "SIGNED",
		});
		await t.withIdentity(fixture.lenderIdentity).action(
			api.documents.signature.webhooks.syncSignableDocumentEnvelope,
			{
				dealId: fixture.dealId,
				instanceId: signableInstance.instanceId,
			}
		);

		const refreshedSurface = await t.withIdentity(fixture.lenderIdentity).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);
		const refreshedSignable = refreshedSurface.instances.find(
			(instance) => instance.instanceId === signableInstance.instanceId
		);
		const generatedDocuments = await t.run((ctx) =>
			ctx.db.query("generatedDocuments").collect()
		);

		expect(refreshedSignable).toMatchObject({
			status: "signed",
			signing: expect.objectContaining({
				generatedDocumentSigningStatus: "completed",
				status: "completed",
			}),
		});
		expect(generatedDocuments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					signingStatus: "completed",
				}),
			])
		);
	});

	it("archives completed signable artifacts into platform storage and stays idempotent on rerun", async () => {
		installMockDocumensoFetch({
			recipientEmail: "lender.phase7@test.fairlend.ca",
			recipientName: "Lena Lender",
		});
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedDealPackageFixture(t, {
			includeListing: true,
			signablePlatformRole: "lender_primary",
			templatedVariableKey: "borrower_primary_full_name",
		});

		await t.action(internal.documents.dealPackages.runCreateDocumentPackageInternal, {
			dealId: fixture.dealId,
			retry: false,
		});
		const initialSurface = await t.withIdentity(fixture.lenderIdentity).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);
		const signableInstance = initialSurface.instances.find(
			(instance) => instance.class === "private_templated_signable"
		);
		if (!signableInstance?.generatedDocumentId) {
			throw new Error("Expected a signable package instance");
		}

		const completedDocumenso = installMockDocumensoFetch({
			envelopeStatus: "COMPLETED",
			includeCompletionCertificate: true,
			recipientEmail: "lender.phase7@test.fairlend.ca",
			recipientName: "Lena Lender",
			recipientSigningStatus: "SIGNED",
		});
		await t.withIdentity(fixture.lenderIdentity).action(
			api.documents.signature.webhooks.syncSignableDocumentEnvelope,
			{
				dealId: fixture.dealId,
				instanceId: signableInstance.instanceId,
			}
		);

		await t.action(
			internal.engine.effects.dealClosingEffects.archiveSignedDocuments,
			buildArchiveEffectArgs(fixture.dealId)
		);

		const afterFirstArchive = await t
			.withIdentity(fixture.lenderIdentity)
			.query(api.documents.dealPackages.getPortalDocumentPackage, {
				dealId: fixture.dealId,
			});
		const portalDealDetail = await t
			.withIdentity(fixture.lenderIdentity)
			.query(api.deals.queries.getPortalDealDetail, {
				dealId: fixture.dealId,
			});
		const adminDealDetail = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.crm.detailContextQueries.getDealDetailContext, {
				dealId: fixture.dealId,
			});
		const archivedSignable = afterFirstArchive.instances.find(
			(instance) => instance.instanceId === signableInstance.instanceId
		);
		const portalDealSignable = portalDealDetail.documentInstances.find(
			(instance) => instance.instanceId === signableInstance.instanceId
		);
		const adminDealSignable = adminDealDetail.documentInstances.find(
			(instance) => instance.instanceId === signableInstance.instanceId
		);
		const firstDocumentState = await t.run(async (ctx) => {
			const generatedDocument = await ctx.db.get(signableInstance.generatedDocumentId);
			if (!generatedDocument?.finalPdfStorageId) {
				throw new Error("Expected archived final PDF storage");
			}

			const finalPdf = await ctx.storage.get(generatedDocument.finalPdfStorageId);
			const certificate = generatedDocument.completionCertificateStorageId
				? await ctx.storage.get(generatedDocument.completionCertificateStorageId)
				: null;

			return {
				completionCertificateStorageId:
					generatedDocument.completionCertificateStorageId ?? null,
				finalPdfByteLength: finalPdf
					? (await finalPdf.arrayBuffer()).byteLength
					: 0,
				finalPdfStorageId: generatedDocument.finalPdfStorageId,
				signingStatus: generatedDocument.signingStatus,
				storedCertificateByteLength: certificate
					? (await certificate.arrayBuffer()).byteLength
					: 0,
			};
		});

		await t.action(
			internal.engine.effects.dealClosingEffects.archiveSignedDocuments,
			buildArchiveEffectArgs(fixture.dealId)
		);

		const secondDocumentState = await t.run(async (ctx) => {
			const generatedDocument = await ctx.db.get(signableInstance.generatedDocumentId);
			if (!generatedDocument) {
				throw new Error("Expected generated document after archive rerun");
			}

			return {
				completionCertificateStorageId:
					generatedDocument.completionCertificateStorageId ?? null,
				finalPdfStorageId: generatedDocument.finalPdfStorageId ?? null,
				signingStatus: generatedDocument.signingStatus,
			};
		});

		const signedDownloadCalls = completedDocumenso.fetchMock.mock.calls.filter(
			([input]) =>
				String(input).includes(
					`/envelope/item/${completedDocumenso.envelopeItemId}/download?version=signed`
				)
		);
		const certificateDownloadCalls =
			completedDocumenso.fetchMock.mock.calls.filter(([input]) =>
				String(input).includes(
					`/envelope/item/${completedDocumenso.completionCertificateItemId}/download`
				)
			);

		expect(archivedSignable).toMatchObject({
			archivedSigning: {
				completionCertificateUrl: expect.any(String),
				finalPdfUrl: expect.any(String),
				signingCompletedAt: expect.any(Number),
			},
			archivedAt: expect.any(Number),
			status: "archived",
			url: expect.any(String),
		});
		expect(portalDealSignable).toMatchObject({
			archivedSigning: {
				completionCertificateUrl: expect.any(String),
				finalPdfUrl: expect.any(String),
				signingCompletedAt: expect.any(Number),
			},
			archivedAt: expect.any(Number),
			status: "archived",
			url: expect.any(String),
		});
		expect(adminDealSignable).toMatchObject({
			archivedSigning: {
				completionCertificateUrl: expect.any(String),
				finalPdfUrl: expect.any(String),
				signingCompletedAt: expect.any(Number),
			},
			archivedAt: expect.any(Number),
			status: "archived",
			url: expect.any(String),
		});
		expect(archivedSignable?.url).toBe(archivedSignable?.archivedSigning?.finalPdfUrl);
		expect(portalDealSignable?.url).toBe(
			portalDealSignable?.archivedSigning?.finalPdfUrl
		);
		expect(adminDealSignable?.url).toBe(
			adminDealSignable?.archivedSigning?.finalPdfUrl
		);
		expect(afterFirstArchive.package).toMatchObject({
			archivedAt: expect.any(Number),
			status: "archived",
		});
		expect(firstDocumentState).toMatchObject({
			completionCertificateStorageId: expect.any(String),
			finalPdfByteLength: expect.any(Number),
			finalPdfStorageId: expect.any(String),
			signingStatus: "completed",
			storedCertificateByteLength: expect.any(Number),
		});
		expect(firstDocumentState.finalPdfByteLength).toBeGreaterThan(0);
		expect(firstDocumentState.storedCertificateByteLength).toBeGreaterThan(0);
		expect(secondDocumentState).toEqual({
			completionCertificateStorageId:
				firstDocumentState.completionCertificateStorageId,
			finalPdfStorageId: firstDocumentState.finalPdfStorageId,
			signingStatus: "completed",
		});
		expect(signedDownloadCalls).toHaveLength(1);
		expect(certificateDownloadCalls).toHaveLength(1);
	});

	it("records archive failures without corrupting signed state and can recover on retry", async () => {
		installMockDocumensoFetch({
			recipientEmail: "lender.phase7@test.fairlend.ca",
			recipientName: "Lena Lender",
		});
		const t = createTestConvex({ includeWorkflowComponents: false });
		const fixture = await seedDealPackageFixture(t, {
			includeListing: true,
			signablePlatformRole: "lender_primary",
			templatedVariableKey: "borrower_primary_full_name",
		});

		await t.action(internal.documents.dealPackages.runCreateDocumentPackageInternal, {
			dealId: fixture.dealId,
			retry: false,
		});
		const initialSurface = await t.withIdentity(fixture.lenderIdentity).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);
		const signableInstance = initialSurface.instances.find(
			(instance) => instance.class === "private_templated_signable"
		);
		if (!signableInstance) {
			throw new Error("Expected a signable package instance");
		}

		installMockDocumensoFetch({
			envelopeStatus: "COMPLETED",
			failSignedDownload: true,
			recipientEmail: "lender.phase7@test.fairlend.ca",
			recipientName: "Lena Lender",
			recipientSigningStatus: "SIGNED",
		});
		await t.withIdentity(fixture.lenderIdentity).action(
			api.documents.signature.webhooks.syncSignableDocumentEnvelope,
			{
				dealId: fixture.dealId,
				instanceId: signableInstance.instanceId,
			}
		);

		await expect(
			t.action(
				internal.engine.effects.dealClosingEffects.archiveSignedDocuments,
				buildArchiveEffectArgs(fixture.dealId)
			)
		).rejects.toThrow(/failed with status 500/i);

		const afterFailure = await t.withIdentity(fixture.lenderIdentity).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);
		const signableAfterFailure = afterFailure.instances.find(
			(instance) => instance.instanceId === signableInstance.instanceId
		);

		expect(afterFailure.package).toMatchObject({
			lastError: expect.stringContaining("failed with status 500"),
			status: "ready",
		});
		expect(signableAfterFailure).toMatchObject({
			archivedAt: null,
			status: "signed",
		});

		installMockDocumensoFetch({
			envelopeStatus: "COMPLETED",
			recipientEmail: "lender.phase7@test.fairlend.ca",
			recipientName: "Lena Lender",
			recipientSigningStatus: "SIGNED",
		});
		await t.action(
			internal.engine.effects.dealClosingEffects.archiveSignedDocuments,
			buildArchiveEffectArgs(fixture.dealId)
		);

		const afterRetry = await t.withIdentity(fixture.lenderIdentity).query(
			api.documents.dealPackages.getPortalDocumentPackage,
			{
				dealId: fixture.dealId,
			}
		);
		const signableAfterRetry = afterRetry.instances.find(
			(instance) => instance.instanceId === signableInstance.instanceId
		);

		expect(afterRetry.package).toMatchObject({
			archivedAt: expect.any(Number),
			lastError: null,
			status: "archived",
		});
		expect(signableAfterRetry).toMatchObject({
			archivedAt: expect.any(Number),
			status: "archived",
		});
	});
});
