import {
	createFileRoute,
	Outlet,
	redirect,
	useMatch,
} from "@tanstack/react-router";
import { AdminEntityViewPage } from "#/components/admin/shell/AdminEntityViewPage";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import { type AdminEntityType, isAdminEntityType } from "#/lib/admin-entities";

export const Route = createFileRoute("/admin/$entitytype")({
	beforeLoad: ({ params }) => {
		if (!isAdminEntityType(params.entitytype)) {
			throw redirect({
				to: "/admin",
				search: EMPTY_ADMIN_DETAIL_SEARCH,
			});
		}
	},
	component: EntityList,
});

function EntityList() {
	const { entitytype } = Route.useParams();

	if (!isAdminEntityType(entitytype)) {
		return (
			<div className="p-6 text-muted-foreground text-sm">
				Unknown admin entity type: {entitytype}
			</div>
		);
	}

	return <TypedEntityList entityType={entitytype} />;
}

function TypedEntityList({ entityType }: { entityType: AdminEntityType }) {
	const recordId = useMatch({
		from: "/admin/$entitytype/$recordid",
		select: (match) => match.params.recordid,
		shouldThrow: false,
	});

	if (recordId) {
		return <Outlet />;
	}

	return <AdminEntityViewPage entityType={entityType} />;
}
