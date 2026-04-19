import { createFileRoute } from "@tanstack/react-router";
import { DocumentEngineDashboardPage } from "#/components/document-engine/DocumentEngineDashboardPage";

export const Route = createFileRoute("/admin/document-engine/")({
	component: DashboardPage,
});

function DashboardPage() {
	return <DocumentEngineDashboardPage />;
}
