import { PieChart } from "lucide-react";

interface OwnershipBarProps {
	availablePercent: number;
	lockedPercent: number;
	soldPercent: number;
}

export function OwnershipBar({
	availablePercent = 100,
	lockedPercent = 0,
	soldPercent = 0,
}: OwnershipBarProps) {
	const total = availablePercent + lockedPercent + soldPercent;
	const available = total > 0 ? (availablePercent / total) * 100 : 100;
	const locked = total > 0 ? (lockedPercent / total) * 100 : 0;
	const sold = total > 0 ? (soldPercent / total) * 100 : 0;

	return (
		<div className="flex w-full min-w-0 flex-col">
			<span className="flex items-center text-foreground/55 text-sm">
				<PieChart className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
				<p className="min-w-0 truncate text-foreground/50 text-xs">Available</p>
			</span>
			<span className="ml-0 flex min-w-0 flex-col justify-around py-1 sm:ml-2">
				<div className="flex min-w-0 items-center gap-2">
					<p className="shrink-0 font-semibold text-emerald-500 text-sm tabular-nums">
						{Math.round(availablePercent)}%
					</p>
					<div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
						{sold > 0 && (
							<div
								className="h-full bg-zinc-500"
								style={{ width: `${sold}%` }}
							/>
						)}
						{locked > 0 && (
							<div
								className="h-full bg-amber-500"
								style={{ width: `${locked}%` }}
							/>
						)}
						{available > 0 && (
							<div
								className="h-full bg-emerald-500"
								style={{ width: `${available}%` }}
							/>
						)}
					</div>
				</div>
				{lockedPercent > 0 ? (
					<p className="text-[10px] text-amber-500">
						{Math.round(lockedPercent)}% locked
					</p>
				) : null}
			</span>
		</div>
	);
}
