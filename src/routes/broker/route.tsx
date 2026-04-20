import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/broker")({
	beforeLoad: guardRouteAccess("broker"),
	component: () => <Outlet />,
});
