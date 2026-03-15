import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/sign-out")({
	component: RouteComponent,
});

function RouteComponent() {
	const { signOut } = useAuth();
	return (
		<div>
			<Button
				onClick={() =>
					signOut().catch(() => {
						// AuthKitProvider's post-signOut navigate() crashes when
						// the router context tears down. Session is already cleared
						// server-side — just force a full page reload.
						window.location.href = "/";
					})
				}
			>
				Sign Out
			</Button>
		</div>
	);
}
