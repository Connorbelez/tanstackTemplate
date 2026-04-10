import { useQuery } from "convex/react";
import { ArrowUpRight, GitBranch, Radar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	ExecutePlanEntryDialog,
	ReschedulePlanEntryDialog,
} from "#/components/demo/amps/dialogs";
import { useAmpsDemoAccess } from "#/components/demo/amps/hooks";
import {
	buildCountBadgeItems,
	CountBadgeRow,
	EmptySurface,
	formatCurrency,
	formatDateTime,
	SurfaceCard,
	statusBadgeClass,
} from "#/components/demo/amps/ui";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { api } from "../../../../convex/_generated/api";

export function AmpsCollectionPlanPage() {
	const { workspaceOverview } = useAmpsDemoAccess();
	const [status, setStatus] = useState<string>("all");
	const [source, setSource] = useState<string>("all");
	const [mortgageId, setMortgageId] = useState<string>("all");
	const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

	const entries = useQuery(
		api.payments.collectionPlan.admin.listCollectionPlanEntries,
		{
			includeSuperseded: true,
			limit: 100,
			mortgageId: mortgageId === "all" ? undefined : (mortgageId as never),
			source: source === "all" ? undefined : (source as never),
			status: status === "all" ? undefined : (status as never),
		}
	);

	const selectedEntry = useQuery(
		api.payments.collectionPlan.admin.getCollectionPlanEntry,
		selectedEntryId ? { planEntryId: selectedEntryId as never } : "skip"
	);

	useEffect(() => {
		if (!entries?.length) {
			setSelectedEntryId(null);
			return;
		}
		if (
			selectedEntryId &&
			entries.some((entry) => entry.planEntryId === selectedEntryId)
		) {
			return;
		}
		setSelectedEntryId(entries[0]?.planEntryId ?? null);
	}, [entries, selectedEntryId]);

	const mortgageLabels = useMemo(
		() =>
			new Map(
				(workspaceOverview?.mortgages ?? []).map((mortgage) => [
					mortgage.mortgageId,
					mortgage.propertyLabel,
				])
			),
		[workspaceOverview?.mortgages]
	);

	const statusCounts = useMemo(() => {
		const nextCounts: Record<string, number> = {};
		for (const entry of entries ?? []) {
			nextCounts[entry.status] = (nextCounts[entry.status] ?? 0) + 1;
			if (entry.balancePreCheck.decision) {
				nextCounts[entry.balancePreCheck.decision] =
					(nextCounts[entry.balancePreCheck.decision] ?? 0) + 1;
			}
		}
		return nextCounts;
	}, [entries]);

	return (
		<div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
			<SurfaceCard
				description="Collection plan entries are strategy artifacts. This surface highlights lineage, balance gating, workout ownership, and the moments where strategy becomes eligible for execution."
				title="Collection strategy queue"
			>
				<div className="flex flex-wrap items-center gap-3">
					<select
						aria-label="Plan entry status filter"
						className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white"
						onChange={(event) => setStatus(event.target.value)}
						value={status}
					>
						<option value="all">All statuses</option>
						<option value="planned">planned</option>
						<option value="executing">executing</option>
						<option value="completed">completed</option>
						<option value="cancelled">cancelled</option>
						<option value="rescheduled">rescheduled</option>
					</select>
					<select
						aria-label="Plan entry source filter"
						className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white"
						onChange={(event) => setSource(event.target.value)}
						value={source}
					>
						<option value="all">All sources</option>
						<option value="default_schedule">default_schedule</option>
						<option value="retry_rule">retry_rule</option>
						<option value="late_fee_rule">late_fee_rule</option>
						<option value="admin">admin</option>
						<option value="admin_reschedule">admin_reschedule</option>
						<option value="admin_workout">admin_workout</option>
					</select>
					<select
						aria-label="Plan entry mortgage filter"
						className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white"
						onChange={(event) => setMortgageId(event.target.value)}
						value={mortgageId}
					>
						<option value="all">All mortgages</option>
						{workspaceOverview?.mortgages.map((mortgage) => (
							<option key={mortgage.mortgageId} value={mortgage.mortgageId}>
								{mortgage.propertyLabel}
							</option>
						))}
					</select>
				</div>

				<div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
					<div className="flex items-center gap-2">
						<Radar className="size-4 text-teal-300" />
						<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
							Strategy signals
						</p>
					</div>
					<div className="mt-3">
						<CountBadgeRow items={buildCountBadgeItems(statusCounts)} />
					</div>
				</div>

				<div className="mt-5 space-y-4">
					{entries === undefined ? (
						<p className="text-sm text-white/64">Loading strategy queue…</p>
					) : entries.length === 0 ? (
						<EmptySurface
							description="No plan entries matched the selected filter set."
							title="No strategy rows"
						/>
					) : (
						entries.map((entry) => {
							const isSelected = selectedEntryId === entry.planEntryId;
							const mortgageLabel =
								mortgageLabels.get(entry.mortgageId) ?? entry.mortgageId;
							return (
								<div
									className={
										isSelected
											? "w-full rounded-[28px] border border-teal-400/30 bg-teal-400/10 p-5 text-left"
											: "w-full rounded-[28px] border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/8"
									}
									key={entry.planEntryId}
									onClick={() => setSelectedEntryId(entry.planEntryId)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											setSelectedEntryId(entry.planEntryId);
										}
									}}
									role="button"
									tabIndex={0}
								>
									<div className="flex flex-wrap items-start justify-between gap-4">
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
											<h3 className="mt-3 font-['Iowan_Old_Style',Georgia,serif] text-2xl text-white">
												{formatCurrency(entry.amount)}
											</h3>
											<p className="mt-2 text-slate-300 text-sm">
												{mortgageLabel} · scheduled{" "}
												{formatDateTime(entry.scheduledDate)}
											</p>
										</div>
										<div className="flex flex-wrap gap-2">
											{entry.status === "planned" ? (
												<ExecutePlanEntryDialog
													planEntryId={entry.planEntryId}
													triggerLabel="Execute"
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

									<div className="mt-4 grid gap-2 text-sm text-white/72 md:grid-cols-2">
										<p>
											<span className="text-white/42">Method:</span>{" "}
											{entry.method}
										</p>
										<p>
											<span className="text-white/42">Obligations:</span>{" "}
											{entry.obligationIds.length}
										</p>
										<p>
											<span className="text-white/42">Created by rule:</span>{" "}
											{entry.createdByRule?.displayName ?? "manual / demo"}
										</p>
										<p>
											<span className="text-white/42">Workout:</span>{" "}
											{entry.lineage.workoutPlanId
												? `owned by ${entry.lineage.workoutPlanId}`
												: entry.lineage.supersededByWorkoutPlanId
													? `superseded by ${entry.lineage.supersededByWorkoutPlanId}`
													: "not workout-linked"}
										</p>
									</div>
								</div>
							);
						})
					)}
				</div>
			</SurfaceCard>

			<SurfaceCard
				description="The detail rail keeps lineage and balance gating explicit so strategy operations never get confused with attempt or transfer state."
				title="Strategy detail rail"
			>
				{selectedEntry === undefined ? (
					<p className="text-sm text-white/64">
						Loading selected strategy row…
					</p>
				) : selectedEntry === null ? (
					<EmptySurface
						description="Select a strategy row to inspect lineage, audit events, and related execution context."
						title="No plan entry selected"
					/>
				) : (
					<div className="space-y-5">
						<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
							<div className="flex flex-wrap items-center gap-2">
								<Badge
									className={statusBadgeClass(selectedEntry.planEntry.status)}
									variant="outline"
								>
									{selectedEntry.planEntry.status}
								</Badge>
								<Badge
									className="border-white/10 bg-black/20 text-white/72"
									variant="outline"
								>
									{selectedEntry.planEntry.source}
								</Badge>
								{selectedEntry.planEntry.balancePreCheck.decision ? (
									<Badge
										className={statusBadgeClass(
											selectedEntry.planEntry.balancePreCheck.decision
										)}
										variant="outline"
									>
										{selectedEntry.planEntry.balancePreCheck.decision}
									</Badge>
								) : null}
							</div>
							<div className="mt-4 grid gap-3 text-slate-300 text-sm">
								<p>
									Scheduled{" "}
									{formatDateTime(selectedEntry.planEntry.scheduledDate)}
								</p>
								<p>
									{formatCurrency(selectedEntry.planEntry.amount)} ·{" "}
									{selectedEntry.planEntry.obligationIds.length} linked
									obligation
									{selectedEntry.planEntry.obligationIds.length === 1
										? ""
										: "s"}
								</p>
								{selectedEntry.planEntry.balancePreCheck.reasonDetail ? (
									<p>
										<span className="text-white/42">Balance gate:</span>{" "}
										{selectedEntry.planEntry.balancePreCheck.reasonDetail}
									</p>
								) : null}
							</div>
						</div>

						<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
							<div className="flex items-center gap-2">
								<GitBranch className="size-4 text-sky-300" />
								<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
									Lineage
								</p>
							</div>
							<div className="mt-4 space-y-3 text-slate-300 text-sm">
								<p>
									<span className="text-white/42">Retry of:</span>{" "}
									{selectedEntry.planEntry.lineage.retryOfId ??
										"not a retry row"}
								</p>
								<p>
									<span className="text-white/42">Rescheduled from:</span>{" "}
									{selectedEntry.planEntry.lineage.rescheduledFromId ??
										"original schedule row"}
								</p>
								<p>
									<span className="text-white/42">Workout ownership:</span>{" "}
									{selectedEntry.planEntry.lineage.workoutPlanId ??
										selectedEntry.planEntry.lineage.supersededByWorkoutPlanId ??
										"none"}
								</p>
								{selectedEntry.supersedingWorkoutPlan ? (
									<p>
										<span className="text-white/42">Superseding workout:</span>{" "}
										{selectedEntry.supersedingWorkoutPlan.name}
									</p>
								) : null}
							</div>
						</div>

						{selectedEntry.planEntry.relatedAttempt ? (
							<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
								<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
									Linked execution
								</p>
								<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
									<div>
										<p className="text-slate-300 text-sm">
											Attempt{" "}
											{
												selectedEntry.planEntry.relatedAttempt
													.collectionAttemptId
											}
										</p>
										<p className="mt-1 text-white/56 text-xs">
											Status {selectedEntry.planEntry.relatedAttempt.status}
										</p>
									</div>
									<Button
										asChild
										className="rounded-full"
										size="sm"
										variant="outline"
									>
										<a href="/demo/amps/collection-attempts">
											Open attempt surface
											<ArrowUpRight className="size-4" />
										</a>
									</Button>
								</div>
							</div>
						) : null}

						<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
							<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
								Child strategy rows
							</p>
							<div className="mt-4 space-y-3">
								{selectedEntry.retryChildren.length === 0 &&
								selectedEntry.rescheduleChildren.length === 0 ? (
									<p className="text-sm text-white/56">
										No retry or reschedule children yet.
									</p>
								) : (
									[
										...selectedEntry.retryChildren,
										...selectedEntry.rescheduleChildren,
									].map((entry) => (
										<div
											className="rounded-[20px] border border-white/10 bg-black/20 p-4"
											key={entry.planEntryId}
										>
											<div className="flex flex-wrap items-center gap-2">
												<Badge
													className={statusBadgeClass(entry.status)}
													variant="outline"
												>
													{entry.status}
												</Badge>
												<Badge
													className="border-white/10 bg-white/8 text-white/70"
													variant="outline"
												>
													{entry.source}
												</Badge>
											</div>
											<p className="mt-2 text-slate-300 text-sm">
												Scheduled {formatDateTime(entry.scheduledDate)}
											</p>
										</div>
									))
								)}
							</div>
						</div>
					</div>
				)}
			</SurfaceCard>
		</div>
	);
}
