"use client";

import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useCallback } from "react";
import { useOptionalRecordSidebar } from "#/components/admin/shell/RecordSidebarProvider";
import {
	type AdminRecordRouteTarget,
	type AdminRelationNavigationTarget,
	type AdminRelationPresentation,
	navigateToAdminRelation,
} from "#/lib/admin-relation-navigation";
import { api } from "../../convex/_generated/api";

interface UseAdminRelationNavigationOptions {
	onBeforePageNavigation?: () => void;
	presentation: AdminRelationPresentation;
}

function navigateToRoute(
	navigate: ReturnType<typeof useNavigate>,
	target: AdminRecordRouteTarget
) {
	void navigate({
		params: target.params,
		search: target.search,
		to: target.to,
		viewTransition: true,
	});
}

export function useAdminRelationNavigation(
	options: UseAdminRelationNavigationOptions
) {
	const navigate = useNavigate();
	const objectDefs = useQuery(api.crm.objectDefs.listObjects);
	const sidebar = useOptionalRecordSidebar();
	const canNavigateWithoutMetadata =
		options.presentation === "sheet" && Boolean(sidebar?.push);
	const navigateRelation = useCallback(
		(target: AdminRelationNavigationTarget) => {
			navigateToAdminRelation({
				navigate: (routeTarget) => navigateToRoute(navigate, routeTarget),
				objectDefs,
				onBeforePageNavigation: options.onBeforePageNavigation,
				presentation: options.presentation,
				pushToSidebar: sidebar?.push,
				target,
			});
		},
		[
			navigate,
			objectDefs,
			options.onBeforePageNavigation,
			options.presentation,
			sidebar,
		]
	);

	return objectDefs !== undefined || canNavigateWithoutMetadata
		? navigateRelation
		: undefined;
}
