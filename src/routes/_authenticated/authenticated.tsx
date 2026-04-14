import { createFileRoute } from "@tanstack/react-router";
import { guardAuthenticated } from "#/lib/auth";

export const Route = createFileRoute("/_authenticated/authenticated")({
	beforeLoad: guardAuthenticated(),
	component: AuthenticatedPage,
});

function AuthenticatedPage() {
	return <p>Welcome!</p>;
}
