import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

function toBusinessDate(timestamp: number) {
	return new Date(timestamp).toISOString().slice(0, 10);
}

export async function createOriginationValuationSnapshot(
	ctx: Pick<MutationCtx, "db">,
	args: {
		createdAt: number;
		mortgageId: Id<"mortgages">;
		propertyId: Id<"properties">;
		relatedDocumentAssetId?: Id<"_storage">;
		termStartDate: string;
		valuationDate?: string;
		valueAsIs: number;
		visibilityHint?: "private" | "public";
	}
) {
	const effectiveDate =
		args.valuationDate?.trim() ||
		args.termStartDate ||
		toBusinessDate(args.createdAt);
	const notes = args.visibilityHint
		? `Origination valuation visibility: ${args.visibilityHint}`
		: undefined;
	const valuationSnapshotId = await ctx.db.insert(
		"mortgageValuationSnapshots",
		{
			createdAt: args.createdAt,
			effectiveDate,
			mortgageId: args.mortgageId,
			propertyId: args.propertyId,
			relatedDocumentAssetId: args.relatedDocumentAssetId,
			valueAsIs: args.valueAsIs,
			visibilityHint: args.visibilityHint,
		}
	);
	const appraisalId = await ctx.db.insert("appraisals", {
		propertyId: args.propertyId,
		appraisalType: "as_is",
		appraisedValue: args.valueAsIs,
		appraiserName: "FairLend Origination Workspace",
		appraiserFirm: "FairLend",
		effectiveDate,
		reportDate: effectiveDate,
		reportFileRef: args.relatedDocumentAssetId,
		notes,
		createdAt: args.createdAt,
	});

	return { appraisalId, effectiveDate, valuationSnapshotId };
}
