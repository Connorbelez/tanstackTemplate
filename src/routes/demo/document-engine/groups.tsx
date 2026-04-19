import { createFileRoute } from "@tanstack/react-router";
import { DocumentEngineGroupsPage } from "#/components/document-engine/DocumentEngineGroupsPage";
import { DEMO_DOCUMENT_SIGNATORY_ROLE_OPTIONS } from "#/lib/document-engine/contracts";

export const Route = createFileRoute("/demo/document-engine/groups")({
	component: GroupsPage,
});

function GroupsPage() {
	return (
		<DocumentEngineGroupsPage
			roleOptions={DEMO_DOCUMENT_SIGNATORY_ROLE_OPTIONS}
		/>
	);
}
