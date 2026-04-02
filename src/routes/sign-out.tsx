import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { handleWorkosSignOut } from "#/lib/workos-sign-out";

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
					handleWorkosSignOut(signOut, {
						onError: (message) => setErrorMessage(message),
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
