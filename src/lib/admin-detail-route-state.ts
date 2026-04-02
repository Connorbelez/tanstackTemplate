import { getAdminEntityByPathname } from "#/components/admin/shell/entity-registry";

export interface AdminDetailRouteState {
	readonly detailOpen: boolean;
	readonly entityType: string | undefined;
	readonly recordId: string | undefined;
}

function decodePathSegment(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	try {
		const decoded = decodeURIComponent(value);
		return decoded.length > 0 ? decoded : undefined;
	} catch {
		return value;
	}
}

export function getAdminDetailRouteState(pathname: string): AdminDetailRouteState {
	const entityType = getAdminEntityByPathname(pathname)?.entityType;

	if (!entityType) {
		return {
			detailOpen: false,
			entityType: undefined,
			recordId: undefined,
		};
	}

	const segments = pathname.split("/").filter(Boolean);
	const recordId =
		segments[0] === "admin" && segments[1] === entityType
			? decodePathSegment(segments[2])
			: undefined;

	return {
		detailOpen: recordId !== undefined,
		entityType,
		recordId,
	};
}
