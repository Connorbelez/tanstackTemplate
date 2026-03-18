/**
 * StatCard Component
 *
 * Single metric display card for dashboard stats.
 *
 * Located on: Lender Portfolio Dashboard (StatsRow)
 */
export interface StatCardProps {
	format?: "currency" | "percent" | "number";
	icon?: string;
	label: string;
	trend?: {
		value: number;
		direction: "up" | "down" | "neutral";
	};
	value: string | number;
	variant?: "default" | "highlight";
}

export function StatCard({
	label: _label,
	value: _value,
	format: _format = "number",
	trend: _trend,
	icon: _icon,
	variant: _variant = "default",
}: StatCardProps) {
	// Implementation placeholder - design analysis only
	throw new Error("StatCard not implemented yet");
}
