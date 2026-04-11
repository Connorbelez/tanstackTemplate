import { useAction, useQuery } from "convex/react";
import {
	ArrowRight,
	CalendarClock,
	CheckCircle2,
	ChevronsRight,
	CircleDot,
	LoaderCircle,
	RadioTower,
	ShieldCheck,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { cn } from "#/lib/utils";
import { api } from "../../../../convex/_generated/api";

type DemoExecutionMode = "app_owned" | "provider_managed";
type DemoPaymentRail = "manual" | "manual_review" | "pad_rotessa";
type DemoProviderChannel = "webhook" | "poller";
type DemoProviderOutcome = "Approved" | "Declined";

const EXECUTION_MODE_OPTIONS: Array<{
	value: DemoExecutionMode;
	label: string;
	description: string;
}> = [
	{
		value: "provider_managed",
		label: "Provider-managed",
		description:
			"Create one recurring Rotessa schedule and mirror provider lifecycle.",
	},
	{
		value: "app_owned",
		label: "Application-managed",
		description:
			"Keep plan execution inside FairLend's scheduler and operator tools.",
	},
];

const APP_OWNED_RAILS: Array<{
	value: Extract<DemoPaymentRail, "manual" | "manual_review">;
	label: string;
	description: string;
}> = [
	{
		value: "manual",
		label: "manual",
		description: "Inbound receipts settle immediately at execution time.",
	},
	{
		value: "manual_review",
		label: "manual_review",
		description:
			"Inbound receipts stay pending until an operator confirms them.",
	},
];

const PROVIDER_CHANNEL_OPTIONS: Array<{
	value: DemoProviderChannel;
	label: string;
	description: string;
}> = [
	{
		value: "webhook",
		label: "Webhook",
		description:
			"Use the provider-webhook ingress semantics for the monthly update.",
	},
	{
		value: "poller",
		label: "Poller",
		description:
			"Use the scheduled polling fallback semantics for the monthly update.",
	},
];

const PROVIDER_OUTCOME_OPTIONS: Array<{
	value: DemoProviderOutcome;
	label: string;
	description: string;
}> = [
	{
		value: "Approved",
		label: "Approved",
		description: "Advance the current Rotessa occurrence to settled funds.",
	},
	{
		value: "Declined",
		label: "Declined (NSF)",
		description:
			"Advance the current Rotessa occurrence to an NSF-style decline.",
	},
];

function providerLifecycleBadgeClass(status?: string | null) {
	switch (status) {
		case "Future":
			return "border-slate-400/30 bg-slate-400/10 text-slate-100";
		case "Pending":
			return "border-sky-500/30 bg-sky-500/10 text-sky-100";
		case "Approved":
			return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
		case "Declined":
			return "border-rose-500/30 bg-rose-500/10 text-rose-100";
		case "Chargeback":
			return "border-amber-500/30 bg-amber-500/10 text-amber-100";
		default:
			return "border-white/10 bg-white/8 text-white/70";
	}
}

function railOptionsForMode(mode: DemoExecutionMode) {
	return mode === "provider_managed"
		? [
				{
					value: "pad_rotessa" as const,
					label: "pad_rotessa",
					description:
						"Recurring provider schedule owned by Rotessa with webhook or poller updates.",
				},
			]
		: APP_OWNED_RAILS;
}

function selectorButtonClass(active: boolean) {
	return active
		? "border-white/20 bg-white text-slate-950 shadow-sm"
		: "border-white/10 bg-white/6 text-white/78 hover:bg-white/10";
}

function LoadingSurface(args: { description: string; title: string }) {
	return (
		<div className="mt-4 rounded-[22px] border border-white/10 bg-black/20 p-5">
			<div className="flex items-center gap-3 text-white">
				<LoaderCircle className="size-4 animate-spin" />
				<div>
					<p className="font-medium text-sm">{args.title}</p>
					<p className="mt-1 text-sm text-white/60">{args.description}</p>
				</div>
			</div>
		</div>
	);
}

export function AmpsExecutionModesPage() {
	const workspace = useQuery(
		api.demo.ampsExecutionModes.getCollectionExecutionWorkspace,
		{}
	);
	const seedWorkspace = useAction(
		api.demo.ampsExecutionModes.seedCollectionExecutionWorkspace
	);
	const advanceMonth = useAction(
		api.demo.ampsExecutionModes.advanceCollectionExecutionMonth
	);
	const confirmPendingManualReview = useAction(
		api.demo.ampsExecutionModes.confirmPendingManualReviewTransfer
	);

	const [executionMode, setExecutionMode] =
		useState<DemoExecutionMode>("provider_managed");
	const [paymentRail, setPaymentRail] =
		useState<DemoPaymentRail>("pad_rotessa");
	const [providerChannel, setProviderChannel] =
		useState<DemoProviderChannel>("webhook");
	const [providerOutcome, setProviderOutcome] =
		useState<DemoProviderOutcome>("Approved");
	const [pendingAction, setPendingAction] = useState<
		"seed" | "advance" | "confirm" | null
	>(null);

	useEffect(() => {
		if (executionMode === "provider_managed") {
			setPaymentRail("pad_rotessa");
			return;
		}
		if (paymentRail === "pad_rotessa") {
			setPaymentRail("manual");
		}
	}, [executionMode, paymentRail]);

	const currentRailOptions = useMemo(
		() => railOptionsForMode(executionMode),
		[executionMode]
	);
	const isWorkspaceLoading = workspace === undefined;
	const workspaceExecutionMode = workspace?.workspace.executionMode;
	const nextInstallment = workspace?.nextInstallment;
	const canAdvance =
		Boolean(workspace?.installments.length) &&
		(workspace?.workspace.currentMonthIndex ?? 0) <
			(workspace?.installments.length ?? 0) &&
		pendingAction === null;
	const canConfirmManualReview =
		Boolean(workspace?.pendingManualTransfer) && pendingAction === null;

	async function runAction<T>(
		action: "seed" | "advance" | "confirm",
		promise: Promise<T>,
		successMessage: string
	) {
		setPendingAction(action);
		try {
			await promise;
			toast.success(successMessage);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setPendingAction(null);
		}
	}

	return (
		<div className="space-y-6">
			<SurfaceCard
				description="Seed one mortgage into either app-owned or provider-managed collection, then advance the monthly servicing cycle through the same obligation, plan-entry, attempt, transfer, and ledger layers the production backend uses."
				title="Collection Execution Modes"
			>
				<div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
					<div className="space-y-5">
						<div className="flex flex-wrap items-center gap-2">
							<Badge
								className="border-teal-400/30 bg-teal-400/12 text-teal-50"
								variant="outline"
							>
								Execution ownership
							</Badge>
							<Badge
								className="border-white/10 bg-white/8 text-white/72"
								variant="outline"
							>
								12-month mortgage cycle
							</Badge>
							<Badge
								className="border-white/10 bg-white/8 text-white/72"
								variant="outline"
							>
								operator-grade demo
							</Badge>
						</div>

						<div className="grid gap-4 lg:grid-cols-2">
							<div className="rounded-[28px] border border-white/10 bg-white/6 p-5">
								<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
									Seed configuration
								</p>
								<div className="mt-4 space-y-4">
									<div
										aria-label="Execution mode"
										className="grid gap-2"
										role="radiogroup"
									>
										{EXECUTION_MODE_OPTIONS.map((option) => (
											<button
												aria-checked={executionMode === option.value}
												className={cn(
													"rounded-[22px] border px-4 py-4 text-left transition",
													selectorButtonClass(executionMode === option.value)
												)}
												key={option.value}
												onClick={() => setExecutionMode(option.value)}
												role="radio"
												type="button"
											>
												<div className="flex items-center justify-between gap-3">
													<div>
														<p className="font-medium text-sm">
															{option.label}
														</p>
														<p className="mt-1 text-xs opacity-76">
															{option.description}
														</p>
													</div>
													<CircleDot className="size-4" />
												</div>
											</button>
										))}
									</div>

									<div>
										<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
											Payment rail
										</p>
										<div
											aria-label="Payment rail"
											className="mt-3 grid gap-2"
											role="radiogroup"
										>
											{currentRailOptions.map((option) => (
												<button
													aria-checked={paymentRail === option.value}
													className={cn(
														"rounded-[20px] border px-4 py-4 text-left transition",
														selectorButtonClass(paymentRail === option.value)
													)}
													key={option.value}
													onClick={() => setPaymentRail(option.value)}
													role="radio"
													type="button"
												>
													<p className="font-medium text-sm">{option.label}</p>
													<p className="mt-1 text-xs opacity-76">
														{option.description}
													</p>
												</button>
											))}
										</div>
									</div>
								</div>
							</div>

							<div className="rounded-[28px] border border-white/10 bg-white/6 p-5">
								<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
									Monthly settlement ingress
								</p>
								<div className="mt-4 space-y-4">
									<div className="rounded-[20px] border border-amber-400/20 bg-amber-400/8 p-4 text-amber-50/88 text-sm leading-6">
										<CalendarClock className="mb-3 size-4 text-amber-200" />
										<p>
											The seeded mortgage stays on a demo-owned clock so an
											operator can advance the monthly cycle on demand.
										</p>
										<p className="mt-2 text-amber-50/70">
											DEMO-ONLY: this workspace jumps the month instead of
											waiting for wall-clock cron cadence.
										</p>
									</div>

									{executionMode === "provider_managed" ? (
										<>
											<div>
												<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
													Provider update channel
												</p>
												<div
													aria-label="Provider update channel"
													className="mt-3 grid gap-2"
													role="radiogroup"
												>
													{PROVIDER_CHANNEL_OPTIONS.map((option) => (
														<button
															aria-checked={providerChannel === option.value}
															className={cn(
																"rounded-[18px] border px-4 py-3 text-left transition",
																selectorButtonClass(
																	providerChannel === option.value
																)
															)}
															key={option.value}
															onClick={() => setProviderChannel(option.value)}
															role="radio"
															type="button"
														>
															<p className="font-medium text-sm">
																{option.label}
															</p>
															<p className="mt-1 text-xs opacity-76">
																{option.description}
															</p>
														</button>
													))}
												</div>
											</div>

											<div>
												<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
													Current-month provider outcome
												</p>
												<div
													aria-label="Current-month provider outcome"
													className="mt-3 grid gap-2"
													role="radiogroup"
												>
													{PROVIDER_OUTCOME_OPTIONS.map((option) => (
														<button
															aria-checked={providerOutcome === option.value}
															className={cn(
																"rounded-[18px] border px-4 py-3 text-left transition",
																selectorButtonClass(
																	providerOutcome === option.value
																)
															)}
															key={option.value}
															onClick={() => setProviderOutcome(option.value)}
															role="radio"
															type="button"
														>
															<p className="font-medium text-sm">
																{option.label}
															</p>
															<p className="mt-1 text-xs opacity-76">
																{option.description}
															</p>
														</button>
													))}
												</div>
											</div>
										</>
									) : (
										<div className="rounded-[20px] border border-white/10 bg-black/20 p-4 text-slate-300 text-sm leading-6">
											<ShieldCheck className="mb-3 size-4 text-teal-300" />
											<p>
												App-owned execution uses the real collection-plan
												runner.
											</p>
											<p className="mt-2 text-white/60">
												Choose <code>manual_review</code> when you want the
												advance step to leave the inbound receipt pending until
												an operator confirms it.
											</p>
										</div>
									)}
								</div>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-3">
							<Button
								className="rounded-full bg-white text-slate-950 hover:bg-white/92"
								disabled={pendingAction !== null}
								onClick={() =>
									runAction(
										"seed",
										seedWorkspace({
											executionMode,
											paymentRail,
										}),
										"Seeded execution-mode demo mortgage."
									)
								}
							>
								{pendingAction === "seed" ? (
									<LoaderCircle className="size-4 animate-spin" />
								) : (
									<RadioTower className="size-4" />
								)}
								Seed or replace workspace
							</Button>
							<p className="text-sm text-white/60">
								The seed always rebuilds the active demo workspace around one
								mortgage so the monthly narrative stays readable.
							</p>
						</div>
					</div>

					<div className="space-y-4">
						<div className="rounded-[28px] border border-white/10 bg-white/6 p-5">
							<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
								Current workspace
							</p>
							{isWorkspaceLoading ? (
								<LoadingSurface
									description="Loading the current demo mortgage, schedule state, and monthly control window."
									title="Loading workspace"
								/>
							) : workspace ? (
								<div className="mt-4 space-y-4">
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<Badge
												className={statusBadgeClass(workspace.mortgage.status)}
												variant="outline"
											>
												{workspace.mortgage.status}
											</Badge>
											<Badge
												className="border-white/10 bg-black/20 text-white/70"
												variant="outline"
											>
												{workspace.workspace.executionMode}
											</Badge>
											<Badge
												className="border-white/10 bg-black/20 text-white/70"
												variant="outline"
											>
												{workspace.workspace.paymentRail}
											</Badge>
										</div>
										<h2 className="mt-3 font-['Iowan_Old_Style',Georgia,serif] text-3xl text-white">
											{workspace.mortgage.label}
										</h2>
										<p className="mt-2 text-slate-300 text-sm">
											{workspace.mortgage.address}
										</p>
									</div>

									<div className="grid gap-3 sm:grid-cols-2">
										<MiniMetric
											label="Principal"
											value={formatCurrency(workspace.mortgage.principal)}
										/>
										<MiniMetric
											label="Monthly payment"
											value={formatCurrency(workspace.mortgage.paymentAmount)}
										/>
										<MiniMetric
											label="Rate"
											value={formatPercent(workspace.mortgage.interestRate)}
										/>
										<MiniMetric
											label="Month"
											value={`${workspace.workspace.currentMonthIndex}/${workspace.installments.length}`}
										/>
									</div>

									<div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
										<div className="flex items-center justify-between gap-3">
											<div>
												<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
													Next control window
												</p>
												<p className="mt-2 text-white">
													{nextInstallment
														? `Month ${nextInstallment.monthIndex} · ${formatDateOnly(nextInstallment.scheduledDate)}`
														: "All 12 months completed"}
												</p>
												<p className="mt-1 text-sm text-white/56">
													Demo clock: {workspace.workspace.currentDate}
												</p>
											</div>
											<ChevronsRight className="size-5 text-teal-200" />
										</div>
									</div>

									<div className="flex flex-wrap gap-3">
										<Button
											className="rounded-full bg-white text-slate-950 hover:bg-white/92"
											disabled={!canAdvance}
											onClick={() =>
												runAction(
													"advance",
													advanceMonth({
														outcome:
															workspaceExecutionMode === "provider_managed"
																? providerOutcome
																: undefined,
														providerChannel:
															workspaceExecutionMode === "provider_managed"
																? providerChannel
																: undefined,
													}),
													`Advanced the demo to month ${workspace.workspace.currentMonthIndex + 1}.`
												)
											}
										>
											{pendingAction === "advance" ? (
												<LoaderCircle className="size-4 animate-spin" />
											) : (
												<ArrowRight className="size-4" />
											)}
											Advance to next month
										</Button>
										<Button
											className="rounded-full"
											disabled={!canConfirmManualReview}
											onClick={() =>
												runAction(
													"confirm",
													confirmPendingManualReview({}),
													"Confirmed the pending manual-review receipt."
												)
											}
											variant="outline"
										>
											{pendingAction === "confirm" ? (
												<LoaderCircle className="size-4 animate-spin" />
											) : (
												<CheckCircle2 className="size-4" />
											)}
											Confirm manual-review receipt
										</Button>
									</div>
								</div>
							) : (
								<EmptySurface
									description="Seed the workspace to create a mortgage, its obligations, and the matching collection strategy for the selected execution mode."
									title="No demo mortgage yet"
								/>
							)}
						</div>

						{isWorkspaceLoading ? (
							<div className="rounded-[28px] border border-white/10 bg-white/6 p-5">
								<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
									Layer signals
								</p>
								<LoadingSurface
									description="Loading obligation, plan-entry, and execution counters."
									title="Loading layer signals"
								/>
							</div>
						) : workspace ? (
							<div className="rounded-[28px] border border-white/10 bg-white/6 p-5">
								<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
									Layer signals
								</p>
								<div className="mt-4 space-y-3">
									<div>
										<p className="text-white/56 text-xs uppercase tracking-[0.22em]">
											Obligation truth
										</p>
										<div className="mt-2">
											<CountBadgeRow
												items={buildCountBadgeItems(
													workspace.counts.obligationStatusCounts
												)}
											/>
										</div>
									</div>
									<div>
										<p className="text-white/56 text-xs uppercase tracking-[0.22em]">
											Strategy queue
										</p>
										<div className="mt-2">
											<CountBadgeRow
												items={buildCountBadgeItems(
													workspace.counts.planEntryStatusCounts
												)}
											/>
										</div>
									</div>
									<div>
										<p className="text-white/56 text-xs uppercase tracking-[0.22em]">
											Execution history
										</p>
										<div className="mt-2">
											<CountBadgeRow
												items={buildCountBadgeItems(
													workspace.counts.attemptStatusCounts
												)}
											/>
										</div>
									</div>
								</div>
							</div>
						) : null}
					</div>
				</div>
			</SurfaceCard>

			<SurfaceCard
				description="Each installment row keeps the layers separated: obligation truth, local collection strategy, and execution state sit beside the provider mirror when a recurring external schedule owns the draw."
				title="12-Month Service Rail"
			>
				{isWorkspaceLoading ? (
					<LoadingSurface
						description="Loading the 12-month servicing rail and provider mirror state."
						title="Loading service rail"
					/>
				) : workspace ? (
					<div className="space-y-4">
						{workspace.schedule ? (
							<div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
								<div className="grid gap-3 md:grid-cols-4">
									<MiniMetric
										label="Schedule status"
										value={workspace.schedule.status}
									/>
									<MiniMetric
										label="Provider ref"
										value={workspace.schedule.externalScheduleRef ?? "—"}
									/>
									<MiniMetric
										label="Last sync"
										value={formatDateTime(workspace.schedule.lastSyncedAt)}
									/>
									<MiniMetric
										label="Next poll"
										value={formatDateTime(workspace.schedule.nextPollAt)}
									/>
								</div>
							</div>
						) : null}

						<div className="space-y-3">
							{workspace.installments.map((installment) => {
								const isCurrent =
									installment.monthIndex ===
									workspace.workspace.currentMonthIndex + 1;
								const isCompleted =
									installment.monthIndex <=
									workspace.workspace.currentMonthIndex;

								return (
									<div
										className={cn(
											"rounded-[28px] border p-5 transition",
											isCurrent
												? "border-teal-400/35 bg-teal-400/10"
												: isCompleted
													? "border-white/10 bg-white/5"
													: "border-white/10 bg-black/20"
										)}
										key={installment.monthIndex}
									>
										<div className="grid gap-5 xl:grid-cols-[0.8fr_0.9fr_1fr_1fr_1fr]">
											<div>
												<div className="flex flex-wrap items-center gap-2">
													<Badge
														className="border-white/10 bg-black/20 text-white/72"
														variant="outline"
													>
														Month {installment.monthIndex}
													</Badge>
													{isCurrent ? (
														<Badge
															className="border-teal-400/30 bg-teal-400/10 text-teal-100"
															variant="outline"
														>
															next window
														</Badge>
													) : null}
												</div>
												<p className="mt-3 font-['Iowan_Old_Style',Georgia,serif] text-2xl text-white">
													{formatCurrency(installment.amount)}
												</p>
												<div className="mt-2 space-y-1 text-slate-300 text-sm">
													<p>Due {formatDateOnly(installment.dueDate)}</p>
													<p>
														Collect {formatDateOnly(installment.scheduledDate)}
													</p>
												</div>
											</div>

											<LayerColumn
												body={
													installment.obligation ? (
														<>
															<Badge
																className={statusBadgeClass(
																	installment.obligation.status
																)}
																variant="outline"
															>
																{installment.obligation.status}
															</Badge>
															<p className="mt-3 text-slate-300 text-sm">
																Settled{" "}
																{formatCurrency(
																	installment.obligation.amountSettled
																)}
															</p>
														</>
													) : (
														<p className="text-sm text-white/56">
															No linked obligation.
														</p>
													)
												}
												label="Obligation"
											/>

											<LayerColumn
												body={
													installment.planEntry ? (
														<>
															<div className="flex flex-wrap items-center gap-2">
																<Badge
																	className={statusBadgeClass(
																		installment.planEntry.status
																	)}
																	variant="outline"
																>
																	{installment.planEntry.status}
																</Badge>
																<Badge
																	className="border-white/10 bg-black/20 text-white/70"
																	variant="outline"
																>
																	{installment.planEntry.method}
																</Badge>
															</div>
															<p className="mt-3 text-slate-300 text-sm">
																{installment.planEntry.source}
															</p>
														</>
													) : (
														<p className="text-sm text-white/56">
															Not materialized.
														</p>
													)
												}
												label="Plan Entry"
											/>

											<LayerColumn
												body={
													installment.providerOccurrence ? (
														<>
															<div className="flex flex-wrap items-center gap-2">
																<Badge
																	className={providerLifecycleBadgeClass(
																		installment.providerOccurrence.status
																	)}
																	variant="outline"
																>
																	{installment.providerOccurrence.status}
																</Badge>
																{installment.providerOccurrence
																	.lastDeliveredVia ? (
																	<Badge
																		className="border-white/10 bg-black/20 text-white/70"
																		variant="outline"
																	>
																		{
																			installment.providerOccurrence
																				.lastDeliveredVia
																		}
																	</Badge>
																) : null}
															</div>
															<p className="mt-3 text-slate-300 text-sm">
																{installment.providerOccurrence.sequenceLabel}
															</p>
															<p className="mt-1 text-white/56 text-xs">
																{installment.providerOccurrence.statusReason ??
																	"no provider exception"}
															</p>
														</>
													) : (
														<p className="text-sm text-white/56">
															Only provider-managed rows render a Rotessa
															mirror.
														</p>
													)
												}
												label="Provider Mirror"
											/>

											<LayerColumn
												body={
													installment.attempt ? (
														<>
															<div className="flex flex-wrap items-center gap-2">
																<Badge
																	className={statusBadgeClass(
																		installment.attempt.status
																	)}
																	variant="outline"
																>
																	{installment.attempt.status}
																</Badge>
																{installment.attempt.transfer ? (
																	<Badge
																		className={statusBadgeClass(
																			installment.attempt.transfer.status
																		)}
																		variant="outline"
																	>
																		transfer{" "}
																		{installment.attempt.transfer.status}
																	</Badge>
																) : null}
															</div>
															<p className="mt-3 text-slate-300 text-sm">
																{installment.attempt.triggerSource ??
																	"no trigger yet"}
															</p>
															<p className="mt-1 text-white/56 text-xs">
																{installment.attempt.transfer?.providerRef ??
																	"provider ref pending"}
															</p>
														</>
													) : (
														<p className="text-sm text-white/56">
															No collection attempt yet.
														</p>
													)
												}
												label="Attempt + Transfer"
											/>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				) : (
					<EmptySurface
						description="Seed a workspace to render the 12-month execution rail."
						title="No installment rail yet"
					/>
				)}
			</SurfaceCard>
		</div>
	);
}

function LayerColumn({ label, body }: { label: string; body: ReactNode }) {
	return (
		<div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
			<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
				{label}
			</p>
			<div className="mt-3">{body}</div>
		</div>
	);
}

function MiniMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
			<p className="text-[11px] text-white/44 uppercase tracking-[0.24em]">
				{label}
			</p>
			<p className="mt-2 text-white">{value}</p>
		</div>
	);
}
