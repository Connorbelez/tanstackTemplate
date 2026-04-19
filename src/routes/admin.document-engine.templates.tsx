import { createFileRoute } from "@tanstack/react-router";
import { DocumentEngineTemplatesPage } from "#/components/document-engine/DocumentEngineTemplatesPage";

export const Route = createFileRoute("/admin/document-engine/templates")({
	component: TemplatesPage,
});

function TemplatesPage() {
	return (
		<DocumentEngineTemplatesPage designerRoute="/admin/document-engine/designer/$templateId" />
	);
}
