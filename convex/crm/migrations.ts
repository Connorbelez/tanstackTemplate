import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { adminMutation, adminQuery } from "../fluent";
import { deriveFieldContractMetadata } from "./metadataCompiler";

const migrations = new Migrations<DataModel>(components.migrations);

const migrationRefs = internal as unknown as {
	crm: {
		migrations: {
			backfillFieldDefMetadata: never;
		};
	};
};

function isMissingDerivedMetadata(
	fieldDef: DataModel["fieldDefs"]["document"]
) {
	return (
		fieldDef.normalizedFieldKind === undefined ||
		fieldDef.rendererHint === undefined ||
		fieldDef.layoutEligibility === undefined ||
		fieldDef.aggregation === undefined ||
		fieldDef.editability === undefined ||
		fieldDef.isVisibleByDefault === undefined
	);
}

export const backfillFieldDefMetadata = migrations.define({
	table: "fieldDefs",
	migrateOne: async (ctx, fieldDef) => {
		if (!isMissingDerivedMetadata(fieldDef)) {
			return;
		}

		await ctx.db.patch(
			fieldDef._id,
			deriveFieldContractMetadata({
				fieldType: fieldDef.fieldType,
				nativeReadOnly: fieldDef.nativeReadOnly,
				relation: fieldDef.relation,
				computed: fieldDef.computed,
				isVisibleByDefault: fieldDef.isVisibleByDefault,
			})
		);
	},
});

export const runFieldDefMetadataBackfillInternal = internalMutation({
	args: {},
	handler: async (ctx) => {
		await migrations.runOne(
			ctx,
			migrationRefs.crm.migrations.backfillFieldDefMetadata
		);
	},
});

export const runFieldDefMetadataBackfill = adminMutation
	.input({})
	.handler(async (ctx) => {
		await migrations.runOne(
			ctx,
			migrationRefs.crm.migrations.backfillFieldDefMetadata
		);
	})
	.public();

export const getFieldDefMetadataBackfillStatus = adminQuery
	.input({})
	.handler(async (ctx) => {
		const fieldDefs = await ctx.db.query("fieldDefs").collect();
		const missingFieldDefs = fieldDefs.filter(isMissingDerivedMetadata);

		return {
			fieldDefCount: fieldDefs.length,
			missingMetadataCount: missingFieldDefs.length,
			missingFieldDefIds: missingFieldDefs.map((fieldDef) => fieldDef._id),
		};
	})
	.public();
