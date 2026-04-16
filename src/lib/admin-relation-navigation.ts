import { resolveAdminEntityTypeForObjectDef } from "#/components/admin/shell/entity-registry";
import type { SidebarRecordRef } from "#/components/admin/shell/RecordSidebarProvider";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import {
	type DedicatedAdminRecordRoute,
	getDedicatedAdminRecordRoute,
	isDedicatedAdminEntityType,
} from "#/lib/admin-entity-routes";
import type { Doc } from "../../convex/_generated/dataModel";

type ObjectDefSummary = Pick<
	Doc<"objectDefs">,
	"_id" | "name" | "nativeTable" | "pluralLabel" | "singularLabel"
>;

export type AdminRelationPresentation = "page" | "sheet";

export interface AdminRelationNavigationTarget {
	objectDefId: string;
	recordId: string;
	recordKind: "record" | "native";
}

export type AdminRecordRouteTarget =
	| {
			params: {
				recordid: string;
			};
			search: typeof EMPTY_ADMIN_DETAIL_SEARCH;
			to: DedicatedAdminRecordRoute;
	  }
	| {
			params: {
				entitytype: string;
				recordid: string;
			};
			search: typeof EMPTY_ADMIN_DETAIL_SEARCH;
			to: "/admin/$entitytype/$recordid";
	  };

export function resolveAdminRelationReference(args: {
	objectDefs?: readonly ObjectDefSummary[];
	target: AdminRelationNavigationTarget;
}): SidebarRecordRef {
	const objectDef = args.objectDefs?.find(
		(candidate) => String(candidate._id) === args.target.objectDefId
	);
	const entityType = objectDef
		? resolveAdminEntityTypeForObjectDef(objectDef)
		: undefined;

	return {
		entityType,
		objectDefId: args.target.objectDefId,
		recordId: args.target.recordId,
		recordKind: args.target.recordKind,
	};
}

export function resolveAdminRecordRouteTarget(
	reference: Pick<SidebarRecordRef, "entityType" | "recordId">
): AdminRecordRouteTarget | null {
	if (!reference.entityType) {
		return null;
	}

	if (isDedicatedAdminEntityType(reference.entityType)) {
		return {
			params: {
				recordid: reference.recordId,
			},
			search: EMPTY_ADMIN_DETAIL_SEARCH,
			to: getDedicatedAdminRecordRoute(reference.entityType),
		};
	}

	return {
		params: {
			entitytype: reference.entityType,
			recordid: reference.recordId,
		},
		search: EMPTY_ADMIN_DETAIL_SEARCH,
		to: "/admin/$entitytype/$recordid",
	};
}

export function navigateToAdminRelation(args: {
	navigate: (target: AdminRecordRouteTarget) => void;
	objectDefs?: readonly ObjectDefSummary[];
	onBeforePageNavigation?: () => void;
	presentation: AdminRelationPresentation;
	pushToSidebar?: ((record: SidebarRecordRef) => void) | undefined;
	target: AdminRelationNavigationTarget;
}) {
	const reference = resolveAdminRelationReference({
		objectDefs: args.objectDefs,
		target: args.target,
	});

	if (args.presentation === "sheet" && args.pushToSidebar) {
		args.pushToSidebar(reference);
		return;
	}

	const routeTarget = resolveAdminRecordRouteTarget(reference);
	if (!routeTarget) {
		return;
	}

	args.onBeforePageNavigation?.();
	args.navigate(routeTarget);
}
