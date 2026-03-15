import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
	AlertTriangle,
	CheckCircle2,
	Info,
	ShieldAlert,
	ShieldOff,
} from "lucide-react";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { useAppAuth } from "#/hooks/use-app-auth";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/demo/rbac-auth/audit")({
	ssr: false,
	component: AuditPage,
});

const PII_FIELDS = [
	"email",
	"phone",
	"ssn",
	"password",
	"phoneNumber",
	"borrowerEmail",
	"borrowerPhone",
	"borrowerSsn",
];

const AUDITED_EVENTS = [
	{
		label: "Authentication attempts",
		description: "Login successes and failures",
	},
	{
		label: "Authorization denials",
		description: "Forbidden access attempts with required permission",
	},
	{
		label: "Onboarding transitions",
		description: "Role request created, approved, rejected",
	},
	{
		label: "Role assignments",
		description: "Membership and role changes via WorkOS",
	},
	{
		label: "Resource access",
		description: "Document uploads, deal views, ledger reads",
	},
	{
		label: "Admin actions",
		description: "User management, org settings, system config",
	},
];

const SEVERITY_CONFIG: Record<
	string,
	{ color: string; icon: typeof Info; label: string }
> = {
	info: { label: "Info", color: "bg-blue-100 text-blue-700", icon: Info },
	warning: {
		label: "Warning",
		color: "bg-amber-100 text-amber-700",
		icon: AlertTriangle,
	},
	error: {
		label: "Error",
		color: "bg-orange-100 text-orange-700",
		icon: ShieldAlert,
	},
	critical: {
		label: "Critical",
		color: "bg-red-100 text-red-700",
		icon: ShieldOff,
	},
};

function AuditPage() {
	const auth = useAppAuth();
	const canViewAudit = auth.permissions.includes("platform:view_audit");

	return (
		<div className="space-y-6">
			{/* PII Protection */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">PII Protection</CardTitle>
					<CardDescription>
						Sensitive data is automatically redacted in all audit logs
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="rounded-lg border bg-red-50 p-4">
							<p className="mb-2 font-medium text-red-700 text-xs uppercase">
								Raw Event (never stored)
							</p>
							<pre className="overflow-x-auto text-xs leading-relaxed">
								{JSON.stringify(
									{
										action: "onboarding.request_approved",
										actor: "user_01ABC",
										metadata: {
											email: "jane@example.com",
											phone: "+1-555-0123",
											ssn: "123-45-6789",
											requestedRole: "broker",
										},
									},
									null,
									2
								)}
							</pre>
						</div>
						<div className="rounded-lg border bg-green-50 p-4">
							<p className="mb-2 font-medium text-green-700 text-xs uppercase">
								Stored Event (redacted)
							</p>
							<pre className="overflow-x-auto text-xs leading-relaxed">
								{JSON.stringify(
									{
										action: "onboarding.request_approved",
										actor: "user_01ABC",
										metadata: {
											email: "[REDACTED]",
											phone: "[REDACTED]",
											ssn: "[REDACTED]",
											requestedRole: "broker",
										},
									},
									null,
									2
								)}
							</pre>
						</div>
					</div>
					<div className="mt-4">
						<p className="mb-2 text-muted-foreground text-sm">
							Protected PII fields ({PII_FIELDS.length}):
						</p>
						<div className="flex flex-wrap gap-2">
							{PII_FIELDS.map((field) => (
								<Badge key={field} variant="secondary">
									{field}
								</Badge>
							))}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* What Gets Audited */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">What Gets Audited</CardTitle>
					<CardDescription>
						Every security-relevant action creates a tamper-evident audit record
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-2 sm:grid-cols-2">
						{AUDITED_EVENTS.map((event) => (
							<div
								className="flex items-start gap-2 rounded-lg border p-3"
								key={event.label}
							>
								<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
								<div>
									<p className="font-medium text-sm">{event.label}</p>
									<p className="text-muted-foreground text-xs">
										{event.description}
									</p>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Live Event Feed or Placeholder */}
			{canViewAudit ? (
				<LiveAuditFeed />
			) : (
				<Card className="border-dashed">
					<CardContent className="py-8 text-center">
						<ShieldAlert className="mx-auto mb-2 size-8 text-muted-foreground" />
						<p className="font-medium text-sm">
							Full audit trail requires Platform Admin role
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							Users with{" "}
							<code className="rounded bg-muted px-1">platform:view_audit</code>{" "}
							permission see a live event feed here with timestamps, actors,
							actions, and severity levels.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function LiveAuditFeed() {
	const events = useQuery(api.audit.queries.watchCriticalAuthEvents);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Live Security Events</CardTitle>
				<CardDescription>
					Real-time feed of critical auth events (warning+ severity)
				</CardDescription>
			</CardHeader>
			<CardContent>
				<AuditEventList
					events={events as Record<string, unknown>[] | undefined}
				/>
			</CardContent>
		</Card>
	);
}

function AuditEventList({
	events,
}: {
	events: Record<string, unknown>[] | undefined;
}) {
	if (!events) {
		return <p className="text-muted-foreground text-sm">Loading...</p>;
	}
	if (events.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No critical events recorded yet.
			</p>
		);
	}
	return (
		<div className="space-y-2">
			{events.map((event) => {
				const severity =
					SEVERITY_CONFIG[String(event.severity ?? "info")] ??
					SEVERITY_CONFIG.info;
				const SeverityIcon = severity.icon;
				const timestamp = event._creationTime as number | undefined;
				const action = String(event.action ?? "unknown");
				const actorId = event.actorId ? String(event.actorId) : null;
				const eventKey = `${action}-${timestamp ?? ""}-${actorId ?? ""}`;

				return (
					<div
						className="flex items-start gap-3 rounded-lg border p-3"
						key={eventKey}
					>
						<SeverityIcon className="mt-0.5 size-4 shrink-0" />
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="truncate font-mono text-sm">{action}</span>
								<Badge className={severity.color} variant="outline">
									{severity.label}
								</Badge>
							</div>
							<div className="mt-1 flex gap-3 text-muted-foreground text-xs">
								{actorId && <span>Actor: {actorId.slice(0, 12)}…</span>}
								{timestamp && (
									<span>{new Date(timestamp).toLocaleTimeString()}</span>
								)}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
