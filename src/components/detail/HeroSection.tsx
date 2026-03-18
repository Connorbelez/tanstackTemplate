export interface HeroSectionProps {
	address?: string;
	images: string[];
	mapLocation?: { lat: number; lng: number };
	onImageClick?: (index: number) => void;
	onMapClick?: () => void;
	title: string;
}

export function HeroSection({
	images: _images,
	title: _title,
	address: _address,
	mapLocation: _mapLocation,
	onImageClick: _onImageClick,
	onMapClick: _onMapClick,
}: HeroSectionProps) {
	// Implementation placeholder - design analysis only
	throw new Error("HeroSection not implemented yet");
}
