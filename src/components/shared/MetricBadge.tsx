/**
 * MetricBadge Component
 *
 * Display metric values with labels (LTV, rate, term, etc).
 *
 * Used in: ListingCard, FinancialsGrid, StatCard
 */
export interface MetricBadgeProps {
	format?: "currency" | "percent" | "months" | "number";
	icon?: string;
	label: string;
	value: string | number;
	variant?: "default" | "compact" | "highlight";
}

export function MetricBadge({
	label: _label,
	value: _value,
	format: _format = "number",
	icon: _icon,
	variant: _variant = "default",
}: MetricBadgeProps) {
	// Implementation placeholder - design analysis only
	throw new Error("MetricBadge not implemented yet");
}
