import { ArrowRight, Compass, House, Layers3 } from "lucide-react";
import { useAmpsDemoAccess } from "#/components/demo/amps/hooks";
import {
	buildCountBadgeItems,
	CountBadgeRow,
	EmptySurface,
	ScenarioStoryCard,
	SurfaceCard,
} from "#/components/demo/amps/ui";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { AmpsExecutionModesPage } from "./-execution-modes";

export function AmpsOverviewPage() {
	const { workspaceOverview } = useAmpsDemoAccess();

	if (!workspaceOverview) {
		return (
			<SurfaceCard
				description="The workspace is ready to load as soon as the admin-scoped collection queries resolve."
				title="Loading overview"
			>
				<p className="text-sm text-white/64">Waiting for AMPS demo state…</p>
			</SurfaceCard>
		);
	}

	return (
		<div className="space-y-6">
			<SurfaceCard
				description="Use this command deck to walk stakeholders through healthy, overdue, retry, suppressed, review-required, and workout-backed AMPS stories without implying production admin navigation."
				title="Scenario command deck"
			>
				<div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
					<div className="grid gap-4">
						{workspaceOverview.scenarios.map((scenario) => (
							<ScenarioStoryCard key={scenario.key} scenario={scenario} />
						))}
					</div>

					<div className="space-y-4">
						<div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
							<div className="flex items-center gap-2">
								<Compass className="size-4 text-teal-300" />
								<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
									Walkthrough cues
								</p>
							</div>
							<div className="mt-4 space-y-3 text-slate-300 text-sm leading-6">
								<p>
									1. Start with a mortgage story and show the obligation,
									strategy, and execution separation.
								</p>
								<p>
									2. Jump to the rule, plan, or attempt surface to zoom into one
									layer of the same mortgage.
								</p>
								<p>
									3. Run one governed action and let the live backend contracts
									refresh the narrative.
								</p>
							</div>
						</div>

						<div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
							<div className="flex items-center gap-2">
								<Layers3 className="size-4 text-sky-300" />
								<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
									Ready signals
								</p>
							</div>
							<div className="mt-4">
								<CountBadgeRow
									items={buildCountBadgeItems({
										scenarios_ready:
											workspaceOverview.workspaceStats.readyScenarioCount,
										mortgages: workspaceOverview.workspaceStats.mortgageCount,
										plan_entries:
											workspaceOverview.workspaceStats.planEntryCount,
										attempts: workspaceOverview.workspaceStats.attemptCount,
									})}
								/>
							</div>
						</div>
					</div>
				</div>
			</SurfaceCard>

			<SurfaceCard
				description="Each seeded mortgage acts as a durable demo anchor. Open the payments workspace for the full narrative, or jump directly to the plan and attempt surfaces for a narrower review."
				title="Mortgage anchors"
			>
				{workspaceOverview.mortgages.length === 0 ? (
					<EmptySurface
						description="Run the workspace prep action from the AMPS header to seed the deterministic mortgage scenarios."
						title="No seeded mortgage anchors yet"
					/>
				) : (
					<div className="grid gap-4 lg:grid-cols-2">
						{workspaceOverview.mortgages.map((mortgage) => (
							<div
								className="rounded-[28px] border border-white/10 bg-white/5 p-5"
								key={mortgage.mortgageId}
							>
								<div className="flex items-start justify-between gap-4">
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<Badge
												className="border-white/10 bg-white/8 text-white/72"
												variant="outline"
											>
												{mortgage.city}
											</Badge>
											<Badge
												className="border border-white/10 bg-white/8 text-white"
												variant="outline"
											>
												{mortgage.mortgageStatus}
											</Badge>
										</div>
										<h3 className="mt-3 font-['Iowan_Old_Style',Georgia,serif] text-2xl text-white">
											{mortgage.propertyLabel}
										</h3>
										<p className="mt-2 text-slate-300 text-sm">
											{mortgage.address}
										</p>
									</div>
									<div className="rounded-full border border-white/10 bg-white/7 p-3">
										<House className="size-5 text-teal-200" />
									</div>
								</div>

								<div className="mt-4 space-y-3">
									<div>
										<p className="text-[11px] text-white/44 uppercase tracking-[0.22em]">
											Obligation truth
										</p>
										<div className="mt-2">
											<CountBadgeRow
												items={buildCountBadgeItems(
													mortgage.obligationStatusCounts
												)}
											/>
										</div>
									</div>
									<div>
										<p className="text-[11px] text-white/44 uppercase tracking-[0.22em]">
											Strategy + execution
										</p>
										<div className="mt-2 grid gap-2">
											<CountBadgeRow
												items={buildCountBadgeItems(
													mortgage.planEntryStatusCounts
												)}
											/>
											<CountBadgeRow
												items={buildCountBadgeItems(
													mortgage.attemptStatusCounts
												)}
											/>
										</div>
									</div>
									<div className="flex flex-wrap gap-2">
										{mortgage.scenarioKeys.map((scenarioKey) => (
											<Badge
												className="border-white/10 bg-black/20 text-white/72"
												key={scenarioKey}
												variant="outline"
											>
												{scenarioKey.replaceAll("_", " ")}
											</Badge>
										))}
									</div>
								</div>

								<div className="mt-5 flex flex-wrap items-center gap-3">
									<Button
										asChild
										className="rounded-full bg-white text-slate-950 hover:bg-white/90"
										size="sm"
									>
										<a
											href={`/demo/amps/mortgages/${mortgage.mortgageId}/payments`}
										>
											Open mortgage workspace
											<ArrowRight className="size-4" />
										</a>
									</Button>
									<Button
										asChild
										className="rounded-full"
										size="sm"
										variant="outline"
									>
										<a href="/demo/amps/collection-plan">Strategy queue</a>
									</Button>
									<Button
										asChild
										className="rounded-full"
										size="sm"
										variant="outline"
									>
										<a href="/demo/amps/collection-attempts">Attempt queue</a>
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</SurfaceCard>

			<section id="execution-modes">
				<AmpsExecutionModesPage />
			</section>
		</div>
	);
}
