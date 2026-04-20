import { createFileRoute } from "@tanstack/react-router";
import { DocumentEngineLayout } from "#/components/document-engine/DocumentEngineLayout";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/admin/document-engine")({
	beforeLoad: guardRouteAccess("adminDocumentEngine"),
	component: AdminDocumentEngineLayout,
	ssr: false,
});

function AdminDocumentEngineLayout() {
	return (
		<DocumentEngineLayout
			description="Production mortgage and deal document authoring for origination and package materialization."
			paths={{
				dashboard: "/admin/document-engine",
				groups: "/admin/document-engine/groups",
				library: "/admin/document-engine/library",
				templates: "/admin/document-engine/templates",
				variables: "/admin/document-engine/variables",
			}}
			title="Document Engine"
		/>
	);
}
