import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cn } from "#/lib/utils";

export interface LatLng {
	lat: number;
	lng: number;
}

export interface ViewportBounds {
	maxLat: number;
	maxLng: number;
	minLat: number;
	minLng: number;
}

export interface ListingMapProps<T extends LatLng> {
	className?: string;
	containerClassName?: string;
	initialCenter?: { lat: number; lng: number };
	initialZoom?: number;
	items: readonly T[];
	mapClassName?: string;
	onViewportChange?: (bounds: ViewportBounds) => void;
	renderPopup: (item: T) => React.ReactNode;
	style?: React.CSSProperties;
}

interface ManagedMarker {
	marker: mapboxgl.Marker;
	popup?: mapboxgl.Popup;
	root?: Root;
}

const DEFAULT_CENTER = { lat: 43.6532, lng: -79.3832 };
const DEFAULT_ZOOM = 4;
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function toBounds(map: mapboxgl.Map): ViewportBounds {
	const bounds = map.getBounds();
	if (!bounds) {
		return {
			minLat: -90,
			maxLat: 90,
			minLng: -180,
			maxLng: 180,
		};
	}

	return {
		minLat: bounds.getSouth(),
		maxLat: bounds.getNorth(),
		minLng: bounds.getWest(),
		maxLng: bounds.getEast(),
	};
}

export function ListingMap<T extends LatLng>({
	items,
	renderPopup,
	onViewportChange,
	initialCenter = DEFAULT_CENTER,
	initialZoom = DEFAULT_ZOOM,
	className,
	containerClassName,
	style,
	mapClassName,
}: ListingMapProps<T>) {
	const mapContainerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<mapboxgl.Map | null>(null);
	const markersRef = useRef<ManagedMarker[]>([]);
	const onViewportChangeRef = useRef(onViewportChange);
	const renderPopupRef = useRef(renderPopup);
	const [isMapLoaded, setIsMapLoaded] = useState(false);
	const hasSetInitialViewRef = useRef(false);

	useEffect(() => {
		onViewportChangeRef.current = onViewportChange;
		renderPopupRef.current = renderPopup;
	}, [onViewportChange, renderPopup]);

	useEffect(() => {
		if (!(mapContainerRef.current && MAPBOX_TOKEN)) {
			return;
		}

		mapboxgl.accessToken = MAPBOX_TOKEN;

		const map = new mapboxgl.Map({
			container: mapContainerRef.current,
			style: "mapbox://styles/mapbox/streets-v12",
			center: [initialCenter.lng, initialCenter.lat],
			zoom: initialZoom,
		});

		mapRef.current = map;
		map.addControl(new mapboxgl.NavigationControl(), "top-right");

		map.on("load", () => {
			setIsMapLoaded(true);

			onViewportChangeRef.current?.(toBounds(map));
		});

		map.on("moveend", () => {
			onViewportChangeRef.current?.(toBounds(map));
		});

		return () => {
			for (const { marker, popup, root } of markersRef.current) {
				marker.remove();
				popup?.remove();
				root?.unmount();
			}
			markersRef.current = [];
			setIsMapLoaded(false);

			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [initialCenter.lat, initialCenter.lng, initialZoom]);

	useEffect(() => {
		if (!(mapRef.current && isMapLoaded)) {
			return;
		}

		for (const { marker, popup, root } of markersRef.current) {
			marker.remove();
			popup?.remove();
			if (root) {
				queueMicrotask(() => root.unmount());
			}
		}
		markersRef.current = [];

		for (const item of items) {
			const popupContainer = document.createElement("div");
			const root = createRoot(popupContainer);
			root.render(renderPopupRef.current(item));

			const popup = new mapboxgl.Popup({
				offset: 25,
				closeButton: true,
				closeOnClick: false,
			}).setDOMContent(popupContainer);

			const markerElement = document.createElement("div");
			markerElement.className = "custom-marker";
			markerElement.style.cursor = "pointer";

			const pinElement = document.createElement("div");
			pinElement.style.cssText = `
        width: 24px;
        height: 24px;
        background-color: #3b82f6;
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
      `;
			markerElement.appendChild(pinElement);

			markerElement.addEventListener("mouseenter", () => {
				pinElement.style.transform = "scale(1.2)";
				pinElement.style.backgroundColor = "#1d4ed8";
			});

			markerElement.addEventListener("mouseleave", () => {
				pinElement.style.transform = "scale(1)";
				pinElement.style.backgroundColor = "#3b82f6";
			});

			const marker = new mapboxgl.Marker(markerElement)
				.setLngLat([item.lng, item.lat])
				.setPopup(popup)
				.addTo(mapRef.current);

			markersRef.current.push({ marker, popup, root });
		}

		if (items.length > 0 && !hasSetInitialViewRef.current) {
			const bounds = new mapboxgl.LngLatBounds();

			for (const item of items) {
				if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
					bounds.extend([item.lng, item.lat]);
				}
			}

			if (!bounds.isEmpty()) {
				mapRef.current.fitBounds(bounds, {
					duration: 2500,
					maxZoom: 12,
				});
				hasSetInitialViewRef.current = true;
			}
		}
	}, [items, isMapLoaded]);

	if (!MAPBOX_TOKEN) {
		return (
			<div
				className={cn(
					"relative flex h-full min-h-80 w-full items-center justify-center overflow-hidden rounded-xl border border-border border-dashed bg-card/60 p-6 text-center",
					containerClassName
				)}
			>
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_55%)]" />
				<div className="relative max-w-sm space-y-2">
					<p className="font-semibold text-lg">Map unavailable</p>
					<p className="text-muted-foreground text-sm">
						Set <code>VITE_MAPBOX_TOKEN</code> to enable the copied Mapbox
						experience for this demo.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn("relative h-full w-full md:h-[80vh]", containerClassName)}
		>
			<div
				className={cn("h-full w-full rounded-xl", mapClassName, className)}
				ref={mapContainerRef}
				style={style}
			/>
		</div>
	);
}
