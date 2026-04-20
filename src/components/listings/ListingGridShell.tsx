import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Map as MapIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "#/components/ui/drawer";
import ProgressiveBlur from "#/components/ui/progressive-blur";
import { ScrollArea } from "#/components/ui/scroll-area";
import { useIsMobile } from "#/hooks/use-mobile";
import {
	useViewportFilteredItems,
	type WithLatLng,
} from "./hooks/use-filtered-listings";
import {
	ListingMap,
	type ListingMapProps,
	type ViewportBounds,
} from "./ListingMap";
import {
	MobileListingScroller,
	type MobileListingSection,
} from "./mobile-listing-scroller";

interface ClassNames {
	container?: string;
	gridColumn?: string;
	mapColumn?: string;
	mapWrapper?: string;
}

export interface FilterableItem extends WithLatLng {
	address?: string;
	apr?: number;
	ltv?: number;
	marketValue?: number;
	maturityDate?: Date;
	mortgageType?: string;
	principal?: number;
	propertyType?: string;
	title?: string;
}

export interface ListingGridShellProps<T extends WithLatLng> {
	classNames?: ClassNames;
	groupItemsForMobile?: (items: readonly T[]) => MobileListingSection<T>[];
	items: readonly T[];
	mapProps?: Partial<
		Omit<ListingMapProps<T>, "items" | "renderPopup" | "onViewportChange">
	>;
	renderCard: (item: T) => ReactNode;
	renderMapPopup: ListingMapProps<T>["renderPopup"];
	toolbar?: ReactNode;
}

const drawerVariants: Variants = {
	hidden: {
		y: "100%",
		opacity: 0,
		rotateX: 5,
		transition: {
			damping: 30,
			stiffness: 300,
			type: "spring",
		},
	},
	visible: {
		y: 0,
		opacity: 1,
		rotateX: 0,
		transition: {
			damping: 30,
			delayChildren: 0.2,
			mass: 0.8,
			staggerChildren: 0.07,
			stiffness: 300,
			type: "spring",
		},
	},
};

const itemVariants: Variants = {
	hidden: {
		y: 20,
		opacity: 0,
		transition: {
			damping: 30,
			stiffness: 300,
			type: "spring",
		},
	},
	visible: {
		y: 0,
		opacity: 1,
		transition: {
			damping: 30,
			mass: 0.8,
			stiffness: 300,
			type: "spring",
		},
	},
};

export function ListingGridShell<T extends WithLatLng>({
	items,
	renderCard,
	renderMapPopup,
	classNames,
	mapProps,
	groupItemsForMobile,
	toolbar,
}: ListingGridShellProps<T>) {
	const isMobile = useIsMobile();
	const [viewportBounds, setViewportBounds] = useState<
		ViewportBounds | undefined
	>(undefined);
	const [isMapDrawerOpen, setIsMapDrawerOpen] = useState(false);
	const filteredItems = useViewportFilteredItems(items, viewportBounds);

	const mobileSections = useMemo(() => {
		if (filteredItems.length === 0) {
			return [];
		}

		if (groupItemsForMobile) {
			const grouped = groupItemsForMobile(filteredItems);
			return grouped.length > 0
				? grouped
				: [{ title: "All Listings", items: filteredItems }];
		}

		return [{ title: "All Listings", items: filteredItems }];
	}, [filteredItems, groupItemsForMobile]);

	const handleViewportChange = useCallback((bounds: ViewportBounds) => {
		setViewportBounds(bounds);
	}, []);

	if (isMobile) {
		return (
			<div className={classNames?.container}>
				<div className="space-y-4 px-4">
					{toolbar}
					<div className={classNames?.gridColumn}>
						<MobileListingScroller
							renderCard={renderCard}
							sections={mobileSections}
						/>
					</div>

					<div className="fixed right-6 bottom-6 z-40">
						<Drawer onOpenChange={setIsMapDrawerOpen} open={isMapDrawerOpen}>
							<DrawerTrigger asChild>
								<Button
									aria-label="Open map view"
									className="h-14 w-14 rounded-full p-0 shadow-lg"
									size="lg"
								>
									<MapIcon aria-hidden="true" className="h-6 w-6" />
								</Button>
							</DrawerTrigger>
							<DrawerContent className="h-[85vh] rounded-t-2xl">
								<motion.div
									animate="visible"
									className="flex h-full flex-col"
									initial="hidden"
									variants={drawerVariants}
								>
									<motion.div variants={itemVariants}>
										<DrawerHeader>
											<DrawerTitle>Map View</DrawerTitle>
										</DrawerHeader>
									</motion.div>
									<motion.div
										className="min-h-0 flex-1 px-4 pb-4"
										variants={itemVariants}
									>
										<div className="h-full">
											<ListingMap
												className="h-full w-full rounded-lg"
												items={filteredItems}
												onViewportChange={handleViewportChange}
												renderPopup={renderMapPopup}
												{...mapProps}
											/>
										</div>
									</motion.div>
								</motion.div>
							</DrawerContent>
						</Drawer>
					</div>
				</div>
			</div>
		);
	}

	return (
		<section
			className={
				classNames?.container ?? "grid w-full grid-cols-12 gap-x-4 pt-4"
			}
		>
			<div className={classNames?.gridColumn ?? "col-span-8"}>
				{toolbar ? <div className="mb-4 px-8">{toolbar}</div> : null}
				<ScrollArea className="relative h-[calc(100vh-7rem)]">
					<ProgressiveBlur />
					<div className="grid grid-cols-1 gap-3 px-4 pt-4 pb-32 min-[98rem]:grid-cols-2">
						<AnimatePresence mode="popLayout">
							{filteredItems.map((item, index) => {
								const key =
									(item as { id?: string | number }).id ?? `listing-${index}`;

								return (
									<motion.div
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, scale: 0.95 }}
										initial={{ opacity: 0, y: 20 }}
										key={key}
										layout
										transition={{ duration: 0.2 }}
									>
										{renderCard(item)}
									</motion.div>
								);
							})}
						</AnimatePresence>
					</div>
				</ScrollArea>
			</div>

			<div className={classNames?.mapColumn ?? "col-span-4 pr-4"}>
				<div
					className={
						classNames?.mapWrapper ?? "sticky top-24 h-[calc(100vh-8rem)]"
					}
				>
					<ListingMap
						className="mt-4 h-[calc(100vh-9rem)]"
						items={filteredItems}
						onViewportChange={handleViewportChange}
						renderPopup={renderMapPopup}
						{...mapProps}
					/>
				</div>
			</div>
		</section>
	);
}

ListingGridShell.displayName = "ListingGridShell";
