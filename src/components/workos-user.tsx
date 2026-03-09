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
							src={user.profilePictureUrl}
							alt={`Avatar of ${user.firstName} ${user.lastName}`}
							className="w-10 h-10 rounded-full"
						/>
					)}
					{user.firstName} {user.lastName}
				</div>
				<button
					type="button"
					onClick={() => void signOut()}
					className={buttonClasses}
				>
					Sign Out
				</button>
			</div>
		);
	}

	return (
		<>
			<Link
				to="/sign-in"
				search={{ redirectTo: pathname }}
				className="bg-foreground text-background px-4 py-2 rounded-md"
			>
				Sign in
			</Link>
			<Link
				to="/sign-up"
				search={{ redirectTo: pathname }}
				className="bg-foreground text-background px-4 py-2 rounded-md"
			>
				Sign up
			</Link>
		</>
	);
}
