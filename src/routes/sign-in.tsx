import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSignInUrl } from "@workos/authkit-tanstack-react-start";

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirectTo:
			typeof search.redirectTo === "string" ? search.redirectTo : undefined,
	}),
	loaderDeps: ({ search: { redirectTo } }) => ({ redirectTo }),
	loader: async ({ deps: { redirectTo } }) => {
		const signInUrl = await getSignInUrl({
			data: redirectTo ? { returnPathname: redirectTo } : undefined,
		});
		throw redirect({ href: signInUrl });
	},
});
