import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSignUpUrl } from "@workos/authkit-tanstack-react-start";
import { sanitizeRedirectPath } from "#/lib/auth-redirect";

export const Route = createFileRoute("/sign-up")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: sanitizeRedirectPath(search.redirect ?? search.redirectTo),
	}),
	loaderDeps: ({ search: { redirect } }) => ({ redirect }),
	loader: async ({ deps: { redirect: redirectTarget } }) => {
		const signUpUrl = await getSignUpUrl({
			data: redirectTarget ? { returnPathname: redirectTarget } : undefined,
		});
		throw redirect({ href: signUpUrl });
	},
});
