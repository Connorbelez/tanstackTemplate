import { CircleDollarSign, CirclePercent, MapPin } from "lucide-react";

interface ListingMapPopupProps {
	address: string;
	apr: number;
	imageSrc?: string;
	principal: number;
	title: string;
}

export function ListingMapPopup({
	title,
	address,
	principal,
	apr,
	imageSrc,
}: ListingMapPopupProps) {
	return (
		<div className="w-[280px] overflow-hidden rounded-xl bg-background shadow-lg">
			{imageSrc ? (
				<div className="relative h-32 w-full overflow-hidden">
					<img
						alt={title}
						className="h-full w-full object-cover"
						height={128}
						src={imageSrc}
						width={280}
					/>
				</div>
			) : null}

			<div className="space-y-2 p-3">
				<div>
					<h3 className="line-clamp-1 font-semibold text-sm">{title}</h3>
					<p className="flex items-center gap-1 text-muted-foreground text-xs">
						<MapPin className="h-3 w-3" />
						{address}
					</p>
				</div>

				<div className="flex items-center gap-4 text-xs">
					<div className="flex items-center gap-1">
						<CircleDollarSign className="h-4 w-4" />
						<span className="font-semibold">
							${(principal / 1000).toFixed(0)}K
						</span>
					</div>
					<div className="flex items-center gap-1">
						<CirclePercent className="h-4 w-4" />
						<span className="font-semibold">{apr}% APR</span>
					</div>
				</div>
			</div>
		</div>
	);
}
