import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/demo/rbac/lender")({
	beforeLoad: guardPermission("lender:access"),
	component: () => <Outlet />,
});
