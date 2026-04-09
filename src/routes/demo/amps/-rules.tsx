import { useQuery } from "convex/react";
import { Gauge, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { RuleEditorDialog } from "#/components/demo/amps/dialogs";
import {
	useAmpsDemoAccess,
	useMortgageOptions,
	useSelectableSurface,
} from "#/components/demo/amps/hooks";
import {
	buildCountBadgeItems,
	CountBadgeRow,
	EmptySurface,
	formatDateTime,
	SurfaceCard,
	statusBadgeClass,
} from "#/components/demo/amps/ui";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { api } from "../../../../convex/_generated/api";
import type {
	CollectionRuleKind,
	CollectionRuleStatus,
} from "../../../../convex/payments/collectionPlan/ruleContract";

export function AmpsRulesPage() {
	const { workspaceOverview } = useAmpsDemoAccess();
	const [kind, setKind] = useState<CollectionRuleKind | "all">("all");
	const [status, setStatus] = useState<CollectionRuleStatus | "all">("all");
	const [mortgageId, setMortgageId] = useState<string>("all");

	const rules = useQuery(
		api.payments.collectionPlan.admin.listCollectionRules,
		{
			kind: kind === "all" ? undefined : kind,
			status: status === "all" ? undefined : status,
			mortgageId: mortgageId === "all" ? undefined : (mortgageId as never),
			limit: 100,
		}
	);

	const [selectedRuleId, setSelectedRuleId] = useSelectableSurface(
		rules?.map((rule) => rule.ruleId)
	);
	const selectedRule = useQuery(
		api.payments.collectionPlan.admin.getCollectionRule,
		selectedRuleId ? { ruleId: selectedRuleId as never } : "skip"
	);

	const mortgageOptions = useMortgageOptions(workspaceOverview?.mortgages);

	const kindCounts = useMemo(() => {
		const nextCounts: Record<string, number> = {};
		for (const rule of rules ?? []) {
			nextCounts[rule.kind] = (nextCounts[rule.kind] ?? 0) + 1;
		}
		return nextCounts;
	}, [rules]);

	return (
		<div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
			<SurfaceCard
				description="Typed rule contracts govern default scheduling, retries, late fees, balance pre-checks, and future policy seams. The demo keeps those contracts visible as first-class strategy infrastructure."
				title="Rule operations surface"
			>
				<div className="flex flex-wrap items-center gap-3">
					<RuleEditorDialog
						mode="create"
						mortgageOptions={mortgageOptions}
						triggerLabel="Create rule"
					/>
					<div className="flex flex-wrap gap-2">
						<select
							aria-label="Rule kind filter"
							className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white"
							onChange={(event) =>
								setKind(event.target.value as CollectionRuleKind | "all")
							}
							value={kind}
						>
							<option value="all">All kinds</option>
							<option value="schedule">schedule</option>
							<option value="retry">retry</option>
							<option value="late_fee">late_fee</option>
							<option value="balance_pre_check">balance_pre_check</option>
							<option value="reschedule_policy">reschedule_policy</option>
							<option value="workout_policy">workout_policy</option>
						</select>
						<select
							aria-label="Rule status filter"
							className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white"
							onChange={(event) =>
								setStatus(event.target.value as CollectionRuleStatus | "all")
							}
							value={status}
						>
							<option value="all">All statuses</option>
							<option value="active">active</option>
							<option value="draft">draft</option>
							<option value="disabled">disabled</option>
							<option value="archived">archived</option>
						</select>
						<select
							aria-label="Mortgage rule filter"
							className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white"
							onChange={(event) => setMortgageId(event.target.value)}
							value={mortgageId}
						>
							<option value="all">Global + all mortgages</option>
							{mortgageOptions.map((option) => (
								<option key={option.mortgageId} value={option.mortgageId}>
									{option.label}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
					<div className="flex items-center gap-2">
						<Gauge className="size-4 text-teal-300" />
						<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
							Rule mix
						</p>
					</div>
					<div className="mt-3">
						<CountBadgeRow items={buildCountBadgeItems(kindCounts)} />
					</div>
				</div>

				<div className="mt-5 space-y-4">
					{rules === undefined ? (
						<p className="text-sm text-white/64">Loading rule inventory…</p>
					) : rules.length === 0 ? (
						<EmptySurface
							description="No rules matched the current filter set."
							title="No rule rows"
						/>
					) : (
						rules.map((rule) => {
							const isSelected = selectedRuleId === rule.ruleId;
							return (
								<div
									className={
										isSelected
											? "w-full rounded-[28px] border border-teal-400/30 bg-teal-400/10 p-5 text-left"
											: "w-full rounded-[28px] border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/8"
									}
									key={rule.ruleId}
									onClick={() => setSelectedRuleId(rule.ruleId)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											setSelectedRuleId(rule.ruleId);
										}
									}}
									role="button"
									tabIndex={0}
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
												<Badge
													className="border-white/10 bg-black/20 text-white/72"
													variant="outline"
												>
													priority {rule.priority}
												</Badge>
											</div>
											<h3 className="mt-3 font-['Iowan_Old_Style',Georgia,serif] text-2xl text-white">
												{rule.displayName}
											</h3>
											<p className="mt-2 text-slate-300 text-sm">
												{rule.description}
											</p>
										</div>
										<Button className="rounded-full" size="sm" variant="ghost">
											<Sparkles className="size-4" />
											Inspect
										</Button>
									</div>

									<div className="mt-4 grid gap-2 text-sm text-white/72 md:grid-cols-2">
										<p>
											<span className="text-white/42">Scope:</span>{" "}
											{rule.scopeSummary}
										</p>
										<p>
											<span className="text-white/42">Config:</span>{" "}
											{rule.configSummary}
										</p>
										<p>
											<span className="text-white/42">Code:</span> {rule.code}
										</p>
										<p>
											<span className="text-white/42">Effective:</span>{" "}
											{rule.isCurrentlyEffective
												? "currently active"
												: "windowed"}
										</p>
									</div>
								</div>
							);
						})
					)}
				</div>
			</SurfaceCard>

			<SurfaceCard
				description="Rule detail is intentionally strategy-only. Related entries show where the rule wrote strategy, not mortgage lifecycle or cash-ledger side effects."
				title="Selected rule detail"
			>
				{selectedRule === undefined ? (
					<p className="text-sm text-white/64">Loading rule detail…</p>
				) : selectedRule === null ? (
					<EmptySurface
						description="Select a rule row to inspect related entries and audit history."
						title="No rule selected"
					/>
				) : (
					<div className="space-y-5">
						<div className="flex flex-wrap items-center gap-3">
							<Badge
								className={statusBadgeClass(selectedRule.rule.status)}
								variant="outline"
							>
								{selectedRule.rule.status}
							</Badge>
							<Badge
								className="border-white/10 bg-black/20 text-white/72"
								variant="outline"
							>
								{selectedRule.rule.scopeSummary}
							</Badge>
							<RuleEditorDialog
								initialRule={selectedRule.rule}
								mode="update"
								mortgageOptions={mortgageOptions}
								triggerLabel="Update rule"
							/>
						</div>

						<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
							<h3 className="font-['Iowan_Old_Style',Georgia,serif] text-2xl text-white">
								{selectedRule.rule.displayName}
							</h3>
							<div className="mt-3 grid gap-2 text-slate-300 text-sm">
								<p>{selectedRule.rule.description}</p>
								<p>
									<span className="text-white/42">Code:</span>{" "}
									{selectedRule.rule.code}
								</p>
								<p>
									<span className="text-white/42">Config:</span>{" "}
									{selectedRule.rule.configSummary}
								</p>
								<p>
									<span className="text-white/42">Created:</span>{" "}
									{formatDateTime(selectedRule.rule.createdAt)}
								</p>
								<p>
									<span className="text-white/42">Updated:</span>{" "}
									{formatDateTime(selectedRule.rule.updatedAt)}
								</p>
							</div>
						</div>

						<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
							<div className="flex items-center justify-between gap-4">
								<div>
									<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
										Related plan entries
									</p>
									<p className="mt-2 text-slate-300 text-sm">
										{selectedRule.relatedPlanEntryCount} strategy entries
										reference this rule.
									</p>
								</div>
								<Badge
									className="border-white/10 bg-black/20 text-white"
									variant="outline"
								>
									{selectedRule.relatedPlanEntryCount}
								</Badge>
							</div>
							<div className="mt-4 space-y-3">
								{selectedRule.relatedPlanEntries.length === 0 ? (
									<p className="text-sm text-white/56">
										No recent plan entries have been generated by this rule yet.
									</p>
								) : (
									selectedRule.relatedPlanEntries.map((entry) => (
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
											<p className="mt-3 text-slate-300 text-sm">
												Scheduled {formatDateTime(entry.scheduledDate)} ·
												strategy entry
											</p>
										</div>
									))
								)}
							</div>
						</div>

						<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
							<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
								Audit trail
							</p>
							<div className="mt-4 space-y-3">
								{selectedRule.auditEvents.length === 0 ? (
									<p className="text-sm text-white/56">
										No audit events recorded.
									</p>
								) : (
									selectedRule.auditEvents.map(
										(event: (typeof selectedRule.auditEvents)[number]) => (
											<div
												className="rounded-[20px] border border-white/10 bg-black/20 p-4"
												key={event._id}
											>
												<p className="font-medium text-sm text-white">
													{event.action}
												</p>
												<p className="mt-1 text-white/56 text-xs">
													{formatDateTime(event.createdAt)} · {event.actorId}
												</p>
											</div>
										)
									)
								)}
							</div>
						</div>
					</div>
				)}
			</SurfaceCard>
		</div>
	);
}
