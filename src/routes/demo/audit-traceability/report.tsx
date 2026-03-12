import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { CheckCircle2, Download, FileText, XCircle } from "lucide-react";
import { useCallback } from "react";
import {
	ControlCard,
	type ControlStatus,
	SummaryCard,
} from "#/components/audit-traceability/shared";
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

export const Route = createFileRoute("/demo/audit-traceability/report")({
	ssr: false,
	component: ReportPage,
});

function ReportPage() {
	useAuditAccessLog("export");
	const report = useQuery(
		api.demo.auditTraceability.generateComplianceReport,
		{}
	);

	const handleDownload = useCallback(() => {
		if (!report) {
			return;
		}
		const blob = new Blob([JSON.stringify(report, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `compliance-report-${new Date(report.generatedAt).toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}, [report]);

	if (!report) {
		return (
			<div className="flex items-center justify-center p-12">
				<p className="text-muted-foreground">Generating report...</p>
			</div>
		);
	}

	const controls = report.controls;

	return (
		<div className="space-y-6">
			{/* Report Header */}
			<Card>
				<CardHeader>
					<div className="flex items-start justify-between">
						<div>
							<CardTitle className="flex items-center gap-2 text-base">
								<FileText className="size-4" />
								Compliance Report
							</CardTitle>
							<CardDescription>
								Generated {new Date(report.generatedAt).toLocaleString()} —
								covers {report.summary.totalEntities} entities and{" "}
								{report.summary.totalAuditEvents} audit events
							</CardDescription>
						</div>
						<Button onClick={handleDownload} size="sm" variant="outline">
							<Download className="mr-2 size-4" />
							Download JSON
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<div className="grid gap-3 sm:grid-cols-4">
						<SummaryCard
							label="Entities"
							value={report.summary.totalEntities}
						/>
						<SummaryCard
							label="Audit Events"
							value={report.summary.totalAuditEvents}
						/>
						<SummaryCard
							label="Chains Verified"
							value={report.summary.chainsVerified}
						/>
						<SummaryCard
							label="Chains Failed"
							value={report.summary.chainsFailed}
						/>
					</div>
				</CardContent>
			</Card>

			{/* Control: Hash Chain Integrity */}
			<ControlCard
				standard="OSFI B-13 §5 / SOC 2 CC8.1"
				status={controls.hashChainIntegrity.status as ControlStatus}
				title="Hash Chain Integrity"
			>
				<div className="space-y-2">
					{controls.hashChainIntegrity.detail.map(
						(entity: {
							entity: string;
							entityId: string;
							valid: boolean;
							eventCount: number;
							error: string | null;
						}) => (
							<div
								className="flex items-center justify-between rounded border p-2 text-sm"
								key={entity.entityId}
							>
								<div className="flex items-center gap-2">
									{entity.valid ? (
										<CheckCircle2 className="size-4 text-green-500" />
									) : (
										<XCircle className="size-4 text-red-500" />
									)}
									<span>{entity.entity}</span>
									<span className="text-muted-foreground text-xs">
										({entity.eventCount} events)
									</span>
								</div>
								{entity.error && (
									<Badge variant="destructive">{entity.error}</Badge>
								)}
							</div>
						)
					)}
				</div>
			</ControlCard>

			{/* Control: Outbox Delivery */}
			<ControlCard
				standard="OSFI B-13 §3 / SOC 2 CC7.2"
				status={controls.outboxDelivery.status as ControlStatus}
				title="Outbox Delivery Pipeline"
			>
				<div className="grid gap-3 text-sm sm:grid-cols-4">
					<div>
						<p className="text-muted-foreground">Pending</p>
						<p className="font-bold text-lg">
							{controls.outboxDelivery.pending}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground">Emitted</p>
						<p className="font-bold text-lg">
							{controls.outboxDelivery.emitted}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground">Failed</p>
						<p className="font-bold text-lg">
							{controls.outboxDelivery.failed}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground">Avg Latency</p>
						<p className="font-bold text-lg">
							{controls.outboxDelivery.avgLatencyMs}ms
						</p>
					</div>
				</div>
				{(controls.outboxDelivery.alerts.highFailure > 0 ||
					controls.outboxDelivery.alerts.stale > 0) && (
					<div className="mt-3 flex gap-2">
						{controls.outboxDelivery.alerts.highFailure > 0 && (
							<Badge variant="destructive">
								{controls.outboxDelivery.alerts.highFailure} high-failure alerts
							</Badge>
						)}
						{controls.outboxDelivery.alerts.stale > 0 && (
							<Badge variant="secondary">
								{controls.outboxDelivery.alerts.stale} stale alerts
							</Badge>
						)}
					</div>
				)}
			</ControlCard>

			{/* Control: Access Logging */}
			<ControlCard
				standard="SOC 2 CC6.1"
				status={controls.accessLogging.status as ControlStatus}
				title="Audit Access Logging"
			>
				<p className="text-sm">
					{controls.accessLogging.totalAccessEvents} access events recorded.{" "}
					<span className="text-muted-foreground">
						{controls.accessLogging.detail}
					</span>
				</p>
			</ControlCard>

			{/* Control: PII Sanitization */}
			<ControlCard
				standard="PIPEDA §4.7"
				status={controls.piiSanitization.status as ControlStatus}
				title="PII Sanitization"
			>
				<p className="mb-2 text-muted-foreground text-sm">
					{controls.piiSanitization.detail}
				</p>
				<div className="flex flex-wrap gap-1">
					{controls.piiSanitization.fieldsOmitted.map((field: string) => (
						<Badge key={field} variant="outline">
							{field}
						</Badge>
					))}
				</div>
			</ControlCard>

			{/* Control: Component Isolation */}
			<ControlCard
				standard="OSFI B-13 §5 / SOC 2 CC6.1"
				status={controls.componentIsolation.status as ControlStatus}
				title="Component Isolation"
			>
				<p className="text-muted-foreground text-sm">
					{controls.componentIsolation.detail}
				</p>
			</ControlCard>
		</div>
	);
}
