import {
	createFileRoute,
	Link,
	Outlet,
	useMatches,
} from "@tanstack/react-router";
import {
	Activity,
	Eye,
	FileText,
	GitBranch,
	Link2,
	Shield,
} from "lucide-react";

export const Route = createFileRoute("/demo/audit-traceability")({
	ssr: false,
	component: AuditTraceabilityLayout,
});

const NAV_ITEMS = [
	{
		to: "/demo/audit-traceability",
		label: "Transfers",
		icon: Shield,
	},
	{
		to: "/demo/audit-traceability/hash-chain",
		label: "Hash Chain",
		icon: Link2,
	},
	{
		to: "/demo/audit-traceability/audit-trail",
		label: "Audit Trail",
		icon: GitBranch,
	},
	{
		to: "/demo/audit-traceability/pipeline",
		label: "Pipeline",
		icon: Activity,
	},
	{
		to: "/demo/audit-traceability/access-log",
		label: "Access Log",
		icon: Eye,
	},
	{
		to: "/demo/audit-traceability/report",
		label: "Report",
		icon: FileText,
	},
] as const;

function AuditTraceabilityLayout() {
	const matches = useMatches();
	const currentPath = matches.at(-1)?.fullPath ?? "";

	return (
		<div className="mx-auto max-w-7xl p-4 py-8">
			<div className="mb-6">
				<h1 className="font-bold text-2xl">Audit & Traceability</h1>
				<p className="text-muted-foreground text-sm">
					Compliance-grade audit logging, hash chain verification, and
					observability for mortgage ownership transfers
				</p>
			</div>

			<nav className="mb-6 flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
				{NAV_ITEMS.map((item) => {
					const isActive =
						item.to === "/demo/audit-traceability"
							? currentPath === "/demo/audit-traceability" ||
								currentPath === "/demo/audit-traceability/"
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
