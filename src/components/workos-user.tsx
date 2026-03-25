import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { buildSignInRedirect, buildSignUpRedirect } from "#/lib/auth-redirect";
import { isRouterTeardownSignOutError } from "#/lib/workos-auth";

export default function SignInButton({ large }: { large?: boolean }) {
	const { user, signOut } = useAuth();
	const href = useLocation({
		select: (location) => location.href,
	});

	const buttonClasses = `${
		large ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"
	} bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed`;

	if (user) {
		return (
			<div className="flex gap-3">
				<div className="flex items-center gap-2">
					{user.profilePictureUrl && (
						<img
							alt={`Avatar of ${user.firstName} ${user.lastName}`}
							className="h-10 w-10 rounded-full"
							height={40}
							src={user.profilePictureUrl}
							width={40}
						/>
					)}
					{user.firstName} {user.lastName}
				</div>
				<button
					className={buttonClasses}
					onClick={() => {
						void signOut().catch((error) => {
							// AuthKitProvider's post-signOut navigate() crashes when
							// the router context tears down. Session is already cleared
							// server-side — just force a full page reload.
							if (isRouterTeardownSignOutError(error)) {
								window.location.href = "/";
								return;
							}
							console.error("Sign out failed:", error);
						});
					}}
					type="button"
				>
					Sign Out
				</button>
			</div>
		);
	}

	return (
		<>
			<Link
				className="rounded-md bg-foreground px-4 py-2 text-background"
				{...buildSignInRedirect(href)}
			>
				Sign in
			</Link>
			<Link
				className="rounded-md bg-foreground px-4 py-2 text-background"
				{...buildSignUpRedirect(href)}
			>
				Sign up
			</Link>
		</>
	);
}
