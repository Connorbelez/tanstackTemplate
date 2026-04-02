import { createFileRoute } from "@tanstack/react-router";
import { AdminRecordDetailPage } from "#/components/admin/shell/AdminRecordDetailPage";

export const Route = createFileRoute("/admin/$entitytype/$recordid")({
	component: RouteComponent,
});

function RouteComponent() {
	const { entitytype, recordid } = Route.useParams();

	return <AdminRecordDetailPage entityType={entitytype} recordId={recordid} />;
}
