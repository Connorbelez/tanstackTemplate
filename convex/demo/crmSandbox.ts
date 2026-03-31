import { ConvexError, v } from "convex/values";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { fieldTypeValidator, selectOptionValidator } from "../crm/validators";
import type { ValueTableName } from "../crm/valueRouter";
import { authedAction, authedMutation, authedQuery } from "../fluent";

const DEMO_OBJECT_NAME = "demo_lead";
const DEMO_ICON = "database-zap";
const DEMO_DESCRIPTION =
	"Seeded lead pipeline used by the CRM integration sandbox.";

interface SeedField {
	defaultValue?: string;
	fieldType: Doc<"fieldDefs">["fieldType"];
	isRequired?: boolean;
	label: string;
	name: string;
	options?: Array<{ color: string; label: string; value: string }>;
}

interface DemoSeedResult {
	customObjectCount: number;
	demoObjectId?: Id<"objectDefs">;
	demoViewId?: Id<"viewDefs">;
	recordCount: number;
	seeded: boolean;
}

interface SandboxObjectResult {
	demoViewId?: Id<"viewDefs">;
	objectDefId: Id<"objectDefs">;
}

interface QueryRecordPageSummary {
	records: unknown[];
}

const DEMO_FIELDS: SeedField[] = [
	{
		fieldType: "text",
		isRequired: true,
		label: "Company Name",
		name: "company_name",
	},
	{
		fieldType: "select",
		isRequired: true,
		label: "Status",
		name: "status",
		options: [
			{ color: "sky", label: "New", value: "new" },
			{ color: "amber", label: "Contacted", value: "contacted" },
			{ color: "emerald", label: "Qualified", value: "qualified" },
			{ color: "rose", label: "Lost", value: "lost" },
		],
	},
	{
		fieldType: "currency",
		label: "Deal Value",
		name: "deal_value",
	},
	{
		fieldType: "date",
		label: "Next Follow-up",
		name: "next_followup",
	},
	{
		fieldType: "boolean",
		label: "Qualified",
		name: "is_qualified",
	},
	{
		fieldType: "email",
		label: "Contact Email",
		name: "contact_email",
	},
];

const DEMO_RECORDS: Record<string, boolean | number | string>[] = [
	{
		company_name: "Northwind Capital",
		contact_email: "ops@northwind.example",
		deal_value: 325_000,
		is_qualified: true,
		next_followup: "2026-04-03",
		status: "new",
	},
	{
		company_name: "River Birch Advisory",
		contact_email: "intro@riverbirch.example",
		deal_value: 575_000,
		is_qualified: true,
		next_followup: "2026-04-08",
		status: "contacted",
	},
	{
		company_name: "Signal Peak Lending",
		contact_email: "team@signalpeak.example",
		deal_value: 910_000,
		is_qualified: true,
		next_followup: "2026-04-11",
		status: "qualified",
	},
	{
		company_name: "Canvas Street Brokers",
		contact_email: "pipeline@canvasstreet.example",
		deal_value: 240_000,
		is_qualified: false,
		next_followup: "2026-04-02",
		status: "lost",
	},
	{
		company_name: "Hinterland Referrals",
		contact_email: "crm@hinterland.example",
		deal_value: 460_000,
		is_qualified: false,
		next_followup: "2026-04-15",
		status: "new",
	},
];

const VALUE_TABLES: ValueTableName[] = [
	"recordValuesText",
	"recordValuesNumber",
	"recordValuesBoolean",
	"recordValuesDate",
	"recordValuesSelect",
	"recordValuesMultiSelect",
	"recordValuesRichText",
	"recordValuesUserRef",
];

async function deleteValueRowsForRecord(
	ctx: MutationCtx,
	recordId: Id<"records">
) {
	for (const table of VALUE_TABLES) {
		switch (table) {
			case "recordValuesText":
			case "recordValuesNumber":
			case "recordValuesBoolean":
			case "recordValuesDate":
			case "recordValuesSelect":
			case "recordValuesMultiSelect":
			case "recordValuesRichText":
			case "recordValuesUserRef": {
				const rows = await ctx.db
					.query(table)
					.withIndex("by_record", (q) => q.eq("recordId", recordId))
					.collect();
				for (const row of rows) {
					await ctx.db.delete(row._id);
				}
				break;
			}
			default: {
				throw new ConvexError(`Unsupported value table: ${String(table)}`);
			}
		}
	}
}

async function deleteRecordGraph(
	ctx: MutationCtx,
	objectDefId: Id<"objectDefs">
): Promise<number> {
	const records = await ctx.db
		.query("records")
		.withIndex("by_object", (q) => q.eq("objectDefId", objectDefId))
		.collect();

	for (const record of records) {
		await deleteValueRowsForRecord(ctx, record._id);
		await ctx.db.delete(record._id);
	}

	return records.length;
}

