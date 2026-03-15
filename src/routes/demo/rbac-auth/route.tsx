import {
	createFileRoute,
	Link,
	Outlet,
	useMatches,
} from "@tanstack/react-router";
import {
	Eye,
	FileText,
	LayoutDashboard,
	Shield,
	UserPlus,
	Users,
} from "lucide-react";
import { guardAuthenticated } from "#/lib/auth";

export const Route = createFileRoute("/demo/rbac-auth")({
	ssr: false,
	beforeLoad: guardAuthenticated(),
	component: RbacAuthLayout,
});

const NAV_ITEMS = [
	{
		to: "/demo/rbac-auth",
		label: "Overview",
		icon: LayoutDashboard,
	},
	{
		to: "/demo/rbac-auth/roles",
		label: "Roles & Permissions",
		icon: Shield,
	},
	{
		to: "/demo/rbac-auth/access-control",
		label: "Access Control",
		icon: Eye,
	},
	{
		to: "/demo/rbac-auth/onboarding",
		label: "User Onboarding",
		icon: UserPlus,
	},
	{
		to: "/demo/rbac-auth/audit",
		label: "Audit Trail",
		icon: FileText,
	},
] as const;

function RbacAuthLayout() {
	const matches = useMatches();
	const currentPath = matches.at(-1)?.fullPath ?? "";

	return (
		<div className="mx-auto max-w-7xl p-4 py-8">
			<div className="mb-6">
				<div className="flex items-center gap-2">
					<Users className="size-6 text-primary" />
					<h1 className="font-bold text-2xl">RBAC & Authentication</h1>
				</div>
				<p className="mt-1 text-muted-foreground text-sm">
					Role-based access control, JWT authentication, and governance
					workflows — explained for stakeholders
				</p>
			</div>

			<nav className="mb-6 flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
				{NAV_ITEMS.map((item) => {
					const isActive =
						item.to === "/demo/rbac-auth"
							? currentPath === "/demo/rbac-auth" ||
								currentPath === "/demo/rbac-auth/"
							: currentPath.startsWith(item.to);

					return (
						<Link
							className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 font-medium text-sm transition-colors ${
								isActive
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
							key={item.to}
							to={item.to}
						>
							<item.icon className="size-4" />
							{item.label}
						</Link>
					);
				})}
			</nav>

			<Outlet />
		</div>
	);
}
