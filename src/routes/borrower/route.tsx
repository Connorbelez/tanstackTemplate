import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/borrower")({
	beforeLoad: guardRouteAccess("borrower"),
	component: () => <Outlet />,
});
