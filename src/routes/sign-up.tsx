import { createFileRoute } from "@tanstack/react-router";
import { getSignUpUrl } from "@workos/authkit-tanstack-react-start";

export const Route = createFileRoute("/sign-up")({
	loader: async () => {
		const signUpUrl = await getSignUpUrl();
		return { signUpUrl };
	},
});
