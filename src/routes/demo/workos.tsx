import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";

export const Route = createFileRoute("/demo/workos")({
	ssr: false,
	component: App,
});

function App() {
	const { user, loading, signOut } = useAuth();
	const pathname = useLocation({
		select: (location) => location.pathname,
	});

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
				<div className="w-full max-w-md rounded-2xl border border-gray-700/50 bg-gray-800/50 p-8 shadow-2xl backdrop-blur-sm">
					<p className="text-center text-gray-400">Loading...</p>
				</div>
			</div>
		);
	}

	if (user) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
				<div className="w-full max-w-md rounded-2xl border border-gray-700/50 bg-gray-800/50 p-8 shadow-2xl backdrop-blur-sm">
					<h1 className="mb-6 text-center font-bold text-2xl text-white">
						User Profile
					</h1>

					<div className="space-y-6">
						{/* Profile Picture */}
						{user.profilePictureUrl && (
							<div className="flex justify-center">
								<img
									alt={`Avatar of ${user.firstName} ${user.lastName}`}
									className="h-24 w-24 rounded-full border-4 border-gray-700 shadow-lg"
									height={96}
									src={user.profilePictureUrl}
									width={96}
								/>
							</div>
						)}

						{/* User Information */}
						<div className="space-y-4">
							<div className="rounded-lg border border-gray-600/30 bg-gray-700/30 p-4">
								<p className="mb-1 block font-medium text-gray-400 text-sm">
									First Name
								</p>
								<p className="text-lg text-white">{user.firstName || "N/A"}</p>
							</div>

							<div className="rounded-lg border border-gray-600/30 bg-gray-700/30 p-4">
								<p className="mb-1 block font-medium text-gray-400 text-sm">
									Last Name
								</p>
								<p className="text-lg text-white">{user.lastName || "N/A"}</p>
							</div>

							<div className="rounded-lg border border-gray-600/30 bg-gray-700/30 p-4">
								<p className="mb-1 block font-medium text-gray-400 text-sm">
									Email
								</p>
								<p className="break-all text-lg text-white">
									{user.email || "N/A"}
								</p>
							</div>

							<div className="rounded-lg border border-gray-600/30 bg-gray-700/30 p-4">
								<p className="mb-1 block font-medium text-gray-400 text-sm">
									User ID
								</p>
								<p className="break-all font-mono text-gray-300 text-sm">
									{user.id || "N/A"}
								</p>
							</div>
						</div>

						{/* Sign Out Button */}
						<button
							className="w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white shadow-lg transition-colors hover:bg-blue-700 hover:shadow-xl"
							onClick={() => signOut()}
							type="button"
						>
							Sign Out
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
			<div className="w-full max-w-md rounded-2xl border border-gray-700/50 bg-gray-800/50 p-8 shadow-2xl backdrop-blur-sm">
				<h1 className="mb-6 text-center font-bold text-2xl text-white">
					WorkOS Authentication
				</h1>
				<p className="mb-6 text-center text-gray-400">
					Sign in to view your profile information
				</p>
				<Link
					className="w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white shadow-lg transition-colors hover:bg-blue-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
					search={{ redirectTo: pathname }}
					to="/sign-in"
				>
					Sign In with AuthKit
				</Link>
			</div>
		</div>
	);
}
