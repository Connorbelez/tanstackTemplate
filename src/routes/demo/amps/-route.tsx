import { Outlet, useMatches } from "@tanstack/react-router";
import { useAction } from "convex/react";
import {
	Activity,
	BookOpenText,
	ClockArrowUp,
	House,
	LoaderCircle,
	RefreshCcw,
	SatelliteDish,
	TestTube2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAmpsDemoAccess } from "#/components/demo/amps/hooks";
import {
	AuthGateNotice,
	buildCountBadgeItems,
	CountBadgeRow,
	LayerRail,
	SurfaceCard,
} from "#/components/demo/amps/ui";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { api } from "../../../../convex/_generated/api";

const NAV_ITEMS = [
	{
		to: "/demo/amps",
		label: "Command Deck",
		description: "Scenario framing, workspace readiness, and demo control.",
		icon: SatelliteDish,
	},
	{
		to: "/demo/amps/rules",
		label: "Rules",
		description: "Typed rule contracts, scope, and governance.",
		icon: BookOpenText,
	},
	{
		to: "/demo/amps/collection-plan",
		label: "Collection Plan",
		description: "Strategy entries, lineage, and balance gates.",
		icon: ClockArrowUp,
	},
	{
		to: "/demo/amps/collection-attempts",
		label: "Collection Attempts",
		description: "Execution history, transfers, and reconciliation.",
		icon: Activity,
	},
	{
		to: "/demo/amps/e2e-payments",
		label: "E2E Harness",
		description:
			"Disposable offline payment lifecycle for Playwright scaffolding.",
		icon: TestTube2,
	},
] as const;

