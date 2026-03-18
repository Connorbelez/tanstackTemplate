/**
 * FilterChip Component
 *
 * Active filter tag/chip for displaying selected filters.
 *
 * Used in: ListingsPage, ListingDetailPage
 */
export interface FilterChipProps {
	label: string;
	onRemove?: () => void;
	value?: string;
}

export function FilterChip({
	label: _label,
	value: _value,
	onRemove: _onRemove,
}: FilterChipProps) {
	// Implementation placeholder - design analysis only
	throw new Error("FilterChip not implemented yet");
}
