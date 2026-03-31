import { Activity, Database, Gauge, Radar, Server } from "lucide-react";
import type { ComponentType } from "react";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent } from "#/components/ui/card";
import { cn } from "#/lib/utils";
import {
	formatMetricTimestamp,
	formatReadCount,
	formatRenderTime,
	formatShapeStatus,
} from "./formatters";
import { useCrmDemoMetrics } from "./MetricsProvider";

interface MetricCardProps {
	accentClassName: string;
	description: string;
	icon: ComponentType<{ className?: string }>;
	title: string;
	value: string;
}

function MetricCard({
	title,
	value,
	description,
	icon: Icon,
	accentClassName,
}: MetricCardProps) {
	return (
		<div className="rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
						{title}
					</p>
					<p className="mt-2 font-semibold text-base">{value}</p>
				</div>
				<div
					className={cn(
						"flex size-9 items-center justify-center rounded-xl border",
						accentClassName
					)}
				>
					<Icon className="size-4" />
				</div>
			</div>
			<p className="mt-3 text-muted-foreground text-xs">{description}</p>
		</div>
	);
}

export function ValidationMetrics() {
	const {
		activeSource,
		eavReadCount,
		lastUpdatedAt,
		nativeReadCount,
		notes,
		renderTimeMs,
		unifiedShapeMatch,
	} = useCrmDemoMetrics();

	const shapeStatus = formatShapeStatus(unifiedShapeMatch);
	let shapeVariant: "default" | "destructive" | "outline" = "outline";
	if (unifiedShapeMatch === true) {
		shapeVariant = "default";
	} else if (unifiedShapeMatch === false) {
		shapeVariant = "destructive";
	}

	return (
		<div className="sticky bottom-4 z-30 mt-8">
			<Card className="overflow-hidden border-border/70 bg-card/95 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/85">
				<CardContent className="space-y-4 p-4">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="outline">Validation Metrics</Badge>
								<Badge variant={shapeVariant}>{shapeStatus}</Badge>
								{activeSource ? (
									<Badge variant="secondary">
										{activeSource === "eav"
											? "Tracking EAV source"
											: "Tracking native source"}
									</Badge>
								) : null}
							</div>
							<div>
								<p className="font-medium text-sm">
									Unified record verification for the CRM integration sandbox
								</p>
								<p className="text-muted-foreground text-xs">
									Last updated {formatMetricTimestamp(lastUpdatedAt)}
								</p>
							</div>
						</div>

						{notes ? (
							<div className="max-w-xl rounded-2xl border border-border/70 border-dashed bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
								{notes}
							</div>
						) : null}
					</div>

					<div className="grid gap-3 lg:grid-cols-4">
						<MetricCard
							accentClassName="border-sky-500/30 bg-sky-500/10 text-sky-600"
							description="Target for a 25-record EAV list is under 275 reads."
							icon={Database}
							title="EAV Query"
							value={formatReadCount(eavReadCount)}
						/>
						<MetricCard
							accentClassName="border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
							description="Target for native adapter reads is under 30 reads."
							icon={Server}
							title="Native Query"
							value={formatReadCount(nativeReadCount)}
						/>
						<MetricCard
							accentClassName="border-amber-500/30 bg-amber-500/10 text-amber-600"
							description="Measured render budget for the active surface."
							icon={Gauge}
							title="Render Time"
							value={formatRenderTime(renderTimeMs)}
						/>
						<MetricCard
							accentClassName="border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-600"
							description="The table, sidebar, and detail page should consume the same contract."
							icon={Radar}
							title="Record Shape"
							value={shapeStatus}
						/>
					</div>

					<div className="flex items-center justify-between border-border/60 border-t pt-2 text-muted-foreground text-xs">
						<div className="flex items-center gap-2">
							<Activity className="size-3.5" />
							Metrics update reactively as demo surfaces load.
						</div>
						<p>ENG-261 sandbox instrumentation</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
