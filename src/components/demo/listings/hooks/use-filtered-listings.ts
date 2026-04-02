import { useMemo } from "react";
import type { ViewportBounds } from "../ListingMap";

export interface WithLatLng {
	lat: number;
	lng: number;
}

export function useViewportFilteredItems<T extends WithLatLng>(
	items: readonly T[],
	bounds: ViewportBounds | undefined
): readonly T[] {
	return useMemo(() => {
		if (!bounds) {
			return items;
		}

		const { minLat, maxLat, minLng, maxLng } = bounds;

		return items.filter((item) => {
			if (!(Number.isFinite(item.lat) && Number.isFinite(item.lng))) {
				return false;
			}

			return (
				item.lat >= minLat &&
				item.lat <= maxLat &&
				item.lng >= minLng &&
				item.lng <= maxLng
			);
		});
	}, [items, bounds]);
}
