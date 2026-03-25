import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardPermission } from "#/lib/auth";

export const Route = createFileRoute("/onboard")({
	beforeLoad: guardPermission("onboarding:access"),
	component: () => <Outlet />,
});
