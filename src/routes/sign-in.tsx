import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSignInUrl } from "@workos/authkit-tanstack-react-start";
import { sanitizeRedirectPath } from "#/lib/auth-redirect";

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: sanitizeRedirectPath(search.redirect ?? search.redirectTo),
	}),
	loaderDeps: ({ search: { redirect } }) => ({ redirect }),
	loader: async ({ deps: { redirect: redirectTarget } }) => {
		const signInUrl = await getSignInUrl({
			data: redirectTarget ? { returnPathname: redirectTarget } : undefined,
		});
		throw redirect({ href: signInUrl });
	},
});
