import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { CheckCircle2, Download, Link2, ShieldAlert } from "lucide-react";
import { useCallback, useState } from "react";
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

function safeJsonParse(str: string): unknown {
	try {
		return JSON.parse(str);
	} catch {
		return str;
	}
}

interface AuditEvent {
	_id: string;
	actorId: string;
	afterState?: string;
	beforeState?: string;
	emitted: boolean;
	eventType: string;
	hash: string;
	prevHash: string;
	timestamp: number;
}

export const Route = createFileRoute("/demo/audit-traceability/hash-chain")({
	ssr: false,
	component: HashChainPage,
});

function HashChainPage() {
	const mortgages = useQuery(api.demo.auditTraceability.listMortgages);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	useAuditAccessLog("hash-chain", selectedId);

	const events = useQuery(
		api.demo.auditTraceability.getAuditEvents,
		selectedId ? { entityId: selectedId } : "skip"
	);
	const verification = useQuery(
		api.demo.auditTraceability.verifyChain,
		selectedId ? { entityId: selectedId } : "skip"
	);
	const exportData = useQuery(
		api.demo.auditTraceability.exportAuditTrail,
		selectedId ? { entityId: selectedId } : "skip"
	);

	const handleExport = useCallback(() => {
		if (!exportData) {
			return;
		}
		const blob = new Blob([JSON.stringify(exportData, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `audit-trail-${exportData.entityId}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}, [exportData]);

	return (
		<div className="space-y-6">
			{/* Mortgage Selector */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Select Mortgage</CardTitle>
					<CardDescription>
						Choose a mortgage to inspect its cryptographic hash chain
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-wrap gap-2">
						{mortgages?.map((m) => (
							<Button
								key={m._id}
								onClick={() => setSelectedId(m._id)}
								size="sm"
								variant={selectedId === m._id ? "default" : "outline"}
							>
								{m.label}
							</Button>
						))}
						{mortgages?.length === 0 && (
							<p className="text-muted-foreground text-sm">
								No mortgages. Create some on the Transfers tab.
							</p>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Verification Result */}
			{selectedId && verification && (
				<Card>
					<CardContent className="flex items-center gap-3 pt-6">
						{verification.valid ? (
							<>
								<CheckCircle2 className="size-5 text-green-600" />
								<span className="font-medium text-green-700 text-sm">
									Chain verified
								</span>
								<Badge variant="secondary">
									{verification.eventCount} events
								</Badge>
								{"firstEvent" in verification &&
									verification.firstEvent != null &&
									"lastEvent" in verification &&
									verification.lastEvent != null && (
										<span className="text-muted-foreground text-xs">
											{new Date(verification.firstEvent).toLocaleDateString()}{" "}
											&ndash;{" "}
											{new Date(verification.lastEvent).toLocaleDateString()}
										</span>
									)}
								{exportData && (
									<Button
										className="ml-auto"
										onClick={handleExport}
										size="sm"
										variant="outline"
									>
										<Download className="mr-1 size-3" />
										Download JSON
									</Button>
								)}
							</>
						) : (
							<>
								<ShieldAlert className="size-5 text-red-600" />
								<span className="font-medium text-red-700 text-sm">
									Chain broken at event{" "}
									{"brokenAt" in verification ? verification.brokenAt : "?"}
								</span>
								<span className="text-muted-foreground text-xs">
									{"error" in verification ? verification.error : ""}
								</span>
							</>
						)}
					</CardContent>
				</Card>
			)}

			{/* Event Timeline */}
			{selectedId && events && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Link2 className="size-4" />
							Hash Chain Timeline
						</CardTitle>
					</CardHeader>
					<CardContent>
						{events.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No events for this mortgage yet.
							</p>
						) : (
							<div className="space-y-4">
								{events.map((event: AuditEvent, i: number) => (
									<div
										className="relative rounded-md border p-4"
										key={event._id}
									>
										{/* Chain connector */}
										{i < events.length - 1 && (
											<div className="absolute -bottom-4 left-6 h-4 w-px bg-border" />
										)}

										<div className="flex items-start justify-between">
											<div>
												<div className="flex items-center gap-2">
													<Badge variant="outline">#{i}</Badge>
													<Badge>{event.eventType}</Badge>
													<span className="text-muted-foreground text-xs">
														{new Date(event.timestamp).toLocaleString()}
													</span>
												</div>
												<p className="mt-1 text-muted-foreground text-xs">
													Actor: {event.actorId}
												</p>
											</div>
										</div>

										{/* Hash chain */}
										<div className="mt-3 space-y-1 rounded bg-muted/50 p-2 font-mono text-xs">
											<div className="flex gap-2">
												<span className="w-16 shrink-0 text-muted-foreground">
													prev:
												</span>
												<span className="truncate">
													{event.prevHash || "(genesis)"}
												</span>
											</div>
											<div className="flex gap-2">
												<span className="w-16 shrink-0 text-muted-foreground">
													hash:
												</span>
												<span className="truncate">{event.hash}</span>
											</div>
										</div>

										{/* Sanitized state */}
										{event.afterState && (
											<details className="mt-2">
												<summary className="cursor-pointer text-muted-foreground text-xs hover:text-foreground">
													View sanitized state
												</summary>
												<div className="mt-1 space-y-1">
													{event.beforeState && (
														<div>
															<span className="text-muted-foreground text-xs">
																Before:
															</span>
															<pre className="mt-0.5 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs">
																{JSON.stringify(
																	safeJsonParse(event.beforeState),
																	null,
																	2
																)}
															</pre>
														</div>
													)}
													<div>
														<span className="text-muted-foreground text-xs">
															After:
														</span>
														<pre className="mt-0.5 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs">
															{JSON.stringify(
																safeJsonParse(event.afterState),
																null,
																2
															)}
														</pre>
													</div>
												</div>
											</details>
										)}
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
