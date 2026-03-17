import { createFileRoute } from "@tanstack/react-router";
import { KanbanDealsBoard } from "#/components/admin/kanban-deals";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/admin/deals")({
	beforeLoad: guardPermission("admin:access"),
	component: AdminDealsPage,
});

function AdminDealsPage() {
	return (
		<div className="container mx-auto h-full max-w-7xl p-6">
			<div className="mb-6">
				<h1 className="font-bold text-2xl">Deal Pipeline</h1>
				<p className="text-muted-foreground">
					Manage and track deals through their lifecycle
				</p>
			</div>
			<div className="h-[calc(100vh-180px)]">
				<KanbanDealsBoard />
			</div>
		</div>
	);
}
