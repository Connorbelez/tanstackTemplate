import type { ReactNode } from "react";

export interface MobileListingSection<T> {
	items: readonly T[];
	title: string;
}

interface MobileListingScrollerProps<T> {
	renderCard: (item: T) => ReactNode;
	sections: MobileListingSection<T>[];
}

export function MobileListingScroller<T>({
	sections,
	renderCard,
}: MobileListingScrollerProps<T>) {
	if (sections.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-col gap-8 pb-4">
			{sections.map((section) => {
				if (section.items.length === 0) {
					return null;
				}

				return (
					<section className="mt-8 flex flex-col gap-3" key={section.title}>
						<h2 className="pl-6 font-semibold text-lg">{section.title}</h2>
						<div
							className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto pr-4 pb-2 pl-6"
							style={{
								msOverflowStyle: "none",
								scrollbarWidth: "none",
							}}
						>
							{section.items.map((item, index) => {
								const key =
									(item as { id?: string | number }).id ??
									`${section.title}-${index}`;

								return (
									<div className="w-[280px] flex-shrink-0 snap-start" key={key}>
										{renderCard(item)}
									</div>
								);
							})}
						</div>
					</section>
				);
			})}
		</div>
	);
}
