import { createFileRoute } from "@tanstack/react-router";
import { DocumentEngineGroupsPage } from "#/components/document-engine/DocumentEngineGroupsPage";
import { MORTGAGE_DOCUMENT_SIGNATORY_ROLE_OPTIONS } from "#/lib/document-engine/contracts";

export const Route = createFileRoute("/admin/document-engine/groups")({
	component: GroupsPage,
});

function GroupsPage() {
	return (
		<DocumentEngineGroupsPage
			roleOptions={MORTGAGE_DOCUMENT_SIGNATORY_ROLE_OPTIONS}
		/>
	);
}
