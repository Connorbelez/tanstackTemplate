import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/borrower")({
	beforeLoad: guardPermission("borrower:access"),
	component: () => <Outlet />,
});
