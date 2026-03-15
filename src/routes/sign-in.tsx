import { createFileRoute } from "@tanstack/react-router";
import { getSignInUrl } from "@workos/authkit-tanstack-react-start";

export const Route = createFileRoute("/sign-in")({
	loader: async () => {
		const signInUrl = await getSignInUrl();
		console.log("signInUrl", signInUrl);
		return { signInUrl };
	},
});
