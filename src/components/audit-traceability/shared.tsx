import {
	AlertTriangle,
	CheckCircle2,
	Eye,
	Shield,
	XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

// ── Types ────────────────────────────────────────────────────────

export type ControlStatus = "PASS" | "WARN" | "FAIL" | "INFO";

export interface AccessEntry {
	action: string;
	actorId: string;
	resourceId: string;
	severity: string;
	timestamp: number;
}

// ── StatusIcon ───────────────────────────────────────────────────

export function StatusIcon({ status }: { status: ControlStatus }) {
	switch (status) {
		case "PASS":
			return <CheckCircle2 className="size-5 text-green-500" />;
		case "WARN":
			return <AlertTriangle className="size-5 text-amber-500" />;
		case "FAIL":
			return <XCircle className="size-5 text-red-500" />;
		default:
			return <Shield className="size-5 text-blue-500" />;
	}
}

// ── statusVariant ────────────────────────────────────────────────

export function statusVariant(status: ControlStatus) {
	switch (status) {
		case "PASS":
			return "default" as const;
		case "WARN":
			return "secondary" as const;
		case "FAIL":
			return "destructive" as const;
		default:
			return "outline" as const;
	}
}

// ── SummaryCard ──────────────────────────────────────────────────

export function SummaryCard({
	label,
	value,
}: {
	label: string;
	value: number;
}) {
	return (
		<div className="rounded-md border p-3 text-center">
			<p className="font-bold text-2xl">{value}</p>
			<p className="text-muted-foreground text-xs">{label}</p>
		</div>
	);
}

// ── ControlCard ──────────────────────────────────────────────────

export function ControlCard({
	title,
	standard,
	status,
	children,
}: {
	title: string;
	standard: string;
	status: ControlStatus;
	children: ReactNode;
}) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<StatusIcon status={status} />
						<div>
							<CardTitle className="text-base">{title}</CardTitle>
							<CardDescription>{standard}</CardDescription>
						</div>
					</div>
					<Badge variant={statusVariant(status)}>{status}</Badge>
				</div>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

// ── AlertsCard ───────────────────────────────────────────────────

export function AlertsCard({
	highFailureAlerts,
	staleAlerts,
}: {
	highFailureAlerts: number;
	staleAlerts: number;
}) {
	return (
		<Card className="border-amber-300">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<AlertTriangle className="size-4 text-amber-500" />
					Alerts
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				{highFailureAlerts > 0 && (
					<div className="flex items-center gap-2 text-sm">
						<Badge variant="destructive">High Failures</Badge>
						<span>
							{highFailureAlerts} entries with &gt;3 emission failures
						</span>
					</div>
				)}
				{staleAlerts > 0 && (
					<div className="flex items-center gap-2 text-sm">
						<Badge variant="secondary">Stale</Badge>
						<span>{staleAlerts} pending entries older than 5 minutes</span>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ── SeverityBadge ────────────────────────────────────────────────

function severityVariant(severity: string) {
	if (severity === "critical" || severity === "error") {
		return "destructive" as const;
	}
	if (severity === "warning") {
		return "secondary" as const;
	}
	return "outline" as const;
}

export function SeverityBadge({ severity }: { severity: string }) {
	return <Badge variant={severityVariant(severity)}>{severity}</Badge>;
}

// ── PageBadge ────────────────────────────────────────────────────

export function PageBadge({ action }: { action: string }) {
	const page = action.replace("audit.viewed.", "");
	return <Badge variant="outline">{page}</Badge>;
}

// ── AccessLogContent ─────────────────────────────────────────────

export function AccessLogContent({
	accessLog,
}: {
	accessLog: AccessEntry[] | undefined;
}) {
	if (accessLog === undefined) {
		return <p className="text-muted-foreground text-sm">Loading...</p>;
	}

	if (accessLog.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No access events recorded yet. Navigate to other audit tabs to generate
				access log entries.
			</p>
		);
	}

	return (
		<div className="max-h-[32rem] space-y-2 overflow-y-auto">
			{accessLog.map((entry: AccessEntry) => (
				<div
					className="flex items-center justify-between rounded-md border p-3 text-sm"
					key={`${entry.action}-${entry.timestamp}-${entry.actorId}`}
				>
					<div className="flex items-center gap-3">
						<Eye className="size-4 text-muted-foreground" />
						<div>
							<div className="flex items-center gap-2">
								<PageBadge action={entry.action} />
								<span className="font-medium">{entry.actorId}</span>
							</div>
							<p className="text-muted-foreground text-xs">
								{entry.resourceId === "global"
									? "Page-level access"
									: `Entity: ${entry.resourceId}`}
							</p>
						</div>
					</div>
					<span className="text-muted-foreground text-xs">
						{new Date(entry.timestamp).toLocaleString()}
					</span>
				</div>
			))}
		</div>
	);
}
