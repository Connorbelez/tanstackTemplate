import { AlertTriangle, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible";
import { cn } from "#/lib/utils";

interface OriginationStepCardProps {
	children: ReactNode;
	className?: string;
	errors?: readonly string[];
	title: string;
}

const ERROR_PREVIEW_LIMIT = 2;

function buildErrorPreview(errors: readonly string[]) {
	const preview = errors.slice(0, ERROR_PREVIEW_LIMIT);
	const remainingCount = errors.length - preview.length;

	return remainingCount > 0
		? `${preview.join(" • ")} • +${remainingCount} more`
		: preview.join(" • ");
}

export function OriginationStepCard({
	children,
	className,
	errors,
	title,
}: OriginationStepCardProps) {
	const hasErrors = Boolean(errors && errors.length > 0);
	const errorCount = errors?.length ?? 0;
	const errorPreview = buildErrorPreview(errors ?? []);

	return (
		<Card className={cn("border-border/80 shadow-sm", className)}>
			<CardHeader className="gap-3">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<CardTitle className="shrink-0 text-xl">{title}</CardTitle>
					{hasErrors ? (
						<Collapsible className="min-w-0 flex-1">
							<div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
								<AlertTriangle className="size-4 shrink-0 text-destructive" />
								<p className="shrink-0 font-medium text-destructive text-sm">
									{errorCount} issue{errorCount === 1 ? "" : "s"} need attention
								</p>
								<p className="min-w-0 flex-1 truncate text-destructive/90 text-sm">
									{errorPreview}
								</p>
								{errorCount > ERROR_PREVIEW_LIMIT ? (
									<CollapsibleTrigger asChild>
										<Button
											className="group h-7 shrink-0 px-2 text-destructive hover:text-destructive"
											type="button"
											variant="ghost"
										>
											View all issues
											<ChevronDown className="ml-2 size-4 transition-transform group-data-[state=open]:rotate-180" />
										</Button>
									</CollapsibleTrigger>
								) : null}
							</div>
							{errorCount > ERROR_PREVIEW_LIMIT ? (
								<CollapsibleContent>
									<ul className="mt-3 list-disc space-y-1 pl-8 text-destructive/90 text-sm">
										{errors?.map((error) => (
											<li key={error}>{error}</li>
										))}
									</ul>
								</CollapsibleContent>
							) : null}
						</Collapsible>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="space-y-6">{children}</CardContent>
		</Card>
	);
}
