import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Gauge, ShieldAlert, Zap } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-rate-limiter")({
	ssr: false,
	component: RateLimiterDemo,
});

function RateLimiterDemo() {
	return (
		<DemoLayout
			description="Enforce per-user or global rate limits with token bucket and fixed window strategies — all transactional inside Convex."
			docsHref="https://www.convex.dev/components/rate-limiter"
			title="Rate Limiter"
		>
			<div className="grid gap-6 md:grid-cols-2">
				<LimitCard
					capacity={3}
					description="Allows bursts up to capacity, then refills at a steady rate."
					icon={<Zap className="size-5" />}
					limitName="demoTokenBucket"
					rate="5 per 10s"
					title="Token Bucket"
				/>
				<LimitCard
					description="Hard cap of requests per time window. Resets each period."
					icon={<ShieldAlert className="size-5" />}
					limitName="demoFixedWindow"
					rate="3 per minute"
					title="Fixed Window"
				/>
			</div>
		</DemoLayout>
	);
}

function LimitCard({
	title,
	description,
	limitName,
	rate,
	capacity,
	icon,
}: {
	title: string;
	description: string;
	limitName: "demoTokenBucket" | "demoFixedWindow";
	rate: string;
	capacity?: number;
	icon: React.ReactNode;
}) {
	const uniqueKey = useId();
	const [attempts, setAttempts] = useState<
		Array<{ ok: boolean; retryAfter: number; time: number }>
	>([]);

	const attemptAction = useMutation(api.demo.rateLimiter.attemptAction);
	const status = useQuery(api.demo.rateLimiter.checkStatus, {
		limitName,
		key: uniqueKey,
	});

	const handleClick = useCallback(async () => {
		const result = await attemptAction({ limitName, key: uniqueKey });
		setAttempts((prev) => [...prev, { ...result, time: Date.now() }]);
	}, [attemptAction, limitName, uniqueKey]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{icon}
					{title}
				</CardTitle>
				<p className="text-muted-foreground text-sm">{description}</p>
				<div className="flex gap-2">
					<Badge variant="outline">{rate}</Badge>
					{capacity !== undefined && (
						<Badge variant="secondary">burst: {capacity}</Badge>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center gap-3">
					<Button onClick={handleClick}>
						<Gauge className="mr-2 size-4" />
						Attempt Action
					</Button>
					{status && (
						<Badge variant={status.ok ? "default" : "destructive"}>
							{status.ok
								? "Available"
								: `Retry in ${Math.ceil(status.retryAfter / 1000)}s`}
						</Badge>
					)}
				</div>
				{attempts.length > 0 && (
					<div className="space-y-1">
						<p className="font-medium text-sm">
							Attempts ({attempts.filter((a) => a.ok).length}/{attempts.length}{" "}
							allowed)
						</p>
						<div className="flex flex-wrap gap-1.5">
							{attempts.map((a) => (
								<span
									className={`inline-block size-3 rounded-full ${a.ok ? "bg-green-500" : "bg-red-500"}`}
									key={a.time}
									title={
										a.ok
											? "Allowed"
											: `Blocked — retry in ${Math.ceil(a.retryAfter / 1000)}s`
									}
								/>
							))}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
