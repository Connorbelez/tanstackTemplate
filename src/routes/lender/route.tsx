import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/lender")({
	beforeLoad: guardPermission("lender:access"),
	component: () => <Outlet />,
});
