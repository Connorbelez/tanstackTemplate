import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Activity, CheckCircle, ChevronRight, Play } from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-tracer")({
	ssr: false,
	component: TracerDemo,
});

interface TraceRun {
	id: number;
	label: string;
	message: string;
	timestamp: number;
}

function TracerDemo() {
	const [label, setLabel] = useState("my-operation");
	const [runs, setRuns] = useState<TraceRun[]>([]);
	const [running, setRunning] = useState(false);

	const runTraced = useMutation(api.demo.tracer.runTracedOperation);

	const handleRun = useCallback(async () => {
		setRunning(true);
		const result = await runTraced({ label, __traceContext: undefined });
		const message =
			result.success && result.data
				? result.data.message
				: (result.error ?? "Unknown error");
		setRuns((prev) => [
			{
				id: Date.now(),
				label,
				message,
				timestamp: Date.now(),
			},
			...prev,
		]);
		setRunning(false);
	}, [runTraced, label]);

	const spans = ["create", "validate", "finalize"];

	return (
		<DemoLayout
			description="Add structured tracing and observability to Convex functions with nested spans, metadata, and error preservation."
			docsHref="https://www.convex.dev/components/convex-tracer"
			title="Tracer"
		>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Activity className="size-5" />
							Run a Traced Operation
						</CardTitle>
						<p className="text-muted-foreground text-sm">
							Executes a mutation with 3 nested spans: create → validate →
							finalize
						</p>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex gap-3">
							<Input
								className="max-w-xs"
								onChange={(e) => setLabel(e.target.value)}
								placeholder="Operation label"
								value={label}
							/>
							<Button disabled={running} onClick={handleRun}>
								<Play className="mr-2 size-4" />
								{running ? "Running…" : "Run"}
							</Button>
						</div>

						{/* Span visualization */}
						<div className="space-y-1">
							<p className="font-medium text-sm">Span tree:</p>
							<div className="rounded-md border p-3">
								<div className="flex items-center gap-1 text-sm">
									<Activity className="size-3.5 text-purple-500" />
									<span className="font-mono">demoTracedOperation</span>
								</div>
								{spans.map((span) => (
									<div
										className="ml-6 flex items-center gap-1 text-sm"
										key={span}
									>
										<ChevronRight className="size-3 text-muted-foreground" />
										<span className="font-mono">{span}</span>
									</div>
								))}
							</div>
						</div>
					</CardContent>
				</Card>

				{runs.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Execution Log</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{runs.map((run) => (
									<div
										className="flex items-center gap-3 rounded-md border p-3"
										key={run.id}
									>
										<CheckCircle className="size-4 shrink-0 text-green-500" />
										<div className="min-w-0 flex-1">
											<p className="font-medium text-sm">{run.message}</p>
											<p className="text-muted-foreground text-xs">
												{new Date(run.timestamp).toLocaleTimeString()}
											</p>
										</div>
										<Badge variant="outline">{run.label}</Badge>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				)}

				<p className="text-muted-foreground text-sm">
					In production, traces appear in the Convex dashboard with full timing
					data and metadata. This demo shows the span structure and logs the
					execution result.
				</p>
			</div>
		</DemoLayout>
	);
}
