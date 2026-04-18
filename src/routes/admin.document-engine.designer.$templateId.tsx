import { createFileRoute } from "@tanstack/react-router";
import { TemplateDesignerWorkspace } from "#/components/document-engine/TemplateDesignerWorkspace";
import { MORTGAGE_DOCUMENT_SIGNATORY_ROLE_OPTIONS } from "#/lib/document-engine/contracts";

export const Route = createFileRoute(
	"/admin/document-engine/designer/$templateId"
)({
	component: DesignerPage,
});

function DesignerPage() {
	const { templateId } = Route.useParams();

	return (
		<TemplateDesignerWorkspace
			allowCustomRoles={false}
			backToTemplatesPath="/admin/document-engine/templates"
			roleOptions={MORTGAGE_DOCUMENT_SIGNATORY_ROLE_OPTIONS}
			templateId={templateId}
		/>
	);
}
