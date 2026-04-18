import { createFileRoute } from "@tanstack/react-router";
import { DocumentEngineVariablesPage } from "#/components/document-engine/DocumentEngineVariablesPage";

export const Route = createFileRoute("/admin/document-engine/variables")({
	component: VariablesPage,
});

function VariablesPage() {
	return <DocumentEngineVariablesPage />;
}
