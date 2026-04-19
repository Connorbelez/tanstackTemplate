import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

function toBusinessDate(timestamp: number) {
	return new Date(timestamp).toISOString().slice(0, 10);
}

export async function createOriginationValuationSnapshot(
	ctx: Pick<MutationCtx, "db">,
	args: {
		createdAt: number;
		createdByUserId: Id<"users">;
		mortgageId: Id<"mortgages">;
		relatedDocumentAssetId?: Id<"documentAssets">;
		source: "admin_origination" | "appraisal_import" | "underwriting";
		termStartDate: string;
		valuationDate?: string;
		valueAsIs: number;
	}
) {
	const mortgage = await ctx.db.get(args.mortgageId);
	if (!mortgage) {
		throw new ConvexError("Mortgage no longer exists for valuation snapshot");
	}
	const valuationDate =
		args.valuationDate?.trim() ||
		args.termStartDate ||
		toBusinessDate(args.createdAt);
	const relatedDocumentAsset = args.relatedDocumentAssetId
		? await ctx.db.get(args.relatedDocumentAssetId)
		: null;
	if (args.relatedDocumentAssetId && !relatedDocumentAsset) {
		throw new ConvexError("Related valuation document asset no longer exists");
	}
	const valuationSnapshotId = await ctx.db.insert(
		"mortgageValuationSnapshots",
		{
			createdAt: args.createdAt,
			createdByUserId: args.createdByUserId,
			mortgageId: args.mortgageId,
			relatedDocumentAssetId: args.relatedDocumentAssetId,
			source: args.source,
			valueAsIs: args.valueAsIs,
			valuationDate,
		}
	);
	const appraisalId = await ctx.db.insert("appraisals", {
		propertyId: mortgage.propertyId,
		appraisalType: "as_is",
		appraisedValue: args.valueAsIs,
		appraiserName: "FairLend Origination Workspace",
		appraiserFirm: "FairLend",
		effectiveDate: valuationDate,
		reportDate: valuationDate,
		reportFileRef: relatedDocumentAsset?.fileRef,
		createdAt: args.createdAt,
	});

	return { appraisalId, valuationDate, valuationSnapshotId };
}
