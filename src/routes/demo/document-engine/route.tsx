import {
	createFileRoute,
	Link,
	Outlet,
	useMatches,
} from "@tanstack/react-router";
import {
	FileText,
	FolderOpen,
	LayoutDashboard,
	Library,
	Play,
	Variable,
} from "lucide-react";

export const Route = createFileRoute("/demo/document-engine")({
	ssr: false,
	component: DocumentEngineLayout,
});

const NAV_ITEMS = [
	{ to: "/demo/document-engine", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/demo/document-engine/library", label: "Library", icon: Library },
	{ to: "/demo/document-engine/variables", label: "Variables", icon: Variable },
	{
		to: "/demo/document-engine/templates",
		label: "Templates",
		icon: FileText,
	},
	{ to: "/demo/document-engine/groups", label: "Groups", icon: FolderOpen },
	{ to: "/demo/document-engine/generate", label: "Generate", icon: Play },
] as const;

function DocumentEngineLayout() {
	const matches = useMatches();
	const currentPath = matches.at(-1)?.fullPath ?? "";

	return (
		<div className="mx-auto max-w-7xl p-4 py-8">
			<div className="mb-6">
				<h1 className="font-bold text-2xl">Document Engine</h1>
				<p className="text-muted-foreground text-sm">
					Template authoring, variable interpolation, and document generation
				</p>
			</div>

			<nav className="mb-6 flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
				{NAV_ITEMS.map((item) => {
					const isActive =
						item.to === "/demo/document-engine"
							? currentPath === "/demo/document-engine" ||
								currentPath === "/demo/document-engine/"
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
