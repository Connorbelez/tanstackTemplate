import { getAdminEntityByPathname } from "#/components/admin/shell/entity-registry";
import { isReservedAdminRouteSegment } from "#/lib/admin-entities";

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

export function getAdminDetailRouteState(
	pathname: string
): AdminDetailRouteState {
	const segments = pathname.split("/").filter(Boolean);
	if (segments[0] !== "admin") {
		return {
			detailOpen: false,
			entityType: undefined,
			recordId: undefined,
		};
	}

	const routeEntityType = getAdminEntityByPathname(pathname)?.entityType;
	const pathEntityType = decodePathSegment(segments[1]);
	const entityType =
		routeEntityType ??
		(pathEntityType && !isReservedAdminRouteSegment(pathEntityType)
			? pathEntityType
			: undefined);

	if (!entityType) {
		return {
			detailOpen: false,
			entityType: undefined,
			recordId: undefined,
		};
	}

	const recordId =
		pathEntityType === entityType ? decodePathSegment(segments[2]) : undefined;

	return {
		detailOpen: recordId !== undefined,
		entityType,
		recordId,
	};
}
