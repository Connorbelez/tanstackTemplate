import {
	createFileRoute,
	Link,
	Outlet,
	useMatches,
} from "@tanstack/react-router";
import { Activity, Eye, Shield } from "lucide-react";

export const Route = createFileRoute("/demo/governed-transitions")({
	ssr: false,
	component: GovernedTransitionsLayout,
});

const NAV_ITEMS = [
	{
		to: "/demo/governed-transitions",
		label: "Command Center",
		icon: Shield,
	},
	{
		to: "/demo/governed-transitions/journal",
		label: "Journal",
		icon: Activity,
	},
	{
		to: "/demo/governed-transitions/machine",
		label: "Machine Inspector",
		icon: Eye,
	},
] as const;

function GovernedTransitionsLayout() {
	const matches = useMatches();
	const currentPath = matches.at(-1)?.fullPath ?? "";

	return (
		<div className="mx-auto max-w-7xl p-4 py-8">
			<div className="mb-6">
				<h1 className="font-bold text-2xl">Governed Transitions</h1>
				<p className="text-muted-foreground text-sm">
					State machine-driven lifecycle management with audit journal and
					effect scheduling
				</p>
			</div>

			<nav className="mb-6 flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
				{NAV_ITEMS.map((item) => {
					const isActive =
						item.to === "/demo/governed-transitions"
							? currentPath === "/demo/governed-transitions" ||
								currentPath === "/demo/governed-transitions/"
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
