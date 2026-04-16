import {
	AlertTriangle,
	CheckCircle2,
	Clock3,
	Lock,
	PencilLine,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import type { OriginationStepperItem } from "./workflow";

interface OriginationStepperProps {
	currentStep: string;
	items: readonly OriginationStepperItem[];
	onSelectStep: (step: OriginationStepperItem["key"]) => void;
}

function StepStatusIcon({
	status,
}: {
	status: OriginationStepperItem["status"];
}) {
	switch (status) {
		case "complete":
			return <CheckCircle2 className="size-4 text-emerald-600" />;
		case "error":
		case "warning":
			return <AlertTriangle className="size-4 text-amber-600" />;
		case "locked":
			return <Lock className="size-4 text-muted-foreground" />;
		case "in_progress":
			return <PencilLine className="size-4 text-sky-600" />;
		case "not_started":
			return <Clock3 className="size-4 text-muted-foreground" />;
		default:
			return <Clock3 className="size-4 text-muted-foreground" />;
	}
}

function StepStatusLabel({
	errorCount,
	status,
}: {
	errorCount: number;
	status: OriginationStepperItem["status"];
}) {
	if (status === "complete") {
		return "Complete";
	}
	if (status === "error") {
		return errorCount === 1 ? "1 issue" : `${errorCount} issues`;
	}
	if (status === "warning") {
		return errorCount === 1 ? "1 warning" : `${errorCount} warnings`;
	}
	if (status === "in_progress") {
		return "In progress";
	}
	if (status === "locked") {
		return "Locked";
	}
	return "Not started";
}

export function OriginationStepper({
	currentStep,
	items,
	onSelectStep,
}: OriginationStepperProps) {
	return (
		<div className="rounded-3xl border border-border/80 bg-card shadow-sm">
			<div className="border-border/60 border-b px-5 py-4">
				<p className="font-semibold text-muted-foreground text-sm uppercase tracking-[0.18em]">
					Workflow
				</p>
				<h2 className="mt-2 font-semibold text-lg">Origination steps</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Stage the case progressively. Every step autosaves into the same draft
					aggregate.
				</p>
			</div>
			<div className="flex flex-col gap-2 p-3">
				{items.map((item, index) => {
					const isCurrent = item.key === currentStep;
					return (
						<Button
							className={cn(
								"h-auto justify-start rounded-2xl px-4 py-4 text-left",
								isCurrent
									? "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/15"
									: "border-transparent bg-transparent hover:bg-muted/70"
							)}
							key={item.key}
							onClick={() => onSelectStep(item.key)}
							type="button"
							variant="outline"
						>
							<div className="flex w-full items-start gap-3">
								<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background font-semibold text-sm">
									{index + 1}
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate font-semibold text-sm">
												{item.label}
											</p>
											<p className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-5">
												{item.description}
											</p>
										</div>
										<StepStatusIcon status={item.status} />
									</div>
									<p className="mt-2 text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
										{StepStatusLabel({
											errorCount: item.errorCount,
											status: item.status,
										})}
									</p>
								</div>
							</div>
						</Button>
					);
				})}
			</div>
		</div>
	);
}
