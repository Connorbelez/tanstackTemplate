import { expect, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

export async function readE2eAccessToken(page: Page) {
	await page.goto("/e2e/session");
	await expect(page.locator('[data-testid="session-json"]')).toBeVisible({
		timeout: 15_000,
	});

	const sessionJson = await page
		.locator('[data-testid="session-json"]')
		.textContent();
	if (!sessionJson) {
		throw new Error("E2E session route did not render session JSON");
	}

	const session = JSON.parse(sessionJson) as {
		accessToken?: string | null;
		error?: string;
	};
	if (session.error) {
		throw new Error(`E2E session bootstrap failed: ${session.error}`);
	}
	if (!session.accessToken) {
		throw new Error("E2E session route did not expose an access token");
	}

	return session.accessToken;
}

export function createOriginationE2eClient(accessToken: string) {
	const convex = new ConvexHttpClient(requireEnv("VITE_CONVEX_URL"));
	convex.setAuth(accessToken);

	const getSystemVariableByKey = (key: string) =>
		convex.query(api.documentEngine.systemVariables.getByKey, { key });

	const ensureSystemVariable = async (args: {
		key: string;
		label: string;
		type?: "string";
	}) => {
		const existing = await getSystemVariableByKey(args.key);
		if (existing) {
			return existing._id;
		}

		return convex.mutation(api.documentEngine.systemVariables.create, {
			createdBy: "e2e",
			formatOptions: {},
			key: args.key,
			label: args.label,
			type: args.type ?? "string",
		});
	};

	const uploadBasePdf = async (args: { contents: Uint8Array; name: string }) => {
		const upload = await uploadPdfToStorage(convex, {
			contents: args.contents,
			metadataApi: {
				extract: api.documentEngine.basePdfs.extractPdfMetadata,
				uploadUrl: api.documentEngine.basePdfs.generateUploadUrl,
			},
		});
		if (!upload.pageDimensions) {
			throw new Error("Base PDF metadata did not include page dimensions");
		}

		const result = await convex.mutation(api.documentEngine.basePdfs.create, {
			description: `${args.name} description`,
			fileHash: upload.fileHash,
			fileRef: upload.fileRef,
			fileSize: upload.fileSize,
			name: args.name,
			pageCount: upload.pageCount,
			pageDimensions: upload.pageDimensions,
			uploadedBy: "e2e",
		});

		return result.id;
	};

	const uploadDocumentAsset = async (args: {
		contents: Uint8Array;
		description?: string;
		name: string;
	}) => {
		const upload = await uploadPdfToStorage(convex, {
			contents: args.contents,
			metadataApi: {
				extract: api.documents.assets.extractPdfMetadata,
				uploadUrl: api.documents.assets.generateUploadUrl,
			},
		});

		const result = await convex.mutation(api.documents.assets.create, {
			description: args.description,
			fileHash: upload.fileHash,
			fileRef: upload.fileRef,
			fileSize: upload.fileSize,
			name: args.name,
			originalFilename: `${args.name.toLowerCase().replace(/\s+/g, "-")}.pdf`,
			pageCount: upload.pageCount,
		});

		return result.assetId;
	};

	const publishNonSignableTemplate = async (args: {
		name: string;
		variableKey: string;
	}) => {
		await ensureSystemVariable({
			key: args.variableKey,
			label: args.variableKey,
		});

		const basePdfId = await uploadBasePdf({
			contents: await createPdfBytes(args.name),
			name: `${args.name} Base`,
		});
		const templateId = await convex.mutation(api.documentEngine.templates.create, {
			basePdfId,
			description: `${args.name} description`,
			name: args.name,
		});
		await convex.mutation(api.documentEngine.templates.saveDraft, {
			draft: {
				fields: [
					{
						id: `${args.name}-field`,
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
			id: templateId,
		});
		await convex.mutation(api.documentEngine.templates.publish, {
			id: templateId,
			publishedBy: "e2e",
		});

		return { basePdfId, templateId };
	};

	return {
		async attachPrivateStaticBlueprint(args: {
			contents?: Uint8Array;
			description?: string;
			displayName: string;
			mortgageId: string;
			name: string;
			packageKey?: string;
			packageLabel?: string;
		}) {
			const assetId = await uploadDocumentAsset({
				contents: args.contents ?? (await createPdfBytes(args.displayName)),
				description: args.description,
				name: args.name,
			});

			return convex.mutation(api.documents.mortgageBlueprints.createStaticBlueprint, {
				assetId,
				class: "private_static",
				description: args.description,
				displayName: args.displayName,
				mortgageId: args.mortgageId as Id<"mortgages">,
				packageKey: args.packageKey,
				packageLabel: args.packageLabel,
			});
		},
		attachPrivateTemplatedBlueprint(args: {
			description?: string;
			displayName: string;
			mortgageId: string;
			packageKey?: string;
			packageLabel?: string;
			templateId: Id<"documentTemplates">;
		}) {
			return convex.mutation(
				api.documents.mortgageBlueprints.attachTemplateVersion,
				{
					class: "private_templated_non_signable",
					description: args.description,
					displayName: args.displayName,
					mortgageId: args.mortgageId as Id<"mortgages">,
					packageKey: args.packageKey,
					packageLabel: args.packageLabel,
					templateId: args.templateId,
				}
			);
		},
		cleanupCommittedOrigination(caseId: string) {
			return convex.mutation(
				api.test.originationE2e.cleanupCommittedOrigination,
				{
					caseId: caseId as Id<"adminOriginationCases">,
				}
			);
		},
		cleanupDealPackageScenario(args: {
			assetIds: Id<"documentAssets">[];
			basePdfIds: Id<"documentBasePdfs">[];
			dealId: string;
			mortgageId: string;
			templateIds: Id<"documentTemplates">[];
		}) {
			return convex.mutation(api.test.dealPackageE2e.cleanupDealPackageScenario, {
				assetIds: args.assetIds,
				basePdfIds: args.basePdfIds,
				dealId: args.dealId as Id<"deals">,
				mortgageId: args.mortgageId as Id<"mortgages">,
				templateIds: args.templateIds,
			});
		},
		createDealForMortgage(mortgageId: string) {
			return convex.mutation(api.test.dealPackageE2e.createDealForMortgage, {
				mortgageId: mortgageId as Id<"mortgages">,
			});
		},
		seedLateStaticBlueprint(args: {
			displayName: string;
			mortgageId: string;
			packageKey: string;
			packageLabel: string;
		}) {
			return convex.action(api.test.dealPackageE2e.seedLateStaticBlueprint, {
				displayName: args.displayName,
				mortgageId: args.mortgageId as Id<"mortgages">,
				packageKey: args.packageKey,
				packageLabel: args.packageLabel,
			});
		},
		seedPrivatePackageBlueprints(args: {
			mortgageId: string;
			packageKey: string;
			packageLabel: string;
			variableKey: string;
		}) {
			return convex.action(
				api.test.dealPackageE2e.seedPrivatePackageBlueprints,
				{
					mortgageId: args.mortgageId as Id<"mortgages">,
					packageKey: args.packageKey,
					packageLabel: args.packageLabel,
					variableKey: args.variableKey,
				}
			);
		},
		ensureOriginationE2eContext() {
			return convex.mutation(api.test.originationE2e.ensureOriginationE2eContext, {});
		},
		ensureSystemVariable,
		getDealPackageSurface(dealId: string) {
			return convex.query(api.documents.dealPackages.getPortalDocumentPackage, {
				dealId: dealId as Id<"deals">,
			});
		},
		getListingByMortgage(mortgageId: string) {
			return convex.query(api.listings.queries.getListingByMortgage, {
				mortgageId: mortgageId as Id<"mortgages">,
			});
		},
		getPublicListingDocuments(listingId: string) {
			return convex.query(api.listings.publicDocuments.listForListing, {
				listingId: listingId as Id<"listings">,
			});
		},
		getMortgageDetailContext(mortgageId: string) {
			return convex.query(api.crm.detailContextQueries.getMortgageDetailContext, {
				mortgageId: mortgageId as Id<"mortgages">,
			});
		},
		getSystemVariableByKey,
		publishNonSignableTemplate,
		rerunDealPackage(dealId: string, retry = false) {
			return convex.action(api.test.dealPackageE2e.runDealPackageForE2e, {
				dealId: dealId as Id<"deals">,
				retry,
			});
		},
		transitionDealLocked(dealId: string, closingDate: number) {
			return convex.mutation(api.deals.mutations.transitionDeal, {
				entityId: dealId as Id<"deals">,
				eventType: "DEAL_LOCKED",
				payload: { closingDate },
			});
		},
		uploadBasePdf,
		uploadDocumentAsset,
	};
}

export function uniqueOriginationValue(prefix: string) {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

async function uploadPdfToStorage(
	convex: ConvexHttpClient,
	args: {
		contents: Uint8Array;
		metadataApi: {
			extract:
				| typeof api.documents.assets.extractPdfMetadata
				| typeof api.documentEngine.basePdfs.extractPdfMetadata;
			uploadUrl:
				| typeof api.documents.assets.generateUploadUrl
				| typeof api.documentEngine.basePdfs.generateUploadUrl;
		};
	}
) {
	const { uploadUrl } = await convex.mutation(args.metadataApi.uploadUrl, {});
	const uploadResponse = await fetch(uploadUrl, {
		body: new Blob([new Uint8Array(args.contents)], {
			type: "application/pdf",
		}),
		headers: { "Content-Type": "application/pdf" },
		method: "POST",
	});
	if (!uploadResponse.ok) {
		throw new Error(`Storage upload failed with status ${uploadResponse.status}`);
	}

	const { storageId } = (await uploadResponse.json()) as {
		storageId: Id<"_storage">;
	};
	const metadata = await convex.action(args.metadataApi.extract, {
		fileRef: storageId,
	});

	return {
		fileHash: metadata.fileHash,
		fileRef: storageId,
		fileSize: metadata.fileSize,
		pageCount: metadata.pageCount,
		pageDimensions:
			"pageDimensions" in metadata ? metadata.pageDimensions : undefined,
	};
}
