import { createFileRoute } from "@tanstack/react-router";
import { getSignInUrl } from "@workos/authkit-tanstack-react-start";
import { buildSignInRedirect, getReturnPathname } from "./-auth-redirect";

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirectTo: getReturnPathname(search.redirectTo),
	}),
	loaderDeps: ({ search: { redirectTo } }) => ({ redirectTo }),
	loader: async ({ deps: { redirectTo } }) => {
		throw await buildSignInRedirect(getSignInUrl, redirectTo);
	},
});
