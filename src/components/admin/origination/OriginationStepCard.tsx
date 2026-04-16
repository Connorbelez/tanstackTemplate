import type { ReactNode } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { cn } from "#/lib/utils";

interface OriginationStepCardProps {
	children: ReactNode;
	className?: string;
	description: string;
	errors?: readonly string[];
	title: string;
}

export function OriginationStepCard({
	children,
	className,
	description,
	errors,
	title,
}: OriginationStepCardProps) {
	return (
		<Card className={cn("border-border/80 shadow-sm", className)}>
			<CardHeader className="gap-3">
				<div className="space-y-1">
					<CardTitle className="text-xl">{title}</CardTitle>
					<CardDescription className="max-w-3xl text-sm leading-6">
						{description}
					</CardDescription>
				</div>
				{errors && errors.length > 0 ? (
					<div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
						<p className="font-medium text-destructive text-sm">
							This step still needs attention.
						</p>
						<ul className="mt-2 list-disc space-y-1 pl-5 text-destructive/90 text-sm">
							{errors.map((error) => (
								<li key={error}>{error}</li>
							))}
						</ul>
					</div>
				) : null}
			</CardHeader>
			<CardContent className="space-y-6">{children}</CardContent>
		</Card>
	);
}
