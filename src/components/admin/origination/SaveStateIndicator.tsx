import {
	AlertTriangle,
	CloudCheck,
	LoaderCircle,
	PencilLine,
} from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";
import {
	formatOriginationDateTime,
	type OriginationWorkspaceSaveState,
} from "./workflow";

interface SaveStateIndicatorProps {
	errorMessage?: string;
	lastSavedAt?: number;
	state: OriginationWorkspaceSaveState;
}

const STATE_CONFIG = {
	idle: {
		icon: PencilLine,
		label: "Draft",
		className: "border-border/70 bg-background text-muted-foreground",
	},
	pending: {
		icon: PencilLine,
		label: "Pending save",
		className: "border-amber-500/30 bg-amber-500/10 text-amber-700",
	},
	saving: {
		icon: LoaderCircle,
		label: "Saving",
		className: "border-sky-500/30 bg-sky-500/10 text-sky-700",
	},
	saved: {
		icon: CloudCheck,
		label: "Saved",
		className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
	},
	error: {
		icon: AlertTriangle,
		label: "Save failed",
		className: "border-destructive/30 bg-destructive/10 text-destructive",
	},
} as const;

export function SaveStateIndicator({
	errorMessage,
	lastSavedAt,
	state,
}: SaveStateIndicatorProps) {
	const config = STATE_CONFIG[state];
	const Icon = config.icon;

	return (
		<div className="flex flex-col items-end gap-1 text-right">
			<Badge
				className={cn(
					"inline-flex items-center gap-2 border px-3 py-1 font-medium",
					config.className
				)}
				variant="outline"
			>
				<Icon
					className={cn("size-3.5", state === "saving" && "animate-spin")}
				/>
				{config.label}
			</Badge>
			<p className="text-muted-foreground text-xs">
				{state === "error" && errorMessage
					? errorMessage
					: `Last update ${formatOriginationDateTime(lastSavedAt)}`}
			</p>
		</div>
	);
}
