import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/lender")({
	beforeLoad: guardRouteAccess("lender"),
	component: () => <Outlet />,
});