async function deleteLinkGraph(
	ctx: MutationCtx,
	orgId: string,
	objectDefId: Id<"objectDefs">
): Promise<void> {
	const [linkTypeDefs, links] = await Promise.all([
		ctx.db
			.query("linkTypeDefs")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect(),
		ctx.db
			.query("recordLinks")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect(),
	]);

	for (const link of links.filter(
		(item) =>
			item.sourceObjectDefId === objectDefId ||
			item.targetObjectDefId === objectDefId
	)) {
		await ctx.db.delete(link._id);
	}

	for (const linkTypeDef of linkTypeDefs.filter(
		(item) =>
			item.sourceObjectDefId === objectDefId ||
			item.targetObjectDefId === objectDefId
	)) {
		await ctx.db.delete(linkTypeDef._id);
	}
}

async function deleteFieldGraph(
	ctx: MutationCtx,
	objectDefId: Id<"objectDefs">
): Promise<Doc<"fieldDefs">[]> {
	const fieldDefs = await ctx.db
		.query("fieldDefs")
		.withIndex("by_object", (q) => q.eq("objectDefId", objectDefId))
		.collect();

	for (const fieldDef of fieldDefs) {
		const capabilities = await ctx.db
			.query("fieldCapabilities")
			.withIndex("by_field", (q) => q.eq("fieldDefId", fieldDef._id))
			.collect();

		for (const capability of capabilities) {
			await ctx.db.delete(capability._id);
		}
	}

	return fieldDefs;
}

async function deleteViewGraph(
	ctx: MutationCtx,
	objectDefId: Id<"objectDefs">
): Promise<void> {
	const views = await ctx.db
		.query("viewDefs")
		.withIndex("by_object", (q) => q.eq("objectDefId", objectDefId))
		.collect();

	for (const view of views) {
		const [viewFields, viewFilters, kanbanGroups] = await Promise.all([
			ctx.db
				.query("viewFields")
				.withIndex("by_view", (q) => q.eq("viewDefId", view._id))
				.collect(),
			ctx.db
				.query("viewFilters")
				.withIndex("by_view", (q) => q.eq("viewDefId", view._id))
				.collect(),
			ctx.db
				.query("viewKanbanGroups")
				.withIndex("by_view", (q) => q.eq("viewDefId", view._id))
				.collect(),
		]);

		for (const row of [...viewFields, ...viewFilters, ...kanbanGroups]) {
			await ctx.db.delete(row._id);
		}

		await ctx.db.delete(view._id);
	}
}

export const seedLeadPipeline = authedAction
	.handler(async (ctx): Promise<DemoSeedResult> => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM demo seed");
		}

		const existingObjects = (await ctx.runQuery(
			api.crm.objectDefs.listObjects,
			{}
		)) as Doc<"objectDefs">[];
		const existingObject = existingObjects.find(
			(objectDef: Doc<"objectDefs">) => objectDef.name === DEMO_OBJECT_NAME
		);

		if (existingObject) {
			const views = (await ctx.runQuery(api.crm.viewDefs.listViews, {
				objectDefId: existingObject._id,
			})) as Doc<"viewDefs">[];
			const records = (await ctx.runQuery(api.crm.recordQueries.queryRecords, {
				objectDefId: existingObject._id,
				paginationOpts: {
					cursor: null,
					numItems: 100,
				},
			})) as QueryRecordPageSummary;

			return {
				customObjectCount: existingObjects.filter(
					(objectDef: Doc<"objectDefs">) => !objectDef.isSystem
				).length,
				demoObjectId: existingObject._id,
				demoViewId: views[0]?._id,
				recordCount: records.records.length,
				seeded: false,
			};
		}

		const objectDefId = (await ctx.runMutation(
			api.crm.objectDefs.createObject,
			{
				description: DEMO_DESCRIPTION,
				icon: DEMO_ICON,
				name: DEMO_OBJECT_NAME,
				pluralLabel: "Demo Leads",
				singularLabel: "Demo Lead",
			}
		)) as Id<"objectDefs">;

		for (const field of DEMO_FIELDS) {
			await ctx.runMutation(api.crm.fieldDefs.createField, {
				fieldType: field.fieldType,
				isRequired: field.isRequired,
				label: field.label,
				name: field.name,
				objectDefId,
				options: field.options?.map((option, index) => ({
					...option,
					order: index,
				})),
			});
		}

		for (const record of DEMO_RECORDS) {
			const values = {
				...record,
				next_followup: Date.parse(record.next_followup as string),
			};
			await ctx.runMutation(api.crm.records.createRecord, {
				objectDefId,
				values,
			});
		}

		const views = (await ctx.runQuery(api.crm.viewDefs.listViews, {
			objectDefId,
		})) as Doc<"viewDefs">[];
		const seededObjects = (await ctx.runQuery(
			api.crm.objectDefs.listObjects,
			{}
		)) as Doc<"objectDefs">[];

		return {
			customObjectCount: seededObjects.filter(
				(objectDef: Doc<"objectDefs">) => !objectDef.isSystem
			).length,
			demoObjectId: objectDefId,
			demoViewId: views[0]?._id,
			recordCount: DEMO_RECORDS.length,
			seeded: true,
		};
	})
	.public();

