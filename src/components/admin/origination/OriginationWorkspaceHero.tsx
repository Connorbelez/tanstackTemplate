import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import { SaveStateIndicator } from "./SaveStateIndicator";
import type { OriginationWorkspaceSaveState } from "./workflow";

interface OriginationWorkspaceHeroProps {
	actions?: ReactNode;
	caseStatus: string;
	currentStepLabel: string;
	lastSavedAt?: number;
	pageTitle: string;
	saveError?: string;
	saveState: OriginationWorkspaceSaveState;
}

export function OriginationWorkspaceHero({
	actions,
	caseStatus,
	currentStepLabel,
	lastSavedAt,
	pageTitle,
	saveError,
	saveState,
}: OriginationWorkspaceHeroProps) {
	return (
		<div className="rounded-[2rem] border border-border/70 bg-card px-6 py-5 shadow-sm">
			<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
				<div className="min-w-0 space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<Badge className="border border-border/70" variant="outline">
							{caseStatus}
						</Badge>
						<Badge className="border border-border/70" variant="outline">
							{currentStepLabel}
						</Badge>
					</div>

					<div className="space-y-2">
						<h1 className="font-semibold text-3xl tracking-tight">
							{pageTitle}
						</h1>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-3 xl:justify-end">
					<SaveStateIndicator
						compact
						errorMessage={saveError}
						lastSavedAt={lastSavedAt}
						state={saveState}
					/>
					{actions}
				</div>
			</div>
		</div>
	);
}
