import { createFileRoute } from "@tanstack/react-router";
import { DocumentEngineTemplatesPage } from "#/components/document-engine/DocumentEngineTemplatesPage";

export const Route = createFileRoute("/demo/document-engine/templates")({
	component: TemplatesPage,
});

function TemplatesPage() {
	return (
		<DocumentEngineTemplatesPage designerRoute="/demo/document-engine/designer/$templateId" />
	);
}