export const createSandboxObject = authedAction
	.input({
		baseName: v.string(),
		description: v.optional(v.string()),
		fields: v.array(
			v.object({
				description: v.optional(v.string()),
				fieldType: fieldTypeValidator,
				isRequired: v.optional(v.boolean()),
				isUnique: v.optional(v.boolean()),
				label: v.string(),
				name: v.string(),
				options: v.optional(v.array(selectOptionValidator)),
			})
		),
		icon: v.string(),
		pluralLabel: v.string(),
		singularLabel: v.string(),
	})
	.handler(async (ctx, args): Promise<SandboxObjectResult> => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM demo setup");
		}

		const normalizedName = args.baseName
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_]+/g, "_")
			.replace(/^_+|_+$/g, "");

		if (!normalizedName) {
			throw new ConvexError("Object API name cannot be empty");
		}

		if (args.fields.length === 0) {
			throw new ConvexError("At least one field is required");
		}

		const objectDefId = (await ctx.runMutation(
			api.crm.objectDefs.createObject,
			{
				description: args.description,
				icon: args.icon,
				name: normalizedName.startsWith("demo_")
					? normalizedName
					: `demo_${normalizedName}`,
				pluralLabel: args.pluralLabel.trim(),
				singularLabel: args.singularLabel.trim(),
			}
		)) as Id<"objectDefs">;

		for (const field of args.fields) {
			await ctx.runMutation(api.crm.fieldDefs.createField, {
				description: field.description,
				fieldType: field.fieldType,
				isRequired: field.isRequired,
				isUnique: field.isUnique,
				label: field.label.trim(),
				name: field.name.trim(),
				objectDefId,
				options: field.options,
			});
		}

		const views = (await ctx.runQuery(api.crm.viewDefs.listViews, {
			objectDefId,
		})) as Doc<"viewDefs">[];

		return {
			demoViewId: views[0]?._id,
			objectDefId,
		};
	})
	.public();

export const getLeadPipelineSeedState = authedQuery
	.handler(async (ctx) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM demo state");
		}

		const objects = await ctx.db
			.query("objectDefs")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		const activeObjects = objects.filter((objectDef) => objectDef.isActive);
		const demoObject = activeObjects.find(
			(objectDef) => objectDef.name === DEMO_OBJECT_NAME
		);

		if (!demoObject) {
			return {
				customObjectCount: activeObjects.filter(
					(objectDef) => !objectDef.isSystem
				).length,
				recordCount: 0,
				seeded: false,
			};
		}

		const records = await ctx.db
			.query("records")
			.withIndex("by_org_object", (q) =>
				q.eq("orgId", orgId).eq("objectDefId", demoObject._id)
			)
			.collect();

		const views = await ctx.db
			.query("viewDefs")
			.withIndex("by_object", (q) => q.eq("objectDefId", demoObject._id))
			.collect();

		return {
			customObjectCount: activeObjects.filter(
				(objectDef) => !objectDef.isSystem
			).length,
			demoObjectId: demoObject._id,
			demoViewId: views.find((view) => view.isDefault)?._id,
			recordCount: records.filter((record) => !record.isDeleted).length,
			seeded: true,
		};
	})
	.public();

export const resetCrmDemo = authedMutation
	.input({})
	.handler(async (ctx) => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			throw new ConvexError("Org context required for CRM demo reset");
		}

		const demoObjects = (
			await ctx.db
				.query("objectDefs")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect()
		).filter((objectDef) => objectDef.name.startsWith("demo_"));

		let deletedObjects = 0;
		let deletedRecords = 0;

		for (const objectDef of demoObjects) {
			deletedRecords += await deleteRecordGraph(ctx, objectDef._id);
			await deleteLinkGraph(ctx, orgId, objectDef._id);
			const fieldDefs = await deleteFieldGraph(ctx, objectDef._id);
			await deleteViewGraph(ctx, objectDef._id);
			for (const fieldDef of fieldDefs) {
				await ctx.db.delete(fieldDef._id);
			}

			await ctx.db.delete(objectDef._id);
			deletedObjects += 1;
		}

		return {
			deletedObjects,
			deletedRecords,
		};
	})
	.public();
