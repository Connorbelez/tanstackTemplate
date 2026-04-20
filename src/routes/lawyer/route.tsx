import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/lawyer")({
	beforeLoad: guardRouteAccess("lawyer"),
	component: () => <Outlet />,
});
