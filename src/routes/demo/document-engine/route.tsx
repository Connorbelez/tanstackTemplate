import { createFileRoute } from "@tanstack/react-router";
import { DocumentEngineLayout } from "#/components/document-engine/DocumentEngineLayout";
import { guardFairLendAdminWithPermission } from "#/lib/auth";

export const Route = createFileRoute("/demo/document-engine")({
	beforeLoad: guardFairLendAdminWithPermission("document:review"),
	component: DemoDocumentEngineLayout,
	ssr: false,
});

function DemoDocumentEngineLayout() {
	return (
		<DocumentEngineLayout
			description="Template authoring, variable interpolation, and document generation"
			paths={{
				dashboard: "/demo/document-engine",
				generate: "/demo/document-engine/generate",
				groups: "/demo/document-engine/groups",
				library: "/demo/document-engine/library",
				templates: "/demo/document-engine/templates",
				variables: "/demo/document-engine/variables",
			}}
			title="Document Engine"
		/>
	);
}
