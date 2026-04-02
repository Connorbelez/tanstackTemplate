import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { KanbanDealsBoard } from "#/components/admin/kanban-deals";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";

export const Route = createFileRoute("/admin/deals")({
	component: AdminDealsPage,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: DealsPendingPage,
});

function AdminDealsPage() {
	const recordId = useMatch({
		from: "/admin/deals/$recordid",
		select: (match) => match.params.recordid,
		shouldThrow: false,
	});

	if (recordId) {
		return <Outlet />;
	}

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

function DealsPendingPage() {
	return (
		<AdminPageSkeleton descriptionWidth="w-64" titleWidth="w-44">
			<div className="h-[calc(100vh-180px)] rounded-xl border">
				<div className="grid h-full place-items-center">
					<div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-foreground" />
				</div>
			</div>
		</AdminPageSkeleton>
	);
}
