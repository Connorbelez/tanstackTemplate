"use client";

import type { ReactNode } from "react";
import { cn } from "#/lib/utils";
import { EntityIcon } from "./entity-icon";

export interface EntityPageProps {
	readonly actions?: ReactNode;
	readonly backAction?: ReactNode;
	readonly customSections?: ReactNode;
	readonly headerBadges?: ReactNode;
	readonly iconName?: string;
	readonly mainContent: ReactNode;
	readonly summary: ReactNode;
	readonly supportingText?: ReactNode;
	readonly title: string;
}

export function EntityPage({
	actions,
	backAction,
	customSections,
	headerBadges,
	iconName,
	mainContent,
	summary,
	supportingText,
	title,
}: EntityPageProps) {
	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm sm:p-6">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
					<div className="flex items-start gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-inner">
							<EntityIcon className="h-5 w-5" iconName={iconName} />
						</div>
						<div className="space-y-2">
							{headerBadges ? (
								<div className="flex flex-wrap items-center gap-2">
									{headerBadges}
								</div>
							) : null}
							<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
								{title}
							</h1>
							{supportingText ? (
								<div className="max-w-3xl text-muted-foreground text-sm leading-6">
									{supportingText}
								</div>
							) : null}
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						{backAction}
						{actions}
					</div>
				</div>
			</section>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(280px,4fr)]">
				<div className="space-y-6">
					{mainContent}
					{customSections ? (
						<div className="space-y-4">{customSections}</div>
					) : null}
				</div>

				<aside className={cn("space-y-4", "xl:sticky xl:top-24 xl:self-start")}>
					{summary}
				</aside>
			</div>
		</div>
	);
}
