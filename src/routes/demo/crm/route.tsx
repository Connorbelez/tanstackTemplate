import {
	createFileRoute,
	Link,
	Outlet,
	useMatches,
} from "@tanstack/react-router";
import { Database, Link2, Radar, Server } from "lucide-react";
import { MetricsProvider } from "#/components/demo/crm/MetricsProvider";
import { ValidationMetrics } from "#/components/demo/crm/ValidationMetrics";
import { Badge } from "#/components/ui/badge";

export const Route = createFileRoute("/demo/crm")({
	ssr: false,
	component: CrmSandboxLayout,
});

const NAV_ITEMS = [
	{
		to: "/demo/crm",
		label: "Custom Objects",
		icon: Database,
		description: "Create schema and records against typed EAV storage.",
	},
	{
		to: "/demo/crm/system",
		label: "System Adapters",
		icon: Server,
		description: "Render native Convex tables through the same contract.",
	},
	{
		to: "/demo/crm/links",
		label: "Link Explorer",
		icon: Link2,
		description: "Validate polymorphic links across custom and native records.",
	},
] as const;

function CrmSandboxLayout() {
	const matches = useMatches();
	const currentPath = matches.at(-1)?.fullPath ?? "";

	return (
		<MetricsProvider>
			<div className="mx-auto max-w-7xl px-4 py-8">
				<div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-background via-background to-muted/40 p-6 shadow-sm">
					<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="max-w-3xl space-y-3">
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="outline">ENG-261</Badge>
								<Badge variant="secondary">
									<Radar className="size-3.5" />
									UnifiedRecord validation
								</Badge>
							</div>
							<div className="space-y-2">
								<h1 className="font-semibold text-3xl tracking-tight">
									EAV-CRM Integration Sandbox
								</h1>
								<p className="max-w-2xl text-muted-foreground text-sm leading-6">
									A vertical CRM demo that stress-tests object metadata, record
									CRUD, view rendering, system adapters, and polymorphic links
									before the admin shell depends on any of it.
								</p>
							</div>
						</div>

						<div className="grid gap-3 sm:grid-cols-3">
							<SignalCard
								label="Control Plane"
								value="Objects + fields + views"
							/>
							<SignalCard label="Data Plane" value="Records + typed values" />
							<SignalCard label="Adapters" value="Native and EAV parity" />
						</div>
					</div>
				</div>

				<nav className="mt-6 flex gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-muted/40 p-2">
					{NAV_ITEMS.map((item) => {
						const isActive =
							item.to === "/demo/crm"
								? currentPath === "/demo/crm" || currentPath === "/demo/crm/"
								: currentPath.startsWith(item.to);

						return (
							<Link
								className={`min-w-56 rounded-xl border px-4 py-3 transition-colors ${
									isActive
										? "border-border bg-background shadow-sm"
										: "border-transparent text-muted-foreground hover:border-border/60 hover:bg-background/60 hover:text-foreground"
								}`}
								key={item.to}
								to={item.to}
							>
								<div className="flex items-center gap-2 font-medium text-sm">
									<item.icon className="size-4" />
									{item.label}
								</div>
								<p className="mt-1 text-xs leading-5">{item.description}</p>
							</Link>
						);
					})}
				</nav>

				<div className="mt-6">
					<Outlet />
				</div>

				<ValidationMetrics />
			</div>
		</MetricsProvider>
	);
}

function SignalCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-border/70 bg-background/85 px-4 py-3 shadow-sm">
			<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
				{label}
			</p>
			<p className="mt-1 font-medium text-sm">{value}</p>
		</div>
	);
}
