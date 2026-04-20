import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardRouteAccess } from "#/lib/auth";

export const Route = createFileRoute("/onboard")({
	beforeLoad: guardRouteAccess("onboarding"),
	component: () => <Outlet />,
});
