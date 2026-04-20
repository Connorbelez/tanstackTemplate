import { createFileRoute } from "@tanstack/react-router";
import { AdminSettingsPage } from "#/components/admin/settings/AdminSettingsPage";

export const Route = createFileRoute("/admin/settings")({
	component: AdminSettingsPage,
});
