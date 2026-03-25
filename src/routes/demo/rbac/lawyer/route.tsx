import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/demo/rbac/lawyer")({
	beforeLoad: guardPermission("lawyer:access"),
	component: () => <Outlet />,
});
