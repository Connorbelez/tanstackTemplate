import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/demo/rbac/broker")({
	beforeLoad: guardPermission("broker:access"),
	component: () => <Outlet />,
});
