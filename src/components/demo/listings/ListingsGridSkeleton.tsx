import ProgressiveBlur from "#/components/ui/progressive-blur";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";

export function ListingsGridSkeleton() {
	return (
		<section className="grid w-full grid-cols-12 gap-x-4 pt-4">
			<div className="col-span-8">
				<ScrollArea className="relative h-[calc(100vh-7rem)]">
					<ProgressiveBlur />
					<div className="grid grid-cols-1 gap-3 px-4 pt-4 pb-32 min-[98rem]:grid-cols-2">
						{Array.from({ length: 10 }, (_, index) => index).map((item) => (
							<div
								className="space-y-3 rounded-[1.35rem] border p-4"
								key={item}
							>
								<div className="flex min-w-0 flex-col gap-4 md:flex-row">
									<Skeleton className="h-48 w-full shrink-0 rounded-[1rem] md:w-[180px]" />
									<div className="flex-1 space-y-3 overflow-hidden">
										<Skeleton className="h-6 w-3/4" />
										<Skeleton className="h-4 w-1/2" />
										<div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
											<Skeleton className="h-14 w-full" />
											<Skeleton className="h-14 w-full" />
											<Skeleton className="h-14 w-full" />
											<Skeleton className="h-14 w-full" />
										</div>
										<div className="flex items-center justify-between">
											<Skeleton className="h-10 w-24" />
											<Skeleton className="h-8 w-24" />
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</ScrollArea>
			</div>

			<div className="col-span-4 pr-4">
				<div className="sticky top-24 h-[calc(100vh-8rem)]">
					<Skeleton className="mt-4 h-[calc(100vh-9rem)] w-full rounded-xl" />
				</div>
			</div>
		</section>
	);
}
