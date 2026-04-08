import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
	ArrowUpRight,
	CalendarClock,
	ShieldCheck,
	Workflow,
} from "lucide-react";
import {
	CreateWorkoutPlanDialog,
	ExecutePlanEntryDialog,
	ReschedulePlanEntryDialog,
	RuleEditorDialog,
	WorkoutLifecycleDialog,
} from "#/components/demo/amps/dialogs";
import {
	buildCountBadgeItems,
	CountBadgeRow,
	EmptySurface,
	formatCurrency,
	formatDateOnly,
	formatDateTime,
	formatPercent,
	SurfaceCard,
	statusBadgeClass,
} from "#/components/demo/amps/ui";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const MORTGAGE_PAYMENTS_PATH_PATTERN =
	/^\/demo\/amps\/mortgages\/([^/]+)\/payments\/?$/;

export function MortgagePaymentsWorkspacePage() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const mortgageId = (pathname.match(MORTGAGE_PAYMENTS_PATH_PATTERN)?.[1] ??
		null) as Id<"mortgages"> | null;
	const mortgageWorkspace = useQuery(api.demo.amps.getMortgageWorkspace, {
		mortgageId: mortgageId as never,
	});
	const summary = useQuery(
		api.payments.collectionPlan.admin.getMortgageCollectionOperationsSummary,
		mortgageId
			? {
					mortgageId,
					recentAttemptLimit: 12,
					upcomingEntryLimit: 12,
				}
			: "skip"
	);

	if (!mortgageId) {
		return (
			<SurfaceCard
				description="The current demo route does not include a mortgage identifier."
				title="Missing mortgage"
			>
				<Button asChild className="rounded-full" variant="outline">
					<a href="/demo/amps">Return to command deck</a>
				</Button>
			</SurfaceCard>
		);
	}

	if (mortgageWorkspace === undefined || summary === undefined) {
		return (
			<SurfaceCard
				description="Loading mortgage-level AMPS narrative."
				title="Loading mortgage payments workspace"
			>
				<p className="text-sm text-white/64">Resolving mortgage summary…</p>
			</SurfaceCard>
		);
	}

	if (mortgageWorkspace === null || summary === null) {
		return (
			<SurfaceCard
				description="The selected mortgage could not be found in the demo workspace."
				title="Missing mortgage"
			>
				<Button asChild className="rounded-full" variant="outline">
					<a href="/demo/amps">Return to command deck</a>
				</Button>
			</SurfaceCard>
		);
	}

	const upcomingWorkoutObligations = mortgageWorkspace.obligations
		.filter((obligation) => obligation.status === "upcoming")
		.map((obligation) => ({
			amount: obligation.amount,
			dueDate: obligation.dueDate,
			obligationId: obligation.obligationId,
			paymentNumber: obligation.paymentNumber,
			status: obligation.status,
		}));

	return (
		<div className="space-y-6">
			<SurfaceCard
				description="This mortgage page is the AMPS story in one place: obligation truth, strategy, execution, and workout state remain visually distinct while sharing the same live backend."
				title={mortgageWorkspace.mortgage.label}
			>
				<div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
					<div className="space-y-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge
								className={statusBadgeClass(mortgageWorkspace.mortgage.status)}
								variant="outline"
							>
								{mortgageWorkspace.mortgage.status}
							</Badge>
							{mortgageWorkspace.scenarioKeys.map((scenarioKey) => (
								<Badge
									className="border-white/10 bg-black/20 text-white/72"
									key={scenarioKey}
									variant="outline"
								>
									{scenarioKey.replaceAll("_", " ")}
								</Badge>
							))}
						</div>
						<div className="grid gap-3 md:grid-cols-3">
							<MetricCard
								label="Principal"
								value={formatCurrency(mortgageWorkspace.mortgage.principal)}
							/>
							<MetricCard
								label="Payment"
								value={formatCurrency(mortgageWorkspace.mortgage.paymentAmount)}
							/>
							<MetricCard
								label="Rate"
								value={formatPercent(mortgageWorkspace.mortgage.interestRate)}
							/>
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							<MetricCard
								label="First payment"
								value={formatDateOnly(
									mortgageWorkspace.mortgage.firstPaymentDate
								)}
							/>
							<MetricCard
								label="Maturity"
								value={formatDateOnly(mortgageWorkspace.mortgage.maturityDate)}
							/>
						</div>
					</div>

					<div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
						<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
							Actions
						</p>
						<div className="mt-4 flex flex-wrap gap-3">
							{summary.activeWorkoutPlan ? (
								<>
									<WorkoutLifecycleDialog
										mode="complete"
										workoutPlanId={summary.activeWorkoutPlan.workoutPlanId}
									/>
									<WorkoutLifecycleDialog
										mode="cancel"
										workoutPlanId={summary.activeWorkoutPlan.workoutPlanId}
									/>
								</>
							) : (
								<CreateWorkoutPlanDialog
									mortgageId={mortgageId}
									obligations={upcomingWorkoutObligations}
								/>
							)}
							<Button
								asChild
								className="rounded-full"
								size="sm"
								variant="outline"
							>
								<a href="/demo/amps/rules">
									Open global rules
									<ArrowUpRight className="size-4" />
								</a>
							</Button>
						</div>

						<div className="mt-5 space-y-3 text-slate-300 text-sm">
							<p>
								<span className="text-white/42">Rule count:</span>{" "}
								{summary.ruleCount}
							</p>
							<p>
								<span className="text-white/42">Plan signals:</span>{" "}
								{Object.keys(summary.planEntryStats).length} tracked counters
							</p>
							<p>
								<span className="text-white/42">Attempt signals:</span>{" "}
								{Object.keys(summary.attemptStats).length} tracked counters
							</p>
						</div>
					</div>
				</div>
			</SurfaceCard>

			<div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
				<SurfaceCard
					description="Obligation truth is the canonical borrower-facing debt layer. Workout and strategy changes do not directly alter these rows."
					title="Obligation truth"
				>
					<div className="mb-4">
						<CountBadgeRow
							items={buildCountBadgeItems(
								mortgageWorkspace.obligations.reduce<Record<string, number>>(
									(counts, obligation) => {
										counts[obligation.status] =
											(counts[obligation.status] ?? 0) + 1;
										return counts;
									},
									{}
								)
							)}
						/>
					</div>
					<div className="space-y-3">
						{mortgageWorkspace.obligations.map((obligation) => (
							<div
								className="rounded-[24px] border border-white/10 bg-white/5 p-4"
								key={obligation.obligationId}
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<Badge
												className={statusBadgeClass(obligation.status)}
												variant="outline"
											>
												{obligation.status}
											</Badge>
											<Badge
												className="border-white/10 bg-black/20 text-white/72"
												variant="outline"
											>
												payment {obligation.paymentNumber}
											</Badge>
										</div>
										<p className="mt-3 font-['Iowan_Old_Style',Georgia,serif] text-2xl text-white">
											{formatCurrency(obligation.amount)}
										</p>
										<p className="mt-2 text-slate-300 text-sm">
											Due {formatDateTime(obligation.dueDate)}
										</p>
									</div>
									<div className="text-right text-slate-300 text-sm">
										<p>{obligation.type}</p>
										<p className="mt-1">
											Settled {formatCurrency(obligation.amountSettled)}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				</SurfaceCard>

				<div className="space-y-6">
					<SurfaceCard
						description="Applicable rules explain why the mortgage receives its current schedule, retry, and balance-precheck behavior."
						title="Strategy context"
					>
						<div className="space-y-4">
							{summary.applicableRules.length === 0 ? (
								<EmptySurface
									description="No applicable rules were returned for this mortgage."
									title="No applicable rules"
								/>
							) : (
								summary.applicableRules.map((rule) => (
									<div
										className="rounded-[24px] border border-white/10 bg-white/5 p-4"
										key={rule.ruleId}
									>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<div className="flex flex-wrap items-center gap-2">
													<Badge
														className={statusBadgeClass(rule.status)}
														variant="outline"
													>
														{rule.status}
													</Badge>
													<Badge
														className="border-white/10 bg-black/20 text-white/72"
														variant="outline"
													>
														{rule.kind}
													</Badge>
												</div>
												<h3 className="mt-3 font-medium text-lg text-white">
													{rule.displayName}
												</h3>
												<p className="mt-2 text-slate-300 text-sm">
													{rule.configSummary}
												</p>
											</div>
											<RuleEditorDialog
												initialRule={rule}
												mode="update"
												mortgageOptions={[
													{
														label: mortgageWorkspace.mortgage.label,
														mortgageId,
													},
												]}
												triggerLabel="Adjust"
											/>
										</div>
									</div>
								))
							)}
						</div>
					</SurfaceCard>

					<SurfaceCard
						description="Upcoming entries and workouts remain strategy-only. Manual execute and reschedule actions flow through the same canonical backend used everywhere else."
						title="Collection plan"
					>
						<div className="mb-4">
							<CountBadgeRow
								items={buildCountBadgeItems(summary.planEntryStats)}
							/>
						</div>
						<div className="space-y-4">
							{summary.upcomingEntries.length === 0 ? (
								<EmptySurface
									description="No upcoming strategy rows are queued for this mortgage."
									title="No upcoming plan entries"
								/>
							) : (
								summary.upcomingEntries.map((entry) => (
									<div
										className="rounded-[24px] border border-white/10 bg-white/5 p-4"
										key={entry.planEntryId}
									>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<div className="flex flex-wrap items-center gap-2">
													<Badge
														className={statusBadgeClass(entry.status)}
														variant="outline"
													>
														{entry.status}
													</Badge>
													<Badge
														className="border-white/10 bg-black/20 text-white/72"
														variant="outline"
													>
														{entry.source}
													</Badge>
													{entry.balancePreCheck.decision ? (
														<Badge
															className={statusBadgeClass(
																entry.balancePreCheck.decision
															)}
															variant="outline"
														>
															{entry.balancePreCheck.decision}
														</Badge>
													) : null}
												</div>
												<p className="mt-3 font-['Iowan_Old_Style',Georgia,serif] text-2xl text-white">
													{formatCurrency(entry.amount)}
												</p>
												<p className="mt-2 text-slate-300 text-sm">
													Scheduled {formatDateTime(entry.scheduledDate)}
												</p>
											</div>
											<div className="flex flex-wrap gap-2">
												{entry.status === "planned" ? (
													<ExecutePlanEntryDialog
														planEntryId={entry.planEntryId}
													/>
												) : null}
												{entry.status === "planned" ? (
													<ReschedulePlanEntryDialog
														planEntryId={entry.planEntryId}
														scheduledDate={entry.scheduledDate}
													/>
												) : null}
											</div>
										</div>
									</div>
								))
							)}
						</div>
					</SurfaceCard>

					<SurfaceCard
						description="Execution history stays attempt-owned. Transfers and reconciliation are visible here without rewriting the mortgage or obligation story."
						title="Execution history"
					>
						<div className="mb-4">
							<CountBadgeRow
								items={buildCountBadgeItems(summary.attemptStats)}
							/>
						</div>
						<div className="space-y-4">
							{summary.recentAttempts.length === 0 ? (
								<EmptySurface
									description="No attempts have been recorded for this mortgage yet."
									title="No attempts yet"
								/>
							) : (
								summary.recentAttempts.map((attempt) => (
									<div
										className="rounded-[24px] border border-white/10 bg-white/5 p-4"
										key={attempt.collectionAttemptId}
									>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<div className="flex flex-wrap items-center gap-2">
													<Badge
														className={statusBadgeClass(attempt.status)}
														variant="outline"
													>
														{attempt.status}
													</Badge>
													{attempt.transfer?.status ? (
														<Badge
															className={statusBadgeClass(
																attempt.transfer.status
															)}
															variant="outline"
														>
															transfer {attempt.transfer.status}
														</Badge>
													) : null}
												</div>
												<p className="mt-3 font-['Iowan_Old_Style',Georgia,serif] text-2xl text-white">
													{formatCurrency(attempt.amount)}
												</p>
												<p className="mt-2 text-slate-300 text-sm">
													Initiated {formatDateTime(attempt.initiatedAt)}
												</p>
											</div>
											<Button
												asChild
												className="rounded-full"
												size="sm"
												variant="outline"
											>
												<a href="/demo/amps/collection-attempts">
													Open attempt queue
													<ArrowUpRight className="size-4" />
												</a>
											</Button>
										</div>
									</div>
								))
							)}
						</div>
					</SurfaceCard>
				</div>
			</div>

			<div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
				<SurfaceCard
					description="Workouts modify collection strategy. Exiting them restores default scheduling without mutating obligation truth or ledger ownership."
					title="Workout lifecycle"
				>
					<div className="space-y-4">
						{summary.activeWorkoutPlan ? (
							<div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/8 p-5">
								<div className="flex flex-wrap items-center gap-2">
									<Badge
										className="border-emerald-500/30 bg-emerald-500/10 text-emerald-50"
										variant="outline"
									>
										active workout
									</Badge>
									<Badge
										className="border-white/10 bg-black/20 text-white/72"
										variant="outline"
									>
										{summary.activeWorkoutPlan.name}
									</Badge>
								</div>
								<p className="mt-3 text-slate-300 text-sm">
									Activated{" "}
									{formatDateTime(summary.activeWorkoutPlan.activatedAt)}
								</p>
							</div>
						) : (
							<EmptySurface
								description="This mortgage does not currently have an active workout."
								title="No active workout"
							/>
						)}

						{summary.draftWorkoutPlans.length ? (
							<div className="space-y-3">
								<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
									Draft workouts
								</p>
								{summary.draftWorkoutPlans.map((workoutPlan) => (
									<div
										className="rounded-[24px] border border-white/10 bg-white/5 p-4"
										key={workoutPlan.workoutPlanId}
									>
										<div className="flex flex-wrap items-center justify-between gap-3">
											<div>
												<p className="font-medium text-white">
													{workoutPlan.name}
												</p>
												<p className="mt-1 text-slate-300 text-sm">
													Updated {formatDateTime(workoutPlan.updatedAt)}
												</p>
											</div>
											<WorkoutLifecycleDialog
												mode="activate"
												workoutPlanId={workoutPlan.workoutPlanId}
											/>
										</div>
									</div>
								))}
							</div>
						) : null}

						{summary.historicalWorkoutPlans.length ? (
							<div className="space-y-3">
								<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
									Historical workouts
								</p>
								{summary.historicalWorkoutPlans.map((workoutPlan) => (
									<div
										className="rounded-[24px] border border-white/10 bg-white/5 p-4"
										key={workoutPlan.workoutPlanId}
									>
										<div className="flex flex-wrap items-center gap-2">
											<Badge
												className={statusBadgeClass(workoutPlan.status)}
												variant="outline"
											>
												{workoutPlan.status}
											</Badge>
											<Badge
												className="border-white/10 bg-black/20 text-white/72"
												variant="outline"
											>
												{workoutPlan.name}
											</Badge>
										</div>
										<p className="mt-2 text-slate-300 text-sm">
											Updated {formatDateTime(workoutPlan.updatedAt)}
										</p>
									</div>
								))}
							</div>
						) : null}
					</div>
				</SurfaceCard>

				<SurfaceCard
					description="Use this page as the storytelling surface, then jump sideways into the dedicated rules, plan, or attempt views for deeper operational inspection."
					title="Cross-links"
				>
					<div className="grid gap-4 md:grid-cols-3">
						<JumpCard
							description="Inspect typed rule state and adjust scope or config."
							href="/demo/amps/rules"
							icon={Workflow}
							title="Rules"
						/>
						<JumpCard
							description="Review strategy lineage, balance gates, and manual reschedules."
							href="/demo/amps/collection-plan"
							icon={CalendarClock}
							title="Collection plan"
						/>
						<JumpCard
							description="Inspect transfer-linked attempts, provider state, and reconciliation."
							href="/demo/amps/collection-attempts"
							icon={ShieldCheck}
							title="Collection attempts"
						/>
					</div>
				</SurfaceCard>
			</div>
		</div>
	);
}

function MetricCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
			<p className="text-[11px] text-white/44 uppercase tracking-[0.22em]">
				{label}
			</p>
			<p className="mt-2 font-medium text-lg text-white">{value}</p>
		</div>
	);
}

function JumpCard({
	description,
	icon: Icon,
	title,
	href,
}: {
	description: string;
	icon: typeof Workflow;
	href:
		| "/demo/amps/rules"
		| "/demo/amps/collection-plan"
		| "/demo/amps/collection-attempts";
	title: string;
}) {
	return (
		<a
			className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-white transition hover:bg-white/8"
			href={href}
		>
			<div className="flex items-center gap-2">
				<Icon className="size-4 text-teal-300" />
				<p className="font-medium">{title}</p>
			</div>
			<p className="mt-3 text-slate-300 text-sm leading-6">{description}</p>
			<div className="mt-4 inline-flex items-center gap-2 text-sm text-white/72">
				Open surface
				<ArrowUpRight className="size-4" />
			</div>
		</a>
	);
}
