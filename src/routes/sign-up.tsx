import { createFileRoute } from "@tanstack/react-router";
import { getSignUpUrl } from "@workos/authkit-tanstack-react-start";
import { buildSignUpRedirect, getReturnPathname } from "./-auth-redirect";

export const Route = createFileRoute("/sign-up")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirectTo: getReturnPathname(search.redirectTo),
	}),
	loaderDeps: ({ search: { redirectTo } }) => ({ redirectTo }),
	loader: async ({ deps: { redirectTo } }) => {
		throw await buildSignUpRedirect(getSignUpUrl, redirectTo);
	},
});
