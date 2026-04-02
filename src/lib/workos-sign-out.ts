import { isRouterTeardownSignOutError } from "./workos-auth";

type SignOutFn = () => Promise<void>;

export async function handleWorkosSignOut(
	signOut: SignOutFn,
	options?: {
		onError?: (message: string) => void;
	}
) {
	try {
		await signOut();
	} catch (error) {
		if (isRouterTeardownSignOutError(error)) {
			window.location.href = "/";
			return;
		}

		const message =
			error instanceof Error
				? error.message
				: "Sign out failed. Please try again.";

		if (options?.onError) {
			options.onError(message);
			return;
		}

		console.error("Sign out failed:", error);
	}
}
