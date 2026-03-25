import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { isRouterTeardownSignOutError } from "#/lib/workos-auth";

export const Route = createFileRoute("/sign-out")({
	component: RouteComponent,
});

function RouteComponent() {
	const { signOut } = useAuth();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	return (
		<div>
			<Button
				onClick={() =>
					signOut().catch((error) => {
						// AuthKitProvider's post-signOut navigate() crashes when
						// the router context tears down. Session is already cleared
						// server-side — just force a full page reload.
						if (isRouterTeardownSignOutError(error)) {
							window.location.href = "/";
							return;
						}
						setErrorMessage(
							error instanceof Error
								? error.message
								: "Sign out failed. Please try again."
						);
					})
				}
			>
				Sign Out
			</Button>
			{errorMessage ? (
				<p className="mt-2 text-destructive text-sm">{errorMessage}</p>
			) : null}
		</div>
	);
}
