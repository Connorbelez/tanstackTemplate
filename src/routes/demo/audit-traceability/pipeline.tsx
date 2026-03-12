import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Activity, CheckCircle2, Clock, Send, XCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { AlertsCard } from "#/components/audit-traceability/shared";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { useAuditAccessLog } from "#/hooks/use-audit-access-log";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/demo/audit-traceability/pipeline")({
	ssr: false,
	component: PipelinePage,
});

function PipelinePage() {
	useAuditAccessLog("pipeline");
	const outbox = useQuery(api.demo.auditTraceability.getOutboxStatus);
	const emitPending = useMutation(api.demo.auditTraceability.emitPendingEvents);
	const [lastEmit, setLastEmit] = useState<{
		count: number;
		at: number;
	} | null>(null);
	const [emitting, setEmitting] = useState(false);

	const handleEmit = useCallback(async () => {
		setEmitting(true);
		try {
			const result = await emitPending({});
			setLastEmit({ count: result.emittedCount, at: Date.now() });
		} catch (error) {
			console.error("Failed to emit pending events:", error);
		} finally {
			setEmitting(false);
		}
	}, [emitPending]);

	const emittedPct =
		outbox && outbox.totalCount > 0
			? Math.round((outbox.emittedCount / outbox.totalCount) * 100)
			: 0;
	const failedPct =
		outbox && outbox.totalCount > 0
			? Math.round((outbox.failedCount / outbox.totalCount) * 100)
			: 0;

	return (
		<div className="space-y-6">
			{/* Status Overview */}
			<div className="grid gap-4 sm:grid-cols-4">
				<Card>
					<CardContent className="flex items-center gap-3 pt-6">
						<Clock className="size-8 text-amber-500" />
						<div>
							<p className="font-bold text-2xl">
								{outbox?.pendingCount ?? "..."}
							</p>
							<p className="text-muted-foreground text-xs">Pending</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center gap-3 pt-6">
						<CheckCircle2 className="size-8 text-green-500" />
						<div>
							<p className="font-bold text-2xl">
								{outbox?.emittedCount ?? "..."}
							</p>
							<p className="text-muted-foreground text-xs">Emitted</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center gap-3 pt-6">
						<XCircle className="size-8 text-red-500" />
						<div>
							<p className="font-bold text-2xl">
								{outbox?.failedCount ?? "..."}
							</p>
							<p className="text-muted-foreground text-xs">Failed</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center gap-3 pt-6">
						<Activity className="size-8 text-blue-500" />
						<div>
							<p className="font-bold text-2xl">
								{outbox ? `${outbox.avgLatencyMs}ms` : "..."}
							</p>
							<p className="text-muted-foreground text-xs">Avg Latency</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Alerts */}
			{outbox && (outbox.highFailureAlerts > 0 || outbox.staleAlerts > 0) && (
				<AlertsCard
					highFailureAlerts={outbox.highFailureAlerts}
					staleAlerts={outbox.staleAlerts}
				/>
			)}

			{/* Emission Progress */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Emission Progress</CardTitle>
					<CardDescription>
						Events start as pending and are emitted by the outbox processor. In
						production this would push to an external SIEM or compliance store.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Progress bar */}
					<div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-l-full bg-green-500 transition-all"
							style={{ width: `${emittedPct}%` }}
						/>
						{failedPct > 0 && (
							<div
								className="h-full rounded-r-full bg-red-500 transition-all"
								style={{ width: `${failedPct}%` }}
							/>
						)}
					</div>
					<div className="flex items-center justify-between text-muted-foreground text-xs">
						<span>
							{outbox?.emittedCount ?? 0} / {outbox?.totalCount ?? 0} emitted
						</span>
						<span>
							{outbox?.pendingCount ?? 0} pending
							{(outbox?.failedCount ?? 0) > 0 &&
								` / ${outbox?.failedCount} failed`}
						</span>
					</div>
				</CardContent>
			</Card>

			{/* Manual Emit */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Send className="size-4" />
						Manual Emission
					</CardTitle>
					<CardDescription>
						Trigger the outbox processor manually. In production, a cron job
						runs every 60 seconds automatically.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Button
						disabled={emitting || outbox?.pendingCount === 0}
						onClick={handleEmit}
					>
						<Send className="mr-2 size-4" />
						{emitting ? "Emitting..." : "Emit Pending Events"}
					</Button>

					{lastEmit && (
						<div className="flex items-center gap-2">
							<Badge variant="secondary">{lastEmit.count} events emitted</Badge>
							<span className="text-muted-foreground text-xs">
								{new Date(lastEmit.at).toLocaleTimeString()}
							</span>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Architecture explanation */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">5-Layer Defense-in-Depth</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-2 text-sm">
						{[
							{
								layer: "Layer 1",
								name: "Database Triggers",
								desc: "Zero-miss capture — every db write fires the trigger atomically",
							},
							{
								layer: "Layer 2",
								name: "PII Sanitization",
								desc: "Recursive omission with substring matching before storage",
							},
							{
								layer: "Layer 3",
								name: "Component Isolation",
								desc: "Audit log component stores events in isolated tables with its own PII redaction",
							},
							{
								layer: "Layer 4",
								name: "Hash Chain",
								desc: "SHA-256 chain links ensure tamper evidence across events",
							},
							{
								layer: "Layer 5",
								name: "Outbox Pattern",
								desc: "Transactional outbox with idempotency keys, 60s cron, and at-least-once delivery",
							},
						].map((l) => (
							<div
								className="flex items-start gap-3 rounded-md border p-3"
								key={l.layer}
							>
								<Badge className="shrink-0" variant="outline">
									{l.layer}
								</Badge>
								<div>
									<p className="font-medium">{l.name}</p>
									<p className="text-muted-foreground text-xs">{l.desc}</p>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
