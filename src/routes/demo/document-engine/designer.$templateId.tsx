import { createFileRoute } from "@tanstack/react-router";
import { TemplateDesignerWorkspace } from "#/components/document-engine/TemplateDesignerWorkspace";
import { DEMO_DOCUMENT_SIGNATORY_ROLE_OPTIONS } from "#/lib/document-engine/contracts";

export const Route = createFileRoute(
	"/demo/document-engine/designer/$templateId"
)({
	component: DesignerPage,
});

function DesignerPage() {
	const { templateId } = Route.useParams();

	return (
		<TemplateDesignerWorkspace
			allowCustomRoles
			backToTemplatesPath="/demo/document-engine/templates"
			roleOptions={DEMO_DOCUMENT_SIGNATORY_ROLE_OPTIONS}
			templateId={templateId}
		/>
	);
}
