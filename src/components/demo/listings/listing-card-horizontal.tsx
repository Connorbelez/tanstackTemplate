import {
	CalendarDays,
	CircleDollarSign,
	CirclePercent,
	Lock,
	MapPin,
} from "lucide-react";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { OwnershipBar } from "./OwnershipBar";

export interface HorizontalProps {
	address?: string;
	apr?: number;
	availablePercent?: number;
	id?: string;
	imageSrc?: string;
	locked?: boolean;
	lockedPercent?: number;
	ltv?: number;
	marketValue?: number;
	maturityDate?: string;
	principal?: number;
	propertyType?: string;
	soldPercent?: number;
	title?: string;
}

export function Horizontal({
	title = "Malibu Beach Detached",
	address = "Malibu, CA",
	imageSrc,
	ltv = 80,
	apr = 9.5,
	principal = 350_000,
	marketValue = 500_000,
	propertyType,
	maturityDate = "01/01/2026",
	locked = false,
	availablePercent = 100,
	lockedPercent = 0,
	soldPercent = 0,
}: HorizontalProps = {}) {
	return (
		<Card className="w-full min-w-0 max-w-full gap-0 overflow-hidden border-none bg-opacity-0 px-4 py-4 shadow-none transition-all duration-300 hover:scale-[1.03] hover:shadow-black/10 hover:shadow-lg active:scale-100">
			<CardContent className="min-w-0 p-0">
				<div className="flex min-w-0 flex-col gap-4 md:flex-row">
					<div className="relative aspect-video w-full min-w-0 shrink-0 overflow-hidden rounded-2xl md:aspect-square md:max-w-[180px] xl:aspect-auto">
						{imageSrc ? (
							<img
								alt={`${title} thumbnail`}
								className="pointer-events-none h-full w-full select-none rounded-xl object-cover transition-all duration-300 hover:scale-105"
								height={540}
								src={imageSrc}
								width={720}
							/>
						) : null}
						{locked ? (
							<div className="absolute top-2 left-2">
								<Badge className="gap-1" variant="destructive">
									<Lock className="h-3 w-3" />
									Locked
								</Badge>
							</div>
						) : null}
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-3">
						<CardHeader className="min-w-0 space-y-1 p-0">
							<CardTitle className="wrap-break-word line-clamp-2 leading-tight">
								{title}
							</CardTitle>
							<CardDescription className="flex w-full min-w-0 items-center gap-2 align-middle text-foreground/70">
								<MapPin className="h-4 w-4 shrink-0" />
								<span className="min-w-0 truncate">
									{address}
									{propertyType ? ` • ${propertyType}` : ""}
								</span>
							</CardDescription>
						</CardHeader>
						<div className="grid min-w-0 grid-cols-3 gap-x-1 gap-y-2 text-muted-foreground text-sm sm:flex sm:items-center sm:justify-around sm:gap-3 lg:gap-2 xl:flex min-[98rem]:grid min-[98rem]:grid-cols-2">
							<span className="flex min-w-0 items-center">
								<CirclePercent className="h-5 w-5 shrink-0" />
								<span className="ml-1 flex min-w-0 flex-col justify-around py-1 align-middle sm:ml-2">
									<CardDescription className="text-xs">LTFV</CardDescription>
									<span className="font-bold text-sm tabular-nums">{ltv}</span>
								</span>
							</span>
							<Separator
								className="hidden h-8 bg-foreground/30 sm:block xl:block min-[98rem]:hidden"
								orientation="vertical"
							/>
							<span className="flex min-w-0 items-center">
								<CirclePercent className="h-5 w-5 shrink-0" />
								<span className="ml-1 flex min-w-0 flex-col justify-around py-1 align-middle sm:ml-2">
									<CardDescription className="text-xs">APR</CardDescription>
									<span className="font-bold text-sm tabular-nums">{apr}</span>
								</span>
							</span>
							<Separator
								className="hidden h-8 bg-foreground/30 sm:block xl:block min-[98rem]:hidden"
								orientation="vertical"
							/>
							<span className="flex min-w-0 items-center">
								<CircleDollarSign className="h-5 w-5 shrink-0" />
								<span className="ml-1 flex min-w-0 flex-col justify-around py-1 align-middle sm:ml-2">
									<CardDescription className="text-xs">
										Principal
									</CardDescription>
									<span className="font-bold text-sm tabular-nums">
										{(principal / 1000).toFixed(0)}K
									</span>
								</span>
							</span>
							<Separator
								className="hidden h-8 bg-foreground/30 lg:block xl:block min-[98rem]:hidden"
								orientation="vertical"
							/>
							<span className="col-span-3 hidden min-w-0 items-center lg:col-span-1 lg:flex">
								<CircleDollarSign className="h-5 w-5 shrink-0" />
								<span className="ml-1 flex min-w-0 flex-col justify-around py-1 align-middle sm:ml-2">
									<CardDescription className="text-xs">
										Market Value
									</CardDescription>
									<span className="font-bold text-sm tabular-nums">
										{(marketValue / 1000).toFixed(0)}K
									</span>
								</span>
							</span>
						</div>
						<CardFooter className="mt-auto flex w-full min-w-0 flex-row items-center justify-between gap-2 border-0 p-0">
							<div className="flex min-w-0 shrink-0 flex-col">
								<CardDescription className="flex items-center text-foreground/50">
									<CalendarDays className="mr-1 h-4 w-4" />
									Maturity
								</CardDescription>
								<span className="font-medium text-foreground/60 text-sm">
									{maturityDate}
								</span>
							</div>
							<div className="min-w-0 max-w-[55%] flex-1 sm:max-w-none">
								<OwnershipBar
									availablePercent={availablePercent}
									lockedPercent={lockedPercent}
									soldPercent={soldPercent}
								/>
							</div>
						</CardFooter>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
