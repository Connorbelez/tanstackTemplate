import { describe, expect, it } from "vitest";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { createTestConvex, ensureSeededIdentity } from "../../../auth/helpers";
import { FAIRLEND_ADMIN } from "../../../auth/identities";

async function seedDocumentAsset(
	t: ReturnType<typeof createTestConvex>,
	args?: {
		fileHash?: string;
		name?: string;
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
			ctx.storage as unknown as { store: (blob: Blob) => Promise<Id<"_storage">> }
		).store(new Blob([args?.name ?? "test asset"]));
		return ctx.db.insert("documentAssets", {
			description: "Draft upload",
			fileHash: args?.fileHash ?? `hash-${Date.now()}`,
			fileRef,
			fileSize: 128,
			mimeType: "application/pdf",
			name: args?.name ?? "Commit checklist",
			originalFilename: "checklist.pdf",
			pageCount: 1,
			source: "admin_upload",
			uploadedAt: Date.now(),
			uploadedByUserId: adminUser._id,
		});
	});
}

async function seedPublishedTemplate(
	t: ReturnType<typeof createTestConvex>,
	args: {
		fields: Array<{
			id: string;
			position: { height: number; page: number; width: number; x: number; y: number };
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
	return t.run(async (ctx) => {
		const basePdfId = await ctx.db.insert("documentBasePdfs", {
			fileHash: `base-hash-${args.name}`,
			fileRef: await (
				ctx.storage as unknown as {
					store: (blob: Blob) => Promise<Id<"_storage">>;
				}
			).store(new Blob([args.name])),
			fileSize: 64,
			name: `${args.name} base`,
			pageCount: 1,
			pageDimensions: [{ height: 792, page: 0, width: 612 }],
			uploadedAt: Date.now(),
			uploadedBy: "test_admin",
		});
		const templateId = await ctx.db.insert("documentTemplates", {
			basePdfHash: `base-hash-${args.name}`,
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
			basePdfHash: `base-hash-${args.name}`,
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

describe("admin origination case documents", () => {
	it("creates and lists a static draft backed by a document asset", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);
		const assetId = await seedDocumentAsset(t, { name: "Public FAQ" });

		const created = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.caseDocuments.createStaticDraft,
			{
				assetId,
				caseId,
				documentClass: "public_static",
				displayName: "Investor FAQ",
				packageLabel: "Public docs",
			}
		);
		const listed = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.admin.origination.caseDocuments.listCaseDocumentDrafts,
			{ caseId }
		);

		expect(created.class).toBe("public_static");
		expect(created.asset?.name).toBe("Public FAQ");
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			class: "public_static",
			displayName: "Investor FAQ",
			packageLabel: "Public docs",
			sourceKind: "asset",
			status: "active",
		});
	});

	it("reuses the same active static draft instead of duplicating it", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);
		const assetId = await seedDocumentAsset(t, { name: "Reused public FAQ" });

		const first = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.caseDocuments.createStaticDraft,
			{
				assetId,
				caseId,
				documentClass: "public_static",
				displayName: "Initial FAQ",
			}
		);
		const second = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.caseDocuments.createStaticDraft,
			{
				assetId,
				caseId,
				documentClass: "public_static",
				displayName: "Updated FAQ",
			}
		);
		const listed = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.admin.origination.caseDocuments.listCaseDocumentDrafts,
			{ caseId }
		);

		expect(second._id).toBe(first._id);
		expect(listed).toHaveLength(1);
		expect(listed[0].displayName).toBe("Updated FAQ");
	});

	it("expands a template group into pinned draft rows", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);

		await t.run(async (ctx) => {
			await ctx.db.insert("systemVariables", {
				createdAt: Date.now(),
				key: "mortgage_amount",
				label: "Mortgage amount",
				type: "currency",
			});
		});
		const firstTemplateId = await seedPublishedTemplate(t, {
			fields: [
				{
					id: "field_1",
					position: { height: 24, page: 0, width: 120, x: 12, y: 18 },
					type: "interpolable",
					variableKey: "mortgage_amount",
				},
			],
			name: "Commit Checklist",
		});
		const secondTemplateId = await seedPublishedTemplate(t, {
			fields: [
				{
					id: "field_2",
					position: { height: 24, page: 0, width: 120, x: 12, y: 42 },
					type: "interpolable",
					variableKey: "mortgage_amount",
				},
			],
			name: "Disclosure Package",
		});
		const groupId = await t.run(async (ctx) =>
			ctx.db.insert("documentTemplateGroups", {
				createdAt: Date.now(),
				description: "Grouped package",
				name: "Closing docs",
				signatories: [],
				templateRefs: [
					{ order: 0, pinnedVersion: 1, templateId: firstTemplateId },
					{ order: 1, pinnedVersion: undefined, templateId: secondTemplateId },
				],
				updatedAt: Date.now(),
			})
		);

		const created = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.caseDocuments.attachTemplateGroup,
			{
				caseId,
				documentClass: "private_templated_non_signable",
				groupId,
			}
		);

		expect(created).toHaveLength(2);
		expect(created[0]).toMatchObject({
			class: "private_templated_non_signable",
			displayName: "Commit Checklist",
			packageLabel: "Closing docs",
			templateVersion: 1,
		});
		expect(created[1]).toMatchObject({
			displayName: "Disclosure Package",
			packageLabel: "Closing docs",
			templateVersion: 1,
		});

		const repeated = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.caseDocuments.attachTemplateGroup,
			{
				caseId,
				documentClass: "private_templated_non_signable",
				groupId,
			}
		);
		const listed = await t.withIdentity(FAIRLEND_ADMIN).query(
			api.admin.origination.caseDocuments.listCaseDocumentDrafts,
			{ caseId }
		);

		expect(repeated.map((draft) => String(draft._id))).toEqual(
			created.map((draft) => String(draft._id))
		);
		expect(listed).toHaveLength(2);
	});

	it("rejects attaching a signable template as non-signable", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);
		const signableTemplateId = await seedPublishedTemplate(t, {
			fields: [
				{
					id: "field_signature",
					position: { height: 24, page: 0, width: 120, x: 12, y: 18 },
					signableType: "SIGNATURE",
					signatoryPlatformRole: "primary_borrower",
					type: "signable",
				},
			],
			name: "Mortgage Charge",
			signatories: [
				{
					order: 0,
					platformRole: "primary_borrower",
					role: "signatory",
				},
			],
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(
				api.admin.origination.caseDocuments.attachTemplateVersion,
				{
					caseId,
					documentClass: "private_templated_non_signable",
					templateId: signableTemplateId,
				}
			)
		).rejects.toThrow(/cannot contain signable fields/i);
	});

	it("rejects signable templates that use unsupported production signatory roles", async () => {
		const t = createTestConvex({ includeWorkflowComponents: false });
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
			api.admin.origination.cases.createCase,
			{}
		);
		const signableTemplateId = await seedPublishedTemplate(t, {
			fields: [
				{
					id: "field_signature",
					position: { height: 24, page: 0, width: 120, x: 12, y: 18 },
					signableType: "SIGNATURE",
					signatoryPlatformRole: "primary_borrower",
					type: "signable",
				},
			],
			name: "Borrower Signature Package",
			signatories: [
				{
					order: 0,
					platformRole: "primary_borrower",
					role: "signatory",
				},
			],
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).mutation(
				api.admin.origination.caseDocuments.attachTemplateVersion,
				{
					caseId,
					documentClass: "private_templated_signable",
					templateId: signableTemplateId,
				}
			)
		).rejects.toThrow(/unsupported signatory roles/i);
	});
});
