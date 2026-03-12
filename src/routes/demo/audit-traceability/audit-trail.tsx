import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { GitBranch, Search, Shield } from "lucide-react";
import { useState } from "react";
import { SeverityBadge } from "#/components/audit-traceability/shared";
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
import { useAuditAccessLog } from "#/hooks/use-audit-access-log";
import { api } from "../../../../convex/_generated/api";

interface AuditEntry {
	action: string;
	actorId: string;
	diff?: unknown;
	resourceId: string;
	resourceType: string;
	severity: string;
	timestamp: number;
}

export const Route = createFileRoute("/demo/audit-traceability/audit-trail")({
	ssr: false,
	component: AuditTrailPage,
});

function AuditTrailPage() {
	useAuditAccessLog("audit-trail");
	const mortgages = useQuery(api.demo.auditTraceability.listMortgages);
	const criticalEvents = useQuery(api.demo.auditTraceability.watchCritical);

	const [mode, setMode] = useState<"resource" | "actor">("resource");
	const [resourceId, setResourceId] = useState("");
	const [actorId, setActorId] = useState("");

	const queryId = mode === "resource" ? resourceId : actorId;
	const trail = useQuery(
		api.demo.auditTraceability.getAuditTrail,
		queryId
			? {
					mode,
					resourceId: mode === "resource" ? resourceId : undefined,
					actorId: mode === "actor" ? actorId : undefined,
				}
			: "skip"
	);

	return (
		<div className="space-y-6">
			{/* Query Controls */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Search className="size-4" />
						Query Audit Trail
					</CardTitle>
					<CardDescription>
						Query the component store by resource or actor
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex gap-2">
						<Button
							onClick={() => setMode("resource")}
							size="sm"
							variant={mode === "resource" ? "default" : "outline"}
						>
							By Resource
						</Button>
						<Button
							onClick={() => setMode("actor")}
							size="sm"
							variant={mode === "actor" ? "default" : "outline"}
						>
							By Actor
						</Button>
					</div>

					{mode === "resource" ? (
						<div className="space-y-2">
							<div className="flex flex-wrap gap-2">
								{mortgages?.map((m) => (
									<Button
										key={m._id}
										onClick={() => setResourceId(m._id)}
										size="sm"
										variant={resourceId === m._id ? "default" : "outline"}
									>
										{m.label}
									</Button>
								))}
							</div>
							<Input
								onChange={(e) => setResourceId(e.target.value)}
								placeholder="Or paste a resource ID"
								value={resourceId}
							/>
						</div>
					) : (
						<Input
							onChange={(e) => setActorId(e.target.value)}
							placeholder="Actor ID (e.g. demo-anonymous)"
							value={actorId}
						/>
					)}
				</CardContent>
			</Card>

			{/* Trail Results */}
			{trail && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<GitBranch className="size-4" />
							Results ({trail.length})
						</CardTitle>
					</CardHeader>
					<CardContent>
						{trail.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No audit entries found.
							</p>
						) : (
							<div className="max-h-96 space-y-2 overflow-y-auto">
								{trail.map((entry: AuditEntry) => (
									<div
										className="rounded-md border p-3 text-sm"
										key={`${entry.action}-${entry.timestamp}-${entry.resourceId}`}
									>
										<div className="flex items-center gap-2">
											<Badge>{entry.action}</Badge>
											<SeverityBadge severity={entry.severity} />
											<span className="text-muted-foreground text-xs">
												{new Date(entry.timestamp).toLocaleString()}
											</span>
										</div>
										<p className="mt-1 text-muted-foreground text-xs">
											Actor: {entry.actorId} | Resource: {entry.resourceType}/
											{entry.resourceId}
										</p>
										{entry.diff != null && (
											<details className="mt-2">
												<summary className="cursor-pointer text-muted-foreground text-xs hover:text-foreground">
													View diff
												</summary>
												<pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs">
													{JSON.stringify(entry.diff, null, 2)}
												</pre>
											</details>
										)}
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{/* Critical Events Watch */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Shield className="size-4" />
						Critical Events (Real-time)
					</CardTitle>
					<CardDescription>
						Warning, error, and critical severity events
					</CardDescription>
				</CardHeader>
				<CardContent>
					{criticalEvents && criticalEvents.length > 0 ? (
						<div className="max-h-64 space-y-2 overflow-y-auto">
							{criticalEvents.map((event: AuditEntry) => (
								<div
									className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm dark:border-amber-800 dark:bg-amber-950/30"
									key={`${event.action}-${event.timestamp}-${event.actorId}`}
								>
									<div className="flex items-center gap-2">
										<Badge variant="destructive">{event.action}</Badge>
										<SeverityBadge severity={event.severity} />
										<span className="text-muted-foreground text-xs">
											{new Date(event.timestamp).toLocaleString()}
										</span>
									</div>
									<p className="mt-1 text-muted-foreground text-xs">
										Actor: {event.actorId}
									</p>
								</div>
							))}
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							No critical events yet. Reject a transfer to see one.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
