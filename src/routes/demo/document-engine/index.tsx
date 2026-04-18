import { createFileRoute } from "@tanstack/react-router";
import { DocumentEngineDashboardPage } from "#/components/document-engine/DocumentEngineDashboardPage";

export const Route = createFileRoute("/demo/document-engine/")({
	component: DashboardPage,
});

function DashboardPage() {
	return <DocumentEngineDashboardPage />;
}
