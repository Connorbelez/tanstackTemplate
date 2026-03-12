import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Clock, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-crons")({
	ssr: false,
	component: CronsDemo,
});

function CronsDemo() {
	const [jobName, setJobName] = useState("my-cron");
	const [intervalSec, setIntervalSec] = useState("10");

	const jobs = useQuery(api.demo.crons.listJobs);
	const log = useQuery(api.demo.crons.getLog);
	const registerJob = useMutation(api.demo.crons.registerJob);
	const deleteJob = useMutation(api.demo.crons.deleteJob);
	const clearLog = useMutation(api.demo.crons.clearLog);

	const handleRegister = useCallback(async () => {
		if (!(jobName.trim() && intervalSec)) {
			return;
		}
		await registerJob({
			name: jobName.trim(),
			intervalMs: Number(intervalSec) * 1000,
		});
		setJobName("");
	}, [registerJob, jobName, intervalSec]);

	return (
		<DemoLayout
			description="Register and manage cron jobs dynamically at runtime — create, inspect, and delete recurring tasks from your app."
			docsHref="https://www.convex.dev/components/crons"
			title="Dynamic Crons"
		>
			<div className="space-y-6">
				{/* Register */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Clock className="size-4" />
							Register a Cron Job
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex flex-wrap gap-3">
							<Input
								className="w-48"
								onChange={(e) => setJobName(e.target.value)}
								placeholder="Job name"
								value={jobName}
							/>
							<div className="flex items-center gap-1">
								<Input
									className="w-20"
									onChange={(e) => setIntervalSec(e.target.value)}
									type="number"
									value={intervalSec}
								/>
								<span className="text-muted-foreground text-sm">seconds</span>
							</div>
							<Button onClick={handleRegister}>
								<Plus className="mr-1 size-4" />
								Register
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Active Jobs */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							Active Jobs ({Array.isArray(jobs) ? jobs.length : 0})
						</CardTitle>
					</CardHeader>
					<CardContent>
						{Array.isArray(jobs) && jobs.length > 0 ? (
							<div className="space-y-2">
								{jobs.map(
									(job: { name?: string; id?: string; schedule?: unknown }) => (
										<div
											className="flex items-center gap-3 rounded-md border p-3"
											key={job.id ?? job.name}
										>
											<Clock className="size-4 text-blue-500" />
											<span className="flex-1 font-medium">
												{job.name ?? "unnamed"}
											</span>
											<Badge variant="outline">active</Badge>
											{job.name && (
												<Button
													onClick={() =>
														deleteJob({ name: job.name as string })
													}
													size="icon"
													variant="ghost"
												>
													<Trash2 className="size-4" />
												</Button>
											)}
										</div>
									)
								)}
							</div>
						) : (
							<p className="text-muted-foreground text-sm">
								No active cron jobs. Register one above.
							</p>
						)}
					</CardContent>
				</Card>

				{/* Execution Log */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center justify-between text-base">
							Execution Log
							{log && log.length > 0 && (
								<Button onClick={() => clearLog()} size="sm" variant="outline">
									Clear
								</Button>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{log && log.length > 0 ? (
							<div className="max-h-64 space-y-1 overflow-y-auto">
								{log.map((entry) => (
									<div
										className="flex items-center gap-2 text-sm"
										key={entry._id}
									>
										<span className="text-muted-foreground text-xs">
											{new Date(entry.ranAt).toLocaleTimeString()}
										</span>
										<span>{entry.message}</span>
									</div>
								))}
							</div>
						) : (
							<p className="text-muted-foreground text-sm">
								Waiting for cron executions…
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</DemoLayout>
	);
}
