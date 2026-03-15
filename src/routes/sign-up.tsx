import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSignUpUrl } from "@workos/authkit-tanstack-react-start";

export const Route = createFileRoute("/sign-up")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirectTo:
			typeof search.redirectTo === "string" ? search.redirectTo : undefined,
	}),
	loaderDeps: ({ search: { redirectTo } }) => ({ redirectTo }),
	loader: async ({ deps: { redirectTo } }) => {
		const signUpUrl = await getSignUpUrl({
			data: redirectTo ? { returnPathname: redirectTo } : undefined,
		});
		throw redirect({ href: signUpUrl });
	},
});
