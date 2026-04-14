import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { isFairLendStaffAdmin } from "#/lib/auth-policy";
import { api } from "../../../../convex/_generated/api";

export function useAmpsDemoAccess() {
	const auth = useAuth();
	const canAccess = auth.user
		? isFairLendStaffAdmin({
				orgId: auth.organizationId ?? null,
				role: auth.role,
				roles: auth.roles,
			})
		: false;

	const workspaceOverview = useQuery(
		api.demo.amps.getWorkspaceOverview,
		canAccess ? {} : "skip"
	);

	return {
		auth,
		canAccess,
		workspaceOverview,
	};
}

export function useSelectableSurface<T extends string>(
	items: readonly T[] | undefined
) {
	const [selectedId, setSelectedId] = useState<T | null>(null);

	useEffect(() => {
		if (!items?.length) {
			setSelectedId(null);
			return;
		}

		if (selectedId && items.includes(selectedId)) {
			return;
		}

		setSelectedId(items[0] ?? null);
	}, [items, selectedId]);

	return [selectedId, setSelectedId] as const;
}

export function useMortgageLabelMap<TMortgageId extends string>(
	mortgages:
		| readonly {
				mortgageId: TMortgageId;
				propertyLabel: string;
		  }[]
		| undefined
) {
	return useMemo(
		() =>
			new Map<TMortgageId, string>(
				(mortgages ?? []).map((mortgage) => [
					mortgage.mortgageId,
					mortgage.propertyLabel,
				])
			),
		[mortgages]
	);
}

export function useMortgageOptions<TMortgageId extends string>(
	mortgages:
		| readonly {
				mortgageId: TMortgageId;
				propertyLabel: string;
		  }[]
		| undefined
) {
	return useMemo(
		() =>
			(mortgages ?? []).map((mortgage) => ({
				label: mortgage.propertyLabel,
				mortgageId: mortgage.mortgageId,
			})),
		[mortgages]
	);
}
