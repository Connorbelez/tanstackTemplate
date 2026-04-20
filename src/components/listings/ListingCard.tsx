import { Heart, MapPin, TrendingUp } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { cn } from "#/lib/utils";

export interface ListingCardMetrics {
	ltv: number;
	rate: number;
	term: number;
}

export interface ListingCardProps {
	address?: string;
	description?: string;
	id: string;
	image?: string;
	metrics: ListingCardMetrics;
	onClick?: () => void;
	onFavorite?: () => void;
	price: number;
	status?: "active" | "pending" | "funded" | "closed";
	title: string;
}

const STATUS_LABELS: Record<
	NonNullable<ListingCardProps["status"]>,
	{ className: string; label: string }
> = {
	active: {
		className:
			"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
		label: "Active",
	},
	pending: {
		className:
			"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
		label: "Pending",
	},
	funded: {
		className:
			"border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300",
		label: "Funded",
	},
	closed: {
		className:
			"border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
		label: "Closed",
	},
};

function formatCurrency(value: number) {
	return new Intl.NumberFormat("en-US", {
		currency: "USD",
		maximumFractionDigits: 0,
		style: "currency",
	}).format(value);
}

export function ListingCard({
	title,
	price,
	image,
	status = "active",
	metrics,
	address,
	description,
	onClick,
	onFavorite,
}: ListingCardProps) {
	const statusDisplay = STATUS_LABELS[status];

	return (
		<Card
			className={cn(
				"group overflow-hidden border-border/70 bg-card/95 shadow-sm transition-all duration-300",
				onClick ? "cursor-pointer hover:-translate-y-1 hover:shadow-xl" : ""
			)}
			onClick={onClick}
			role={onClick ? "button" : undefined}
			tabIndex={onClick ? 0 : undefined}
		>
			<div className="relative aspect-[4/3] overflow-hidden bg-muted">
				{image ? (
					<img
						alt={title}
						className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
						height={720}
						src={image}
						width={960}
					/>
				) : (
					<div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_55%)] text-muted-foreground text-sm">
						Image coming soon
					</div>
				)}

				<div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
					<span
						className={cn(
							"rounded-full border px-3 py-1 font-medium text-xs backdrop-blur-sm",
							statusDisplay.className
						)}
					>
						{statusDisplay.label}
					</span>
					{onFavorite ? (
						<Button
							aria-label="Save listing"
							className="rounded-full bg-background/90 shadow-sm backdrop-blur-sm"
							onClick={(event) => {
								event.stopPropagation();
								onFavorite();
							}}
							size="icon"
							type="button"
							variant="ghost"
						>
							<Heart className="size-4" />
						</Button>
					) : null}
				</div>
			</div>

			<CardContent className="space-y-4 p-5">
				<div className="space-y-2">
					<p className="font-semibold text-2xl tracking-tight">
						{formatCurrency(price)}
					</p>
					<h3 className="line-clamp-2 font-semibold text-base leading-6">
						{title}
					</h3>
					{address ? (
						<p className="flex items-center gap-2 text-muted-foreground text-sm">
							<MapPin className="size-4 shrink-0" />
							<span className="truncate">{address}</span>
						</p>
					) : null}
				</div>

				<div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/60 p-3">
					<div className="rounded-xl bg-background/80 px-3 py-2">
						<p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
							LTV
						</p>
						<p className="mt-1 font-semibold text-sm">{metrics.ltv}%</p>
					</div>
					<div className="rounded-xl bg-background/80 px-3 py-2">
						<p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
							Rate
						</p>
						<p className="mt-1 flex items-center gap-1 font-semibold text-sm">
							<TrendingUp className="size-3.5" />
							{metrics.rate}%
						</p>
					</div>
					<div className="rounded-xl bg-background/80 px-3 py-2">
						<p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
							Term
						</p>
						<p className="mt-1 font-semibold text-sm">{metrics.term} mo</p>
					</div>
				</div>

				{description ? (
					<p className="line-clamp-2 text-muted-foreground text-sm leading-6">
						{description}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
