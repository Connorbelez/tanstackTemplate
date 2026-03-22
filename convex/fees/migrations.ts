import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";
import { adminMutation, adminQuery } from "../fluent";
import { attachDefaultFeeSetToMortgage, FEE_POLICY_VERSION } from "./resolver";

const migrations = new Migrations<DataModel>(components.migrations);

const migrationRefs = internal as unknown as {
	fees: {
		migrations: {
			backfillMortgageFees: never;
			backfillServicingAccountingFields: never;
		};
	};
};

async function resolveSourceObligationType(
	ctx: {
		db: {
			get: <T extends keyof DataModel>(
				id: Id<T>
			) => Promise<DataModel[T]["document"] | null>;
		};
	},
	obligationId: Id<"obligations">
) {
	const obligation = await ctx.db.get(obligationId);
	return obligation?.type;
}

export const backfillMortgageFees = migrations.define({
	table: "mortgages",
	migrateOne: async (ctx, mortgage) => {
		const existingFees = await ctx.db
			.query("mortgageFees")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgage._id))
			.first();
		if (existingFees) {
			return;
		}

		await attachDefaultFeeSetToMortgage(
			ctx.db,
			mortgage._id,
			mortgage.annualServicingRate
		);
	},
});

export const backfillServicingAccountingFields = migrations.define({
	table: "servicingFeeEntries",
	migrateOne: async (ctx, entry) => {
		const sourceObligationType = await resolveSourceObligationType(
			ctx,
			entry.obligationId
		);
		await ctx.db.patch(entry._id, {
			feeDue: entry.feeDue ?? entry.amount,
			feeCashApplied: entry.feeCashApplied ?? entry.amount,
			feeReceivable: entry.feeReceivable ?? 0,
			policyVersion: entry.policyVersion ?? FEE_POLICY_VERSION,
			sourceObligationType: entry.sourceObligationType ?? sourceObligationType,
			feeCode: entry.feeCode ?? "servicing",
		});

		const dispersalEntries = await ctx.db
			.query("dispersalEntries")
			.withIndex("by_obligation", (q) =>
				q.eq("obligationId", entry.obligationId)
			)
			.collect();

		for (const dispersalEntry of dispersalEntries) {
			await ctx.db.patch(dispersalEntry._id, {
				calculationDetails: {
					...dispersalEntry.calculationDetails,
					feeDue:
						dispersalEntry.calculationDetails.feeDue ??
						dispersalEntry.calculationDetails.servicingFee,
					feeCashApplied:
						dispersalEntry.calculationDetails.feeCashApplied ??
						dispersalEntry.calculationDetails.servicingFee,
					feeReceivable: dispersalEntry.calculationDetails.feeReceivable ?? 0,
					policyVersion:
						dispersalEntry.calculationDetails.policyVersion ??
						FEE_POLICY_VERSION,
					sourceObligationType:
						dispersalEntry.calculationDetails.sourceObligationType ??
						sourceObligationType,
					feeCode:
						dispersalEntry.calculationDetails.feeCode ??
						(dispersalEntry.calculationDetails.servicingFee > 0
							? "servicing"
							: undefined),
				},
			});
		}
	},
});

export const runMortgageFeeBackfill = adminMutation
	.input({})
	.handler(async (ctx) => {
		await migrations.runOne(
			ctx,
			migrationRefs.fees.migrations.backfillMortgageFees
		);
	})
	.public();

export const runServicingAccountingBackfill = adminMutation
	.input({})
	.handler(async (ctx) => {
		await migrations.runOne(
			ctx,
			migrationRefs.fees.migrations.backfillServicingAccountingFields
		);
	})
	.public();

export const getMortgageFeeBackfillStatus = adminQuery
	.input({})
	.handler(async (ctx) => {
		const mortgages = await ctx.db.query("mortgages").collect();
		let missingFeeSnapshots = 0;

		for (const mortgage of mortgages) {
			const fee = await ctx.db
				.query("mortgageFees")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgage._id))
				.first();
			if (!fee) {
				missingFeeSnapshots += 1;
			}
		}

		return {
			mortgageCount: mortgages.length,
			missingFeeSnapshots,
		};
	})
	.public();

export const getServicingAccountingBackfillStatus = adminQuery
	.input({})
	.handler(async (ctx) => {
		const entries = await ctx.db.query("servicingFeeEntries").collect();
		const missingAccountingFields = entries.filter(
			(entry) =>
				entry.feeDue === undefined ||
				entry.feeCashApplied === undefined ||
				entry.feeReceivable === undefined ||
				entry.policyVersion === undefined ||
				entry.sourceObligationType === undefined
		);

		return {
			servicingEntryCount: entries.length,
			missingAccountingFieldCount: missingAccountingFields.length,
			missingAccountingFieldIds: missingAccountingFields.map(
				(entry) => entry._id
			),
		};
	})
	.public();
