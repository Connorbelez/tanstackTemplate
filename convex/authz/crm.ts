import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getNativeRecordById } from "../crm/systemAdapters/queryAdapter";
import type { Viewer } from "../fluent";
import { canAccessOrgScopedRecord } from "./orgScope";

interface CrmViewer {
	isFairLendAdmin: boolean;
	orgId?: string | null;
}

type AnyCrmCtx = QueryCtx | MutationCtx;

export async function assertRecordAccessible(args: {
	ctx: AnyCrmCtx;
	objectDefId: Doc<"objectDefs">["_id"];
	recordId: string;
	recordKind: "record" | "native";
	viewer: Pick<Viewer, "isFairLendAdmin" | "orgId">;
}) {
	const objectDef = await args.ctx.db.get(args.objectDefId);
	if (
		!(canAccessOrgScopedRecord(args.viewer, objectDef) && objectDef.isActive)
	) {
		throw new ConvexError("Object not found or access denied");
	}
	const orgId = objectDef.orgId;
	if (!orgId) {
		throw new ConvexError("Object org context required");
	}

	if (args.recordKind === "record") {
		const normalizedRecordId = args.ctx.db.normalizeId(
			"records",
			args.recordId
		);
		if (!normalizedRecordId) {
			throw new ConvexError("Record not found or access denied");
		}

		const recordDoc = await args.ctx.db.get(normalizedRecordId);
		if (
			!(recordDoc && canAccessOrgScopedRecord(args.viewer, recordDoc)) ||
			recordDoc.isDeleted ||
			recordDoc.objectDefId !== args.objectDefId
		) {
			throw new ConvexError("Record not found or access denied");
		}

		return { objectDef, recordDoc };
	}

	if (!(objectDef.isSystem && objectDef.nativeTable)) {
		throw new ConvexError("Native record requires a system object");
	}

	const nativeRecord = await getNativeRecordById(
		args.ctx as QueryCtx,
		objectDef,
		[],
		orgId,
		args.recordId
	);
	if (!nativeRecord) {
		throw new ConvexError("Record not found or access denied");
	}

	return { objectDef, recordDoc: nativeRecord };
}

export function canAccessCrmOrgScopedRecord<
	T extends { orgId?: string | null },
>(viewer: CrmViewer, record: T | null | undefined): record is T {
	return canAccessOrgScopedRecord(viewer, record);
}
