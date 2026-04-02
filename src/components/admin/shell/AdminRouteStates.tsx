"use client";

import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Compass, Home, Search, Sparkles } from "lucide-react";
import { AppErrorComponent } from "#/components/error-boundary";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { EMPTY_ADMIN_DETAIL_SEARCH } from "#/lib/admin-detail-search";
import { cn } from "#/lib/utils";
import { EntityIcon } from "./entity-icon";
import {
	getAdminEntityByType,
	getAdminNavigationSections,
} from "./entity-registry";

export function AdminRouteErrorBoundary({
	error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-1 items-start justify-center py-6">
			<AppErrorComponent error={error} reset={reset} />
		</div>
	);
}

export function AdminPageSkeleton({
	titleWidth = "w-56",
	descriptionWidth = "w-72",
	children,
}: {
	children?: React.ReactNode;
	descriptionWidth?: string;
	titleWidth?: string;
}) {
	return (
		<div className="space-y-6">
			<div className="space-y-3">
				<Skeleton className={`h-8 ${titleWidth}`} />
				<Skeleton className={`h-4 ${descriptionWidth}`} />
			</div>
			{children}
		</div>
	);
}

export function AdminTableSkeleton({
	columnCount = 4,
	rowCount = 6,
}: {
	columnCount?: number;
	rowCount?: number;
}) {
	const headerKeys = Array.from(
		{ length: columnCount },
		(_, index) => `header-${index + 1}`
	);
	const rowKeys = Array.from(
		{ length: rowCount },
		(_, index) => `row-${index + 1}`
	);
	const cellKeys = Array.from(
		{ length: columnCount },
		(_, index) => `cell-${index + 1}`
	);

	return (
		<div className="overflow-hidden rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						{headerKeys.map((headerKey) => (
							<TableHead key={headerKey}>
								<Skeleton className="h-4 w-20" />
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rowKeys.map((rowKey) => (
						<TableRow key={rowKey}>
							{cellKeys.map((cellKey, columnIndex) => (
								<TableCell key={`${rowKey}-${cellKey}`}>
									<Skeleton
										className={
											columnIndex === columnCount - 1
												? "ml-auto h-4 w-16"
												: "h-4 w-full max-w-36"
										}
									/>
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

interface AdminNotFoundStateProps {
	readonly entityType: string;
	readonly recordId?: string;
	readonly variant: "entity" | "record";
}

const floatingTransition = {
	duration: 7,
	ease: "easeInOut",
	repeat: Number.POSITIVE_INFINITY,
} as const;

function AdminFallbackOrb({
	className,
	delay = 0,
	reduceMotion,
}: {
	readonly className: string;
	readonly delay?: number;
	readonly reduceMotion: boolean;
}) {
	return (
		<motion.div
			animate={
				reduceMotion
					? undefined
					: {
							opacity: [0.3, 0.7, 0.3],
							scale: [0.94, 1.04, 0.94],
							y: [-6, 8, -6],
						}
			}
			className={className}
			transition={{ ...floatingTransition, delay }}
		/>
	);
}

function AdminFallbackVisual({
	iconName,
	label,
	reduceMotion,
	variant,
}: {
	readonly iconName?: string;
	readonly label: string;
	readonly reduceMotion: boolean;
	readonly variant: "entity" | "record";
}) {
	return (
		<div className="relative isolate mx-auto flex aspect-square w-full max-w-[19rem] items-center justify-center">
			<AdminFallbackOrb
				className="absolute -top-3 right-6 h-24 w-24 rounded-full bg-cyan-500/15 blur-3xl"
				delay={0.3}
				reduceMotion={reduceMotion}
			/>
			<AdminFallbackOrb
				className="absolute bottom-6 left-4 h-28 w-28 rounded-full bg-emerald-500/15 blur-3xl"
				delay={1}
				reduceMotion={reduceMotion}
			/>
			<motion.div
				animate={
					reduceMotion
						? undefined
						: {
								rotate: [0, 8, 0, -8, 0],
								scale: [1, 1.02, 1],
							}
				}
				className="absolute inset-6 rounded-full border border-border/60"
				transition={{ ...floatingTransition, duration: 11 }}
			/>
			<motion.div
				animate={
					reduceMotion
						? undefined
						: {
								rotate: [0, -6, 0, 6, 0],
								scale: [0.96, 1.02, 0.96],
							}
				}
				className="absolute inset-12 rounded-full border border-cyan-400/40 border-dashed"
				transition={{ ...floatingTransition, duration: 13, delay: 0.4 }}
			/>
			<motion.div
				animate={
					reduceMotion
						? undefined
						: {
								boxShadow: [
									"0 0 0 0 rgba(34,211,238,0.12)",
									"0 0 0 18px rgba(34,211,238,0)",
									"0 0 0 0 rgba(34,211,238,0)",
								],
							}
				}
				className="relative flex size-28 items-center justify-center rounded-[2rem] border border-border/70 bg-background/90 shadow-[0_24px_60px_-30px_rgba(16,185,129,0.45)] backdrop-blur"
				transition={{
					duration: 3.2,
					ease: "easeOut",
					repeat: Number.POSITIVE_INFINITY,
				}}
			>
				<div className="absolute inset-2 rounded-[1.6rem] bg-gradient-to-br from-cyan-500/10 via-transparent to-emerald-500/10" />
				{variant === "record" ? (
					<>
						<EntityIcon
							className="size-9 text-foreground"
							iconName={iconName}
						/>
						<div className="absolute -right-2 -bottom-2 flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-background shadow-lg">
							<Search className="size-4 text-cyan-500" />
						</div>
					</>
				) : (
					<>
						<Compass className="size-9 text-foreground" />
						<div className="absolute -right-2 -bottom-2 flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-background shadow-lg">
							<Sparkles className="size-4 text-emerald-500" />
						</div>
					</>
				)}
			</motion.div>
			<div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-border/60 bg-background/90 px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-[0.22em] backdrop-blur">
				{label}
			</div>
		</div>
	);
}

export function AdminNotFoundState({
	entityType,
	recordId,
	variant,
}: AdminNotFoundStateProps) {
	const reduceMotion = useReducedMotion() ?? false;
	const entity = getAdminEntityByType(entityType);
	const entityLabel = entity?.pluralLabel ?? entityType;
	const knownDestinations = getAdminNavigationSections()
		.flatMap((section) => section.items)
		.slice(0, 4);
	const eyebrow =
		variant === "record" ? "Record lookup missed" : "Registry mismatch";
	const title =
		variant === "record"
			? `${entity?.singularLabel ?? "Record"} ${recordId ?? "unknown"} isn't here`
			: "This admin surface doesn't exist";
	const description =
		variant === "record"
			? `We followed the URL into ${entity?.pluralLabel ?? "this area"}, but there is no matching record for ${recordId}. Try the collection view or hop to a nearby admin destination.`
			: `The admin shell doesn't recognize the entity type "${entityType}". It may have been renamed, removed, or never registered in the sidebar.`;
	const toneLabel =
		variant === "record" ? "Record not found" : "Entity not found";

	return (
		<motion.section
			animate={reduceMotion ? undefined : { opacity: [0.96, 1], y: [12, 0] }}
			className="relative isolate overflow-hidden rounded-[2rem] border border-border/70 bg-gradient-to-br from-background via-background to-muted/25 shadow-[0_30px_120px_-70px_rgba(16,185,129,0.45)]"
			initial={reduceMotion ? false : { opacity: 0, y: 18 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
		>
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_34%)]" />
			<div className="grid gap-10 px-6 py-8 md:grid-cols-[minmax(0,1.2fr)_20rem] md:px-8 md:py-9">
				<div className="relative space-y-6">
					<div className="flex flex-wrap items-center gap-3">
						<Badge
							className="rounded-full border-cyan-500/20 bg-cyan-500/8 px-3 py-1 text-[11px] text-cyan-700 uppercase tracking-[0.2em] dark:text-cyan-300"
							variant="outline"
						>
							{eyebrow}
						</Badge>
						<Badge className="rounded-full px-3 py-1" variant="secondary">
							{toneLabel}
						</Badge>
					</div>
					<div className="max-w-2xl space-y-3">
						<h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
							{title}
						</h1>
						<p className="max-w-xl text-base/7 text-muted-foreground md:text-[15px]">
							{description}
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						{variant === "record" && entity ? (
							<Button asChild className="rounded-full px-5" size="sm">
								<Link
									params={{ entitytype: entity.entityType }}
									search={EMPTY_ADMIN_DETAIL_SEARCH}
									to="/admin/$entitytype"
									viewTransition
								>
									<ArrowLeft className="size-4" />
									Back to {entity.pluralLabel}
								</Link>
							</Button>
						) : null}
						<Button
							asChild
							className="rounded-full px-5"
							size="sm"
							variant="outline"
						>
							<Link
								search={EMPTY_ADMIN_DETAIL_SEARCH}
								to="/admin"
								viewTransition
							>
								<Home className="size-4" />
								Open dashboard
							</Link>
						</Button>
					</div>
					<div className="grid gap-3 md:grid-cols-3">
						<AdminFallbackSignalCard
							label="Requested entity"
							value={entityLabel}
						/>
						<AdminFallbackSignalCard
							label="Requested record"
							value={recordId ?? "None"}
						/>
						<AdminFallbackSignalCard
							label="Recommended move"
							value={
								variant === "record"
									? "Return to collection"
									: "Choose a known destination"
							}
						/>
					</div>
					<div className="space-y-3">
						<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
							Try one of these
						</p>
						<div className="flex flex-wrap gap-2.5">
							{knownDestinations.map((item, index) => (
								<motion.div
									animate={
										reduceMotion ? undefined : { opacity: [0, 1], y: [8, 0] }
									}
									initial={reduceMotion ? false : { opacity: 0, y: 8 }}
									key={item.route}
									transition={{
										delay: reduceMotion ? 0 : 0.08 * index,
										duration: 0.28,
										ease: "easeOut",
									}}
								>
									<Button
										asChild
										className="rounded-full border-border/70 bg-background/80 px-3.5 shadow-none hover:bg-accent/70"
										size="sm"
										variant="outline"
									>
										{item.kind === "entity" ? (
											<Link
												params={{ entitytype: item.entityType }}
												search={EMPTY_ADMIN_DETAIL_SEARCH}
												to="/admin/$entitytype"
												viewTransition
											>
												<EntityIcon
													className="size-4"
													iconName={item.iconName}
												/>
												{item.label}
											</Link>
										) : (
											<Link
												search={EMPTY_ADMIN_DETAIL_SEARCH}
												to={item.route}
												viewTransition
											>
												<EntityIcon
													className="size-4"
													iconName={item.iconName}
												/>
												{item.label}
											</Link>
										)}
									</Button>
								</motion.div>
							))}
						</div>
					</div>
				</div>
				<div className="relative flex items-center justify-center">
					<div className="relative w-full rounded-[1.75rem] border border-border/70 bg-background/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
						<AdminFallbackVisual
							iconName={entity?.iconName}
							label={toneLabel}
							reduceMotion={reduceMotion}
							variant={variant}
						/>
						<div className="mt-6 space-y-3">
							<AdminFallbackStatusRow
								label="Route state"
								status={
									variant === "record"
										? "Record lookup failed"
										: "Unknown registry key"
								}
							/>
							<AdminFallbackStatusRow
								label="URL target"
								status={
									variant === "record"
										? (recordId ?? "Unavailable")
										: entityType
								}
							/>
							<AdminFallbackStatusRow
								label="Recovery path"
								status={
									variant === "record"
										? "Collection view is ready"
										: "Dashboard and known entities are available"
								}
							/>
						</div>
					</div>
				</div>
			</div>
		</motion.section>
	);
}

function AdminFallbackSignalCard({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string;
}) {
	return (
		<div className="rounded-2xl border border-border/70 bg-background/75 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
			<p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
				{label}
			</p>
			<p className="mt-2 truncate font-medium text-sm">{value}</p>
		</div>
	);
}

function AdminFallbackStatusRow({
	label,
	status,
}: {
	readonly label: string;
	readonly status: string;
}) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/25 px-4 py-3">
			<div className="space-y-1">
				<p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
					{label}
				</p>
				<p className={cn("font-medium text-sm")}>{status}</p>
			</div>
			<div className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
				<Sparkles className="size-4 text-emerald-500" />
			</div>
		</div>
	);
}
