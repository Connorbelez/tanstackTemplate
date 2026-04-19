import { createFileRoute } from "@tanstack/react-router";
import { DocumentEngineLibraryPage } from "#/components/document-engine/DocumentEngineLibraryPage";

export const Route = createFileRoute("/admin/document-engine/library")({
	component: LibraryPage,
});

function LibraryPage() {
	return <DocumentEngineLibraryPage />;
}
