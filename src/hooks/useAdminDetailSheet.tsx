import { useLocation } from "@tanstack/react-router";
import { useRecordSidebar } from "#/components/admin/shell/RecordSidebarProvider";
import { getAdminDetailRouteState } from "#/lib/admin-detail-route-state";

export interface UseAdminDetailSheetResult {
	close: () => void;
	readonly detailOpen: boolean;
	readonly entityType: string | undefined;
	open: (recordId: string) => void;
	readonly recordId: string | undefined;
	setSearch: (patch: {
		detailOpen?: boolean;
		recordId?: string | undefined;
		entityType?: string | undefined;
	}) => void;
}

/**
 * Backwards-compatible wrapper around the provider-backed record sidebar state.
 * Existing callers can keep using `open(recordId)` while the new sidebar owns its
 * state in React context instead of URL search params.
 */
export function useAdminDetailSheet(): UseAdminDetailSheetResult {
	const pathname = useLocation({
		select: (location) => location.pathname,
	});
	const routeState = getAdminDetailRouteState(pathname);
	const { close, current, isOpen, open, replace } = useRecordSidebar();
	const entityType = current?.entityType ?? routeState.entityType;
	const recordId = current?.recordId ?? routeState.recordId;
	const detailOpen = isOpen || routeState.detailOpen;

	return {
		close,
		detailOpen,
		entityType,
		recordId,
		open: (recordId) => {
			if (!routeState.entityType) {
				return;
			}

			open({
				entityType: routeState.entityType,
				recordId,
			});
		},
		setSearch: ({ detailOpen, entityType: nextEntityType, recordId }) => {
			if (detailOpen === false) {
				close();
				return;
			}

			if (!recordId) {
				return;
			}

			const resolvedEntityType = nextEntityType ?? entityType;
			if (!resolvedEntityType) {
				return;
			}

			replace({
				entityType: resolvedEntityType,
				recordId,
			});
		},
	};
}
