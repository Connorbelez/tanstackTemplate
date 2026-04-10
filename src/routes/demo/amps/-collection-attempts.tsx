import { useQuery } from "convex/react";
import { ArrowUpRight, ShieldCheck, Waves } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

export function AmpsCollectionAttemptsPage() {
	const { workspaceOverview } = useAmpsDemoAccess();
	const [status, setStatus] = useState<string>("all");
	const [mortgageId, setMortgageId] = useState<string>("all");
	const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(
		null
	);

	const attempts = useQuery(
		api.payments.collectionPlan.admin.listCollectionAttempts,
		{
			limit: 100,
			mortgageId: mortgageId === "all" ? undefined : (mortgageId as never),
			status: status === "all" ? undefined : status,
		}
	);

	const selectedAttempt = useQuery(
		api.payments.collectionPlan.admin.getCollectionAttempt,
		selectedAttemptId ? { attemptId: selectedAttemptId as never } : "skip"
	);

	useEffect(() => {
		if (!attempts?.length) {
			setSelectedAttemptId(null);
			return;
		}
		if (
			selectedAttemptId &&
			attempts.some(
				(attempt) => attempt.collectionAttemptId === selectedAttemptId
			)
		) {
			return;
		}
		setSelectedAttemptId(attempts[0]?.collectionAttemptId ?? null);
	}, [attempts, selectedAttemptId]);

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

	const attemptCounts = useMemo(() => {
		const nextCounts: Record<string, number> = {};
		for (const attempt of attempts ?? []) {
			nextCounts[attempt.status] = (nextCounts[attempt.status] ?? 0) + 1;
			if (attempt.transfer?.status) {
				nextCounts[`transfer:${attempt.transfer.status}`] =
					(nextCounts[`transfer:${attempt.transfer.status}`] ?? 0) + 1;
			}
		}
		return nextCounts;
	}, [attempts]);

	return (
		<div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
			<SurfaceCard
				description="Collection attempts represent execution, not strategy. This surface exposes provider handoff, transfer status, and reconciliation health without blurring those concerns back into plan entries."
				title="Execution history surface"
			>
				<div className="flex flex-wrap items-center gap-3">
					<select
						aria-label="Attempt status filter"
						className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-sm text-white"
						onChange={(event) => setStatus(event.target.value)}
						value={status}
					>
						<option value="all">All attempt statuses</option>
						<option value="initiated">initiated</option>
						<option value="pending">pending</option>
						<option value="confirmed">confirmed</option>
						<option value="failed">failed</option>
						<option value="permanent_fail">permanent_fail</option>
						<option value="cancelled">cancelled</option>
						<option value="reversed">reversed</option>
					</select>
					<select
						aria-label="Attempt mortgage filter"
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
						<Waves className="size-4 text-teal-300" />
						<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
							Execution signals
						</p>
					</div>
					<div className="mt-3">
						<CountBadgeRow items={buildCountBadgeItems(attemptCounts)} />
					</div>
				</div>

				<div className="mt-5 space-y-4">
					{attempts === undefined ? (
						<p className="text-sm text-white/64">
							Loading collection attempts…
						</p>
					) : attempts.length === 0 ? (
						<EmptySurface
							description="No attempts matched the selected filter set."
							title="No execution rows"
						/>
					) : (
						attempts.map((attempt) => {
							const isSelected =
								selectedAttemptId === attempt.collectionAttemptId;
							const mortgageLabel =
								mortgageLabels.get(attempt.mortgageId) ?? attempt.mortgageId;

							return (
								<div
									className={
										isSelected
											? "w-full rounded-[28px] border border-teal-400/30 bg-teal-400/10 p-5 text-left"
											: "w-full rounded-[28px] border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/8"
									}
									key={attempt.collectionAttemptId}
									onClick={() =>
										setSelectedAttemptId(attempt.collectionAttemptId)
									}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											setSelectedAttemptId(attempt.collectionAttemptId);
										}
									}}
									role="button"
									tabIndex={0}
								>
									<div className="flex flex-wrap items-start justify-between gap-4">
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
												{attempt.reconciliation ? (
													<Badge
														className={
															attempt.reconciliation.isHealthy
																? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
																: "border-amber-500/30 bg-amber-500/10 text-amber-100"
														}
														variant="outline"
													>
														{attempt.reconciliation.isHealthy
															? "reconciled"
															: (attempt.reconciliation.reason ??
																"reconciliation")}
													</Badge>
												) : null}
											</div>
											<h3 className="mt-3 font-['Iowan_Old_Style',Georgia,serif] text-2xl text-white">
												{formatCurrency(attempt.amount)}
											</h3>
											<p className="mt-2 text-slate-300 text-sm">
												{mortgageLabel} · {attempt.method} ·{" "}
												{formatDateTime(attempt.initiatedAt)}
											</p>
										</div>
										{attempt.transfer ? (
											<div className="rounded-full border border-white/10 bg-white/7 px-3 py-2 text-white/72 text-xs">
												{attempt.transfer.providerCode ?? "provider"} ·{" "}
												{attempt.transfer.direction ?? "transfer"}
											</div>
										) : null}
									</div>

									<div className="mt-4 grid gap-2 text-sm text-white/72 md:grid-cols-2">
										<p>
											<span className="text-white/42">Trigger:</span>{" "}
											{attempt.triggerSource ?? "unknown"}
										</p>
										<p>
											<span className="text-white/42">Plan entry:</span>{" "}
											{attempt.planEntryId}
										</p>
										<p>
											<span className="text-white/42">Provider ref:</span>{" "}
											{attempt.transfer?.providerRef ?? "not assigned"}
										</p>
										<p>
											<span className="text-white/42">Failure:</span>{" "}
											{attempt.failureReason ?? "none"}
										</p>
									</div>
								</div>
							);
						})
					)}
				</div>
			</SurfaceCard>

			<SurfaceCard
				description="Attempt detail emphasizes provider and transfer ownership, plus whether the attempt-linked transfer lifecycle is reconciled cleanly back into AMPS."
				title="Execution detail rail"
			>
				{selectedAttempt === undefined ? (
					<p className="text-sm text-white/64">Loading attempt detail…</p>
				) : selectedAttempt === null ? (
					<EmptySurface
						description="Select an execution row to inspect transfer and journal context."
						title="No attempt selected"
					/>
				) : (
					<div className="space-y-5">
						<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
							<div className="flex flex-wrap items-center gap-2">
								<Badge
									className={statusBadgeClass(selectedAttempt.attempt.status)}
									variant="outline"
								>
									{selectedAttempt.attempt.status}
								</Badge>
								{selectedAttempt.attempt.reconciliation ? (
									<Badge
										className={
											selectedAttempt.attempt.reconciliation.isHealthy
												? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
												: "border-amber-500/30 bg-amber-500/10 text-amber-100"
										}
										variant="outline"
									>
										{selectedAttempt.attempt.reconciliation.isHealthy
											? "healthy reconciliation"
											: (selectedAttempt.attempt.reconciliation.reason ??
												"reconciliation drift")}
									</Badge>
								) : null}
							</div>
							<div className="mt-4 grid gap-3 text-slate-300 text-sm">
								<p>{formatCurrency(selectedAttempt.attempt.amount)}</p>
								<p>
									Initiated{" "}
									{formatDateTime(selectedAttempt.attempt.initiatedAt)}
								</p>
								<p>
									<span className="text-white/42">Execution note:</span>{" "}
									{selectedAttempt.attempt.executionReason ?? "none"}
								</p>
								<p>
									<span className="text-white/42">Idempotency:</span>{" "}
									{selectedAttempt.attempt.executionIdempotencyKey ?? "none"}
								</p>
							</div>
						</div>

						<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
							<div className="flex items-center gap-2">
								<ShieldCheck className="size-4 text-sky-300" />
								<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
									Transfer + reconciliation
								</p>
							</div>
							<div className="mt-4 space-y-3 text-slate-300 text-sm">
								<p>
									<span className="text-white/42">Transfer:</span>{" "}
									{selectedAttempt.attempt.transfer
										? `${selectedAttempt.attempt.transfer.transferId} · ${selectedAttempt.attempt.transfer.status}`
										: "no linked transfer"}
								</p>
								<p>
									<span className="text-white/42">Provider ref:</span>{" "}
									{selectedAttempt.attempt.transfer?.providerRef ??
										"not assigned"}
								</p>
								<p>
									<span className="text-white/42">Reconciliation reason:</span>{" "}
									{selectedAttempt.attempt.reconciliation?.reason ??
										"healthy / n/a"}
								</p>
							</div>
						</div>

						<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
							<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
								Linked strategy row
							</p>
							{selectedAttempt.planEntry ? (
								<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4">
									<div>
										<p className="text-slate-300 text-sm">
											Plan entry {selectedAttempt.planEntry.planEntryId}
										</p>
										<p className="mt-1 text-white/56 text-xs">
											{selectedAttempt.planEntry.source} ·{" "}
											{selectedAttempt.planEntry.status}
										</p>
									</div>
									<Button
										asChild
										className="rounded-full"
										size="sm"
										variant="outline"
									>
										<a href="/demo/amps/collection-plan">
											Open strategy surface
											<ArrowUpRight className="size-4" />
										</a>
									</Button>
								</div>
							) : (
								<p className="mt-4 text-sm text-white/56">
									The linked plan entry could not be loaded.
								</p>
							)}
						</div>

						<div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
							<p className="font-medium text-sm text-white/56 uppercase tracking-[0.22em]">
								Transition journal
							</p>
							<div className="mt-4 space-y-3">
								{selectedAttempt.transitionJournal.length === 0 ? (
									<p className="text-sm text-white/56">
										No journal rows recorded for this attempt.
									</p>
								) : (
									selectedAttempt.transitionJournal.map((entry) => (
										<div
											className="rounded-[20px] border border-white/10 bg-black/20 p-4"
											key={entry._id}
										>
											<p className="font-medium text-sm text-white">
												{entry.eventType}
											</p>
											<p className="mt-1 text-white/56 text-xs">
												{formatDateTime(entry.timestamp)} · {entry.outcome}
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
