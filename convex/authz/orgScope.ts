import { ConvexError } from "convex/values";

export interface OrgScopedRecordLike {
	orgId?: string | null;
}

export interface OrgScopedViewer {
	isFairLendAdmin: boolean;
	orgId?: string | null;
}

export function viewerCanAccessOrgId(
	viewer: OrgScopedViewer,
	orgId: string | null | undefined
): boolean {
	if (viewer.isFairLendAdmin) {
		return true;
	}

	return Boolean(viewer.orgId && orgId && viewer.orgId === orgId);
}

export function canAccessOrgScopedRecord<T extends OrgScopedRecordLike>(
	viewer: OrgScopedViewer,
	record: T | null | undefined
): record is T {
	if (!record) {
		return false;
	}

	return viewerCanAccessOrgId(viewer, record.orgId);
}

export function assertOrgScopedRecordAccess<
	T extends OrgScopedRecordLike,
>(args: {
	entityName: string;
	notFoundMessage?: string;
	record: T | null | undefined;
	viewer: OrgScopedViewer;
}) {
	if (canAccessOrgScopedRecord(args.viewer, args.record)) {
		return;
	}

	throw new ConvexError(
		args.notFoundMessage ?? `${args.entityName} not found or access denied`
	);
}

export function requireViewerOrgId(
	viewer: OrgScopedViewer,
	message = "Org context required"
) {
	if (viewer.orgId) {
		return viewer.orgId;
	}

	if (viewer.isFairLendAdmin) {
		return null;
	}

	throw new ConvexError(message);
}
