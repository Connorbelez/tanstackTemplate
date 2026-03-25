import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/demo/rbac/admin/underwriting")({
	beforeLoad: guardPermission("underwriter:access"),
	component: () => <Outlet />,
});
