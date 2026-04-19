import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { OriginationCasesIndexPage } from "#/components/admin/origination/OriginationCasesIndexPage";
import {
	AdminPageSkeleton,
	AdminRouteErrorBoundary,
} from "#/components/admin/shell/AdminRouteStates";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/admin/originations")({
	beforeLoad: guardRouteAccess("adminOriginations"),
	component: OriginationsRouteComponent,
	errorComponent: AdminRouteErrorBoundary,
	pendingComponent: OriginationsPendingPage,
});

function OriginationsRouteComponent() {
	const caseId = useMatch({
		from: "/admin/originations/$caseId",
		select: (match) => match.params.caseId,
		shouldThrow: false,
	});
	const isNewCaseRoute = useMatch({
		from: "/admin/originations/new",
		select: () => true,
		shouldThrow: false,
	});

	if (caseId || isNewCaseRoute) {
		return <Outlet />;
	}

	return <OriginationCasesIndexPage />;
}

function OriginationsPendingPage() {
	return <AdminPageSkeleton descriptionWidth="w-72" titleWidth="w-64" />;
}
