import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { LoaderCircle, RefreshCcw, TestTube2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { api } from "../../../../convex/_generated/api";

const DEFAULT_RUN_ID = "local-dev";

export const Route = createFileRoute("/demo/amps/e2e-payments")({
	validateSearch: (search: Record<string, unknown>) => ({
		runId: typeof search.runId === "string" ? search.runId : undefined,
	}),
	component: AmpsE2ePaymentsPage,
});

function labelValue(value: string | number | null | undefined) {
	if (value === null || value === undefined || value === "") {
		return "—";
	}
	return String(value);
}

function statusTone(status: string | null | undefined) {
	switch (status) {
		case "confirmed":
		case "settled":
		case "disbursed":
		case "seeded":
		case "outbound_confirmed":
			return "border-emerald-500/30 bg-emerald-500/10 text-emerald-50";
		case "pending":
		case "processing":
		case "initiated":
		case "collection_executed":
		case "inbound_pending_confirmation":
		case "outbound_pending_confirmation":
			return "border-amber-500/30 bg-amber-500/10 text-amber-50";
		case "failed":
		case "cancelled":
		case "reversed":
			return "border-rose-500/30 bg-rose-500/10 text-rose-50";
		default:
			return "border-white/10 bg-white/7 text-white/72";
	}
}

function AmpsE2ePaymentsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const [runIdInput, setRunIdInput] = useState(search.runId ?? DEFAULT_RUN_ID);
	const [pendingAction, setPendingAction] = useState<string | null>(null);
	const effectiveRunId = runIdInput.trim() || DEFAULT_RUN_ID;

	useEffect(() => {
		setRunIdInput(search.runId ?? DEFAULT_RUN_ID);
	}, [search.runId]);

	const scenario = useQuery(api.demo.ampsE2e.getOfflineLifecycleScenario, {
		runId: effectiveRunId,
	});
	const canExecute =
		scenario?.planEntry?.status === "planned" && pendingAction === null;
	const canConfirmInbound =
		scenario?.inboundTransfer !== null &&
		scenario?.inboundTransfer !== undefined &&
		["initiated", "pending", "processing"].includes(
			scenario.inboundTransfer.status
		) &&
		pendingAction === null;
	const canTriggerPayout =
		scenario?.dispersal !== null &&
		scenario?.dispersal !== undefined &&
		!scenario.outboundTransfer &&
		pendingAction === null;
	const canConfirmOutbound =
		scenario?.outboundTransfer !== null &&
		scenario?.outboundTransfer !== undefined &&
		["initiated", "pending", "processing"].includes(
			scenario.outboundTransfer.status
		) &&
		pendingAction === null;

	const seedScenario = useMutation(
		api.demo.ampsE2e.seedOfflineLifecycleScenario
	);
	const cleanupScenario = useMutation(
		api.demo.ampsE2e.cleanupOfflineLifecycleScenario
	);
	const executePlanEntry = useAction(
		api.demo.ampsE2e.executeOfflineLifecyclePlanEntry
	);
	const confirmInbound = useAction(
		api.demo.ampsE2e.confirmOfflineLifecycleInbound
	);
	const triggerPayout = useAction(
		api.demo.ampsE2e.triggerOfflineLifecyclePayout
	);
	const confirmOutbound = useAction(
		api.demo.ampsE2e.confirmOfflineLifecycleOutbound
	);

	async function runAction(
		key: string,
		label: string,
		fn: () => Promise<unknown>
	) {
		setPendingAction(key);
		try {
			await fn();
			toast.success(label);
			void navigate({
				to: "/demo/amps/e2e-payments",
				search: (current) => ({ ...current, runId: effectiveRunId }),
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setPendingAction(null);
		}
	}

	const stage = scenario?.stage ?? "not_seeded";

	return (
		<div className="space-y-6">
			<Card className="border-white/10 bg-slate-950/70 text-white shadow-[0_20px_60px_rgba(2,6,23,0.24)]">
				<CardHeader>
					<div className="flex flex-wrap items-center gap-3">
						<Badge
							className="border-white/10 bg-white/7 text-white/72"
							variant="outline"
						>
							<TestTube2 className="mr-2 size-3.5" />
							Playwright scaffold
						</Badge>
						<Badge
							className={statusTone(stage)}
							data-testid="e2e-stage-badge"
							variant="outline"
						>
							{stage}
						</Badge>
					</div>
					<CardTitle>Offline Collection Lifecycle Harness</CardTitle>
					<CardDescription className="text-slate-300">
						A disposable AMPS demo slice for admin-mediated inbound collection
						and outbound payout confirmation using the canonical transfer rails.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
						<Input
							className="border-white/10 bg-black/20 text-white"
							data-testid="e2e-run-id-input"
							onBlur={() =>
								void navigate({
									to: "/demo/amps/e2e-payments",
									search: (current) => ({ ...current, runId: effectiveRunId }),
								})
							}
							onChange={(event) => setRunIdInput(event.target.value)}
							value={runIdInput}
						/>
						<Button
							className="rounded-full"
							data-testid="e2e-seed-button"
							disabled={pendingAction !== null}
							onClick={() =>
								runAction("seed", "Seeded offline lifecycle scenario", () =>
									seedScenario({ runId: effectiveRunId })
								)
							}
						>
							{pendingAction === "seed" ? (
								<LoaderCircle className="size-4 animate-spin" />
							) : (
								<RefreshCcw className="size-4" />
							)}
							Seed
						</Button>
						<Button
							className="rounded-full"
							data-testid="e2e-cleanup-button"
							disabled={pendingAction !== null}
							onClick={() =>
								runAction("cleanup", "Cleaned offline lifecycle scenario", () =>
									cleanupScenario({ runId: effectiveRunId })
								)
							}
							variant="outline"
						>
							{pendingAction === "cleanup" ? (
								<LoaderCircle className="size-4 animate-spin" />
							) : (
								<Trash2 className="size-4" />
							)}
							Cleanup
						</Button>
					</div>

					<div className="grid gap-4 xl:grid-cols-2">
						<Card className="border-white/10 bg-white/5 text-white">
							<CardHeader>
								<CardTitle className="text-base">Scenario summary</CardTitle>
								<CardDescription className="text-slate-300">
									Run-scoped identifiers and current lifecycle state.
								</CardDescription>
							</CardHeader>
							<CardContent className="grid gap-3 text-sm">
								<div className="flex items-center justify-between gap-4">
									<span className="text-white/56">Run</span>
									<span className="font-mono">{effectiveRunId}</span>
								</div>
								<div className="flex items-center justify-between gap-4">
									<span className="text-white/56">Scenario key</span>
									<span className="font-mono text-xs">
										{scenario?.scenarioKey ?? `amps-e2e:${effectiveRunId}`}
									</span>
								</div>
								<div className="flex items-center justify-between gap-4">
									<span className="text-white/56">Mortgage</span>
									<span className="font-mono text-xs">
										{labelValue(scenario?.mortgage?.mortgageId)}
									</span>
								</div>
								<div className="flex items-center justify-between gap-4">
									<span className="text-white/56">Property</span>
									<span className="text-right">
										{scenario?.property
											? `${scenario.property.streetAddress} · ${scenario.property.city}`
											: "—"}
									</span>
								</div>
							</CardContent>
						</Card>

						<Card className="border-white/10 bg-white/5 text-white">
							<CardHeader>
								<CardTitle className="text-base">Phase controls</CardTitle>
								<CardDescription className="text-slate-300">
									Each button maps to one backend transition boundary.
								</CardDescription>
							</CardHeader>
							<CardContent className="grid gap-3 sm:grid-cols-2">
								<Button
									className="rounded-full"
									data-testid="e2e-execute-plan-entry-button"
									disabled={!canExecute}
									onClick={() =>
										runAction("execute", "Executed collection plan entry", () =>
											executePlanEntry({ runId: effectiveRunId })
										)
									}
									variant="outline"
								>
									{pendingAction === "execute" ? (
										<LoaderCircle className="size-4 animate-spin" />
									) : null}
									Execute collection
								</Button>
								<Button
									className="rounded-full"
									data-testid="e2e-confirm-inbound-button"
									disabled={!canConfirmInbound}
									onClick={() =>
										runAction(
											"confirm-inbound",
											"Confirmed inbound transfer",
											() => confirmInbound({ runId: effectiveRunId })
										)
									}
									variant="outline"
								>
									{pendingAction === "confirm-inbound" ? (
										<LoaderCircle className="size-4 animate-spin" />
									) : null}
									Confirm inbound
								</Button>
								<Button
									className="rounded-full"
									data-testid="e2e-trigger-payout-button"
									disabled={!canTriggerPayout}
									onClick={() =>
										runAction(
											"trigger-payout",
											"Triggered outbound payout",
											() => triggerPayout({ runId: effectiveRunId })
										)
									}
									variant="outline"
								>
									{pendingAction === "trigger-payout" ? (
										<LoaderCircle className="size-4 animate-spin" />
									) : null}
									Trigger payout
								</Button>
								<Button
									className="rounded-full"
									data-testid="e2e-confirm-outbound-button"
									disabled={!canConfirmOutbound}
									onClick={() =>
										runAction(
											"confirm-outbound",
											"Confirmed outbound transfer",
											() => confirmOutbound({ runId: effectiveRunId })
										)
									}
									variant="outline"
								>
									{pendingAction === "confirm-outbound" ? (
										<LoaderCircle className="size-4 animate-spin" />
									) : null}
									Confirm outbound
								</Button>
							</CardContent>
						</Card>
					</div>

					<Card className="border-white/10 bg-white/5 text-white">
						<CardHeader>
							<CardTitle className="text-base">State dump</CardTitle>
							<CardDescription className="text-slate-300">
								These values are the machine-readable assertions Playwright
								should depend on.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
							<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
								<p className="text-[11px] text-white/44 uppercase tracking-[0.22em]">
									Plan entry
								</p>
								<Badge
									className={`mt-3 ${statusTone(scenario?.planEntry?.status)}`}
									data-testid="e2e-plan-entry-status"
									variant="outline"
								>
									{labelValue(scenario?.planEntry?.status)}
								</Badge>
							</div>
							<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
								<p className="text-[11px] text-white/44 uppercase tracking-[0.22em]">
									Collection attempt
								</p>
								<Badge
									className={`mt-3 ${statusTone(
										scenario?.collectionAttempt?.status
									)}`}
									data-testid="e2e-attempt-status"
									variant="outline"
								>
									{labelValue(scenario?.collectionAttempt?.status)}
								</Badge>
							</div>
							<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
								<p className="text-[11px] text-white/44 uppercase tracking-[0.22em]">
									Inbound transfer
								</p>
								<Badge
									className={`mt-3 ${statusTone(
										scenario?.inboundTransfer?.status
									)}`}
									data-testid="e2e-inbound-transfer-status"
									variant="outline"
								>
									{labelValue(scenario?.inboundTransfer?.status)}
								</Badge>
							</div>
							<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
								<p className="text-[11px] text-white/44 uppercase tracking-[0.22em]">
									Obligation
								</p>
								<Badge
									className={`mt-3 ${statusTone(scenario?.obligation?.status)}`}
									data-testid="e2e-obligation-status"
									variant="outline"
								>
									{labelValue(scenario?.obligation?.status)}
								</Badge>
							</div>
							<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
								<p className="text-[11px] text-white/44 uppercase tracking-[0.22em]">
									Dispersal
								</p>
								<Badge
									className={`mt-3 ${statusTone(scenario?.dispersal?.status)}`}
									data-testid="e2e-dispersal-status"
									variant="outline"
								>
									{labelValue(scenario?.dispersal?.status)}
								</Badge>
							</div>
							<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
								<p className="text-[11px] text-white/44 uppercase tracking-[0.22em]">
									Outbound transfer
								</p>
								<Badge
									className={`mt-3 ${statusTone(
										scenario?.outboundTransfer?.status
									)}`}
									data-testid="e2e-outbound-transfer-status"
									variant="outline"
								>
									{labelValue(scenario?.outboundTransfer?.status)}
								</Badge>
							</div>
						</CardContent>
					</Card>
				</CardContent>
			</Card>
		</div>
	);
}
