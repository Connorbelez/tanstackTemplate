import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";

export default function SignInButton({ large }: { large?: boolean }) {
	const { user, signOut } = useAuth();
	const pathname = useLocation({
		select: (location) => location.pathname,
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
					onClick={() => void signOut()}
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
				search={{ redirectTo: pathname }}
				to="/sign-in"
			>
				Sign in
			</Link>
			<Link
				className="rounded-md bg-foreground px-4 py-2 text-background"
				search={{ redirectTo: pathname }}
				to="/sign-up"
			>
				Sign up
			</Link>
		</>
	);
}
