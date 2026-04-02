import { getRouteApi, useNavigate } from "@tanstack/react-router";

import type { AdminDetailSearch } from "#/lib/admin-detail-search";

const adminRouteApi = getRouteApi("/admin");

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
 * Reads and updates admin detail sheet state from URL search params (`detailOpen`, `recordId`).
 * Use from any route under `/admin`.
 *
 * `from: "/admin"` + `to: "."` alone resolves the destination pathname to `/admin` (the `from` route),
 * not the active leaf (e.g. `/admin/foo`). `unsafeRelative: "path"` bases relative navigation on the
 * current URL pathname so the child segment is preserved.
 */
export function useAdminDetailSheet(): UseAdminDetailSheetResult {
	const { detailOpen, recordId, entityType } = adminRouteApi.useSearch();
	const navigate = useNavigate({ from: "/admin" });

	const patchSearch = (
		updater: (prev: AdminDetailSearch) => AdminDetailSearch
	) => {
		void navigate({
			to: ".",
			unsafeRelative: "path",
			search: updater,
		});
	};

	return {
		detailOpen,
		entityType,
		recordId,
		open: (nextRecordId: string) => {
			patchSearch((prev) => ({
				...prev,
				detailOpen: true,
				recordId: nextRecordId,
			}));
		},
		close: () => {
			patchSearch((prev) => ({
				...prev,
				detailOpen: false,
				recordId: undefined,
			}));
		},
		setSearch: (patch) => {
			patchSearch((prev) => ({
				...prev,
				...patch,
			}));
		},
	};
}
