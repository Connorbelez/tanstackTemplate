import {
	Activity,
	ArrowRight,
	BadgeDollarSign,
	Clock3,
	ShieldAlert,
	Sparkles,
	Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { cn } from "#/lib/utils";

export interface CountBadgeItem {
	label: string;
	value: number | string;
}

export interface ScenarioCardModel {
	description: string;
	href?: string;
	key: string;
	ready: boolean;
	title: string;
	tone: string;
}

export function formatCurrency(value: number) {
	return new Intl.NumberFormat("en-CA", {
		style: "currency",
		currency: "CAD",
		maximumFractionDigits: 2,
	}).format(value);
}

export function formatDateTime(value?: number) {
	if (!value) {
		return "Not recorded";
	}

	return new Intl.DateTimeFormat("en-CA", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

export function formatDateOnly(value?: number | string) {
	if (value === undefined) {
		return "Not scheduled";
	}

	const date = typeof value === "string" ? new Date(value) : new Date(value);
	return new Intl.DateTimeFormat("en-CA", {
		dateStyle: "medium",
	}).format(date);
}

export function formatPercent(value: number) {
	return `${value.toFixed(2)}%`;
}

export function statusBadgeClass(status?: string) {
	switch (status) {
		case "active":
		case "completed":
		case "confirmed":
			return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
		case "planned":
		case "initiated":
		case "executing":
		case "draft":
			return "border-sky-500/30 bg-sky-500/10 text-sky-200";
		case "overdue":
		case "require_operator_review":
		case "permanent_fail":
			return "border-amber-500/30 bg-amber-500/10 text-amber-200";
		case "suppressed":
		case "failed":
		case "cancelled":
		case "archived":
		case "disabled":
		case "rejected":
			return "border-rose-500/30 bg-rose-500/10 text-rose-200";
		case "defer":
		case "deferred":
			return "border-violet-500/30 bg-violet-500/10 text-violet-200";
		case "rescheduled":
			return "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200";
		default:
			return "border-white/15 bg-white/8 text-white/72";
	}
}

export function scenarioToneClass(tone: string) {
	switch (tone) {
		case "emerald":
			return "from-emerald-500/20 via-emerald-400/8 to-transparent";
		case "amber":
			return "from-amber-500/20 via-amber-400/8 to-transparent";
		case "rose":
			return "from-rose-500/20 via-rose-400/8 to-transparent";
		case "violet":
			return "from-violet-500/20 via-violet-400/8 to-transparent";
		case "cyan":
			return "from-cyan-500/20 via-cyan-400/8 to-transparent";
		case "slate":
			return "from-slate-400/20 via-slate-300/8 to-transparent";
		default:
			return "from-white/15 via-white/5 to-transparent";
	}
}

export function buildCountBadgeItems(counts: Record<string, number>) {
	return Object.entries(counts)
		.filter(([, value]) => value > 0)
		.sort((left, right) => right[1] - left[1])
		.map(([label, value]) => ({ label, value }));
}

export function SurfaceCard({
	children,
	className,
	description,
	title,
}: {
	children: ReactNode;
	className?: string;
	description?: string;
	title: string;
}) {
	return (
		<Card
			className={cn(
				"border-white/10 bg-[radial-gradient(circle_at_top,rgba(87,211,188,0.10),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,8,23,0.92))] text-white shadow-[0_24px_80px_rgba(2,8,23,0.48)]",
				className
			)}
		>
			<CardHeader>
				<CardTitle className="font-['Iowan_Old_Style',Georgia,serif] text-2xl tracking-tight">
					{title}
				</CardTitle>
				{description ? (
					<CardDescription className="max-w-3xl text-slate-300 leading-6">
						{description}
					</CardDescription>
				) : null}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

export function LayerRail() {
	return (
		<div className="grid gap-3 lg:grid-cols-3">
			<LayerCard
				description="Borrower obligations and mortgage delinquency remain the source of truth."
				icon={BadgeDollarSign}
				label="Obligation Truth"
			/>
			<LayerCard
				description="Rules, workouts, reschedules, and plan entries describe strategy only."
				icon={Workflow}
				label="Collection Strategy"
			/>
			<LayerCard
				description="Attempts, transfers, and reconciliation describe what execution actually did."
				icon={Activity}
				label="Execution History"
			/>
		</div>
	);
}

function LayerCard({
	description,
	icon: Icon,
	label,
}: {
	description: string;
	icon: typeof BadgeDollarSign;
	label: string;
}) {
	return (
		<div className="rounded-[24px] border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
			<div className="flex items-center gap-2 text-white">
				<Icon className="size-4 text-teal-300" />
				<p className="font-medium text-sm text-white/72 uppercase tracking-[0.22em]">
					{label}
				</p>
			</div>
			<p className="mt-3 text-slate-300 text-sm leading-6">{description}</p>
		</div>
	);
}

export function CountBadgeRow({ items }: { items: CountBadgeItem[] }) {
	if (items.length === 0) {
		return (
			<p className="text-sm text-white/56">
				No active signals in this layer yet.
			</p>
		);
	}

	return (
		<div className="flex flex-wrap gap-2">
			{items.map((item) => (
				<Badge
					className="border-white/10 bg-white/8 px-3 py-1.5 text-white"
					key={item.label}
					variant="outline"
				>
					<span className="text-white/64">{item.label}</span>
					<span className="ml-2 font-semibold">{item.value}</span>
				</Badge>
			))}
		</div>
	);
}

export function ScenarioStoryCard({
	scenario,
}: {
	scenario: ScenarioCardModel;
}) {
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.45)]",
				`bg-gradient-to-br ${scenarioToneClass(scenario.tone)}`
			)}
			data-scenario-key={scenario.key}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<Badge
							className={cn(
								"border",
								statusBadgeClass(scenario.ready ? "active" : "draft")
							)}
						>
							{scenario.ready ? "Scenario ready" : "Needs prep"}
						</Badge>
						<Badge
							className="border-white/10 bg-black/20 text-white/70"
							variant="outline"
						>
							{scenario.key.replaceAll("_", " ")}
						</Badge>
					</div>
					<div>
						<h3 className="font-['Iowan_Old_Style',Georgia,serif] text-2xl text-white">
							{scenario.title}
						</h3>
						<p className="mt-2 max-w-xl text-slate-300 text-sm leading-6">
							{scenario.description}
						</p>
					</div>
				</div>
				<div className="rounded-full border border-white/10 bg-white/8 p-3">
					{scenario.ready ? (
						<Sparkles className="size-5 text-teal-200" />
					) : (
						<ShieldAlert className="size-5 text-amber-200" />
					)}
				</div>
			</div>

			<div className="mt-5 flex items-center justify-between gap-3">
				<p className="text-white/48 text-xs uppercase tracking-[0.28em]">
					Review story
				</p>
				{scenario.ready && scenario.href ? (
					<Button
						asChild
						className="rounded-full bg-white text-slate-950 hover:bg-white/90"
						size="sm"
					>
						<a href={scenario.href}>
							Open workspace
							<ArrowRight className="size-4" />
						</a>
					</Button>
				) : (
					<span className="inline-flex items-center gap-2 text-sm text-white/56">
						<Clock3 className="size-4" />
						{scenario.ready
							? "Workspace link unavailable"
							: "Waiting for seeded mortgage state"}
					</span>
				)}
			</div>
		</div>
	);
}

export function EmptySurface({
	description,
	title,
}: {
	description: string;
	title: string;
}) {
	return (
		<div className="rounded-[24px] border border-white/14 border-dashed bg-white/5 p-8 text-center text-white">
			<h3 className="font-semibold text-lg">{title}</h3>
			<p className="mt-2 text-sm text-white/64 leading-6">{description}</p>
		</div>
	);
}

export function AuthGateNotice() {
	return (
		<SurfaceCard
			description="The AMPS demo consumes admin-scoped collection contracts. Sign in as a FairLend staff admin to load live rules, plan entries, attempts, and governed actions."
			title="Admin Access Required"
		>
			<div className="flex flex-wrap items-center gap-3">
				<Badge
					className="border-amber-500/30 bg-amber-500/10 text-amber-100"
					variant="outline"
				>
					FairLend Staff admin only
				</Badge>
				<Button
					asChild
					className="rounded-full bg-white text-slate-950 hover:bg-white/90"
				>
					<a href="/sign-in">Sign in</a>
				</Button>
			</div>
		</SurfaceCard>
	);
}