export function AmpsDemoLayout() {
	const matches = useMatches();
	const currentPath = matches.at(-1)?.fullPath ?? "";
	const prepareWorkspace = useAction(api.demo.amps.prepareWorkspace);
	const { auth, canAccess, workspaceOverview } = useAmpsDemoAccess();
	const [isPreparing, setIsPreparing] = useState(false);

	async function handlePrepareWorkspace() {
		setIsPreparing(true);
		try {
			const result = await prepareWorkspace({});
			toast.success(
				`Prepared ${result.workspaceStats.readyScenarioCount} scenario-ready stories across ${result.workspaceStats.mortgageCount} demo mortgages.`
			);
			window.location.reload();
			return;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setIsPreparing(false);
		}
	}

	if (auth.loading) {
		return (
			<div className="mx-auto max-w-7xl px-4 py-8">
				<SurfaceCard
					description="Checking admin access and AMPS demo readiness."
					title="Loading AMPS demo workspace"
				>
					<div className="flex items-center gap-3 text-white/72">
						<LoaderCircle className="size-4 animate-spin" />
						<span>Resolving viewer context and collection state…</span>
					</div>
				</SurfaceCard>
			</div>
		);
	}

	if (!canAccess) {
		return (
			<div className="mx-auto max-w-7xl px-4 py-8">
				<AuthGateNotice />
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl px-4 py-8">
			<div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.18),transparent_26%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_22%),linear-gradient(135deg,#020617_0%,#0f172a_45%,#111827_100%)] p-6 text-white shadow-[0_30px_120px_rgba(2,6,23,0.48)] md:p-8">
				<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
				<div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
					<div className="max-w-4xl space-y-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge
								className="border-teal-400/30 bg-teal-400/12 text-teal-50"
								variant="outline"
							>
								AMPS demo
							</Badge>
							<Badge
								className="border-white/10 bg-white/8 text-white/72"
								variant="outline"
							>
								/demo isolation
							</Badge>
							<Badge
								className="border-white/10 bg-white/8 text-white/72"
								variant="outline"
							>
								real backend contracts
							</Badge>
						</div>
						<div className="space-y-3">
							<h1 className="max-w-3xl font-['Iowan_Old_Style',Georgia,serif] text-4xl tracking-tight md:text-5xl">
								Active Mortgage Payment System
							</h1>
							<p className="max-w-3xl text-slate-300 text-sm leading-7 md:text-base">
								A demo-grade operations workspace that keeps obligation truth,
								collection strategy, and execution history visibly separate
								while exercising the shipped AMPS backend.
							</p>
						</div>
						<LayerRail />
					</div>

					<div className="w-full max-w-xl space-y-4">
						<div className="grid gap-3 md:grid-cols-2">
							<div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
								<p className="text-[11px] text-white/52 uppercase tracking-[0.24em]">
									Workspace stats
								</p>
								<div className="mt-3 space-y-2">
									<CountBadgeRow
										items={buildCountBadgeItems({
											mortgages:
												workspaceOverview?.workspaceStats.mortgageCount ?? 0,
											plan_entries:
												workspaceOverview?.workspaceStats.planEntryCount ?? 0,
											attempts:
												workspaceOverview?.workspaceStats.attemptCount ?? 0,
											scenarios_ready:
												workspaceOverview?.workspaceStats.readyScenarioCount ??
												0,
										})}
									/>
								</div>
							</div>
							<div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
								<p className="text-[11px] text-white/52 uppercase tracking-[0.24em]">
									Scenario coverage
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									{workspaceOverview?.scenarios.map((scenario) => (
										<Badge
											className={
												scenario.ready
													? "border-emerald-500/30 bg-emerald-500/10 text-emerald-50"
													: "border-amber-500/30 bg-amber-500/10 text-amber-50"
											}
											key={scenario.key}
											variant="outline"
										>
											{scenario.title}
										</Badge>
									))}
								</div>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-3">
							<Button
								className="rounded-full bg-white text-slate-950 hover:bg-white/90"
								disabled={isPreparing}
								onClick={handlePrepareWorkspace}
							>
								{isPreparing ? (
									<LoaderCircle className="size-4 animate-spin" />
								) : (
									<RefreshCcw className="size-4" />
								)}
								Prepare deterministic scenarios
							</Button>
							{workspaceOverview?.missingScenarioAddresses.length ? (
								<p className="text-amber-100/80 text-sm">
									Missing seeded addresses:{" "}
									{workspaceOverview.missingScenarioAddresses.join(", ")}
								</p>
							) : (
								<p className="text-sm text-white/64">
									Same backend contracts as page 12. No `/admin` routing
									required.
								</p>
							)}
						</div>
					</div>
				</div>
			</div>

			<nav className="mt-6 flex gap-2 overflow-x-auto rounded-[28px] border border-white/10 bg-slate-950/70 p-2 shadow-[0_20px_60px_rgba(2,6,23,0.24)]">
				{NAV_ITEMS.map((item) => {
					const isActive =
						item.to === "/demo/amps"
							? currentPath === "/demo/amps" || currentPath === "/demo/amps/"
							: currentPath.startsWith(item.to);

					return (
						<a
							className={
								isActive
									? "min-w-60 rounded-[20px] border border-white/10 bg-white px-4 py-3 text-slate-950 shadow-sm"
									: "min-w-60 rounded-[20px] border border-transparent bg-white/4 px-4 py-3 text-white/70 transition hover:border-white/10 hover:bg-white/7 hover:text-white"
							}
							href={item.to}
							key={item.to}
						>
							<div className="flex items-center gap-2 font-medium text-sm">
								<item.icon className="size-4" />
								{item.label}
							</div>
							<p className="mt-2 text-xs leading-5 opacity-80">
								{item.description}
							</p>
						</a>
					);
				})}
			</nav>

			<div className="mt-6">
				<Outlet />
			</div>

			{workspaceOverview?.mortgages.length ? (
				<div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/70 p-4 text-white shadow-[0_20px_60px_rgba(2,6,23,0.24)]">
					<div className="flex flex-wrap items-center gap-3">
						<Badge
							className="border-white/10 bg-white/7 text-white/72"
							variant="outline"
						>
							Mortgage shortcuts
						</Badge>
						{workspaceOverview.mortgages.map((mortgage) => (
							<a
								className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/80 transition hover:bg-white/12 hover:text-white"
								href={`/demo/amps/mortgages/${mortgage.mortgageId}/payments`}
								key={mortgage.mortgageId}
							>
								<House className="size-4" />
								{mortgage.propertyLabel}
							</a>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
