import { createFileRoute } from "@tanstack/react-router";
import { AdminRecordDetailPage } from "#/components/admin/shell/AdminRecordDetailPage";

export const Route = createFileRoute("/admin/listings/$recordid")({
	component: RouteComponent,
});

function RouteComponent() {
	const { recordid } = Route.useParams();

	return <AdminRecordDetailPage entityType="listings" recordId={recordid} />;
}
