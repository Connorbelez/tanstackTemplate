import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { Clock, Database, Zap } from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-action-cache")({
	ssr: false,
	component: ActionCacheDemo,
});

interface FetchResult {
	computedAt: number;
	elapsed: number;
	fromCache: boolean;
	result: string;
}

function ActionCacheDemo() {
	const [input, setInput] = useState("hello world");
	const [cachedResult, setCachedResult] = useState<FetchResult | null>(null);
	const [uncachedResult, setUncachedResult] = useState<FetchResult | null>(
		null
	);
	const [loading, setLoading] = useState<"cached" | "uncached" | null>(null);

	const fetchCached = useAction(api.demo.actionCache.fetchCached);
	const fetchUncached = useAction(api.demo.actionCache.fetchUncached);

	const handleCached = useCallback(async () => {
		setLoading("cached");
		const start = Date.now();
		const data = await fetchCached({ input });
		setCachedResult({ ...data, elapsed: Date.now() - start });
		setLoading(null);
	}, [fetchCached, input]);

	const handleUncached = useCallback(async () => {
		setLoading("uncached");
		const start = Date.now();
		const data = await fetchUncached({ input });
		setUncachedResult({ ...data, elapsed: Date.now() - start });
		setLoading(null);
	}, [fetchUncached, input]);

	return (
		<DemoLayout
			description="Cache expensive action results with optional TTLs. Compare cached vs uncached fetch timing side by side."
			docsHref="https://www.convex.dev/components/action-cache"
			title="Action Cache"
		>
			<div className="space-y-6">
				<div className="flex gap-3">
					<Input
						className="max-w-xs"
						onChange={(e) => setInput(e.target.value)}
						placeholder="Enter text to process…"
						value={input}
					/>
				</div>

				<div className="grid gap-6 md:grid-cols-2">
					<ResultCard
						icon={<Database className="size-5 text-blue-500" />}
						loading={loading === "cached"}
						onFetch={handleCached}
						result={cachedResult}
						subtitle="Returns cached result if available, otherwise runs the action"
						title="Cached Fetch"
					/>
					<ResultCard
						icon={<Zap className="size-5 text-orange-500" />}
						loading={loading === "uncached"}
						onFetch={handleUncached}
						result={uncachedResult}
						subtitle="Always runs the expensive action (2s simulated delay)"
						title="Uncached Fetch"
					/>
				</div>

				<p className="text-muted-foreground text-sm">
					Try clicking "Cached Fetch" twice with the same input — the second
					call should be near-instant.
				</p>
			</div>
		</DemoLayout>
	);
}

function ResultCard({
	title,
	subtitle,
	icon,
	result,
	loading,
	onFetch,
}: {
	title: string;
	subtitle: string;
	icon: React.ReactNode;
	result: FetchResult | null;
	loading: boolean;
	onFetch: () => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{icon}
					{title}
				</CardTitle>
				<p className="text-muted-foreground text-sm">{subtitle}</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<Button disabled={loading} onClick={onFetch}>
					{loading ? "Processing…" : "Fetch"}
				</Button>
				{result && (
					<div className="space-y-2 rounded-md border p-3 text-sm">
						<div className="flex items-center gap-2">
							<Clock className="size-3.5" />
							<span className="font-mono">{result.elapsed}ms</span>
							<Badge variant={result.fromCache ? "default" : "secondary"}>
								{result.fromCache ? "cache hit" : "cache miss"}
							</Badge>
						</div>
						<p className="text-muted-foreground">{result.result}</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
