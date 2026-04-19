"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

interface AdminPageMetadataContextValue {
	readonly breadcrumbLabel: string | undefined;
	setBreadcrumbLabel: (label: string | undefined) => void;
}

const AdminPageMetadataContext = createContext<
	AdminPageMetadataContextValue | undefined
>(undefined);

export function AdminPageMetadataProvider({
	children,
}: {
	readonly children: ReactNode;
}) {
	const [breadcrumbLabel, setBreadcrumbLabel] = useState<string | undefined>(
		undefined
	);

	const value = useMemo<AdminPageMetadataContextValue>(
		() => ({
			breadcrumbLabel,
			setBreadcrumbLabel,
		}),
		[breadcrumbLabel]
	);

	return (
		<AdminPageMetadataContext.Provider value={value}>
			{children}
		</AdminPageMetadataContext.Provider>
	);
}

export function useAdminPageMetadata() {
	const context = useContext(AdminPageMetadataContext);
	if (!context) {
		throw new Error(
			"useAdminPageMetadata must be used within an AdminPageMetadataProvider"
		);
	}

	return context;
}

export function useAdminBreadcrumbLabel(label: string | undefined) {
	const { setBreadcrumbLabel } = useAdminPageMetadata();

	useEffect(() => {
		setBreadcrumbLabel(label);

		return () => {
			setBreadcrumbLabel(undefined);
		};
	}, [label, setBreadcrumbLabel]);
}
