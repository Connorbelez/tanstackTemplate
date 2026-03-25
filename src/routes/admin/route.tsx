import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/admin")({
	beforeLoad: guardPermission("admin:access"),
	component: () => <Outlet />,
});
