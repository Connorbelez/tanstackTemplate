/**
 * StatusBadge Component
 *
 * Display status indicators for listings, positions, etc.
 *
 * Used in: ListingCard, PositionsTable
 */
export type StatusType =
	| "active"
	| "pending"
	| "funded"
	| "closed"
	| "paid"
	| "overdue"
	| "success"
	| "warning"
	| "error";

export interface StatusBadgeProps {
	label?: string;
	size?: "sm" | "md" | "lg";
	status: StatusType;
}

export function StatusBadge({
	status: _status,
	label: _label,
	size: _size = "md",
}: StatusBadgeProps) {
	// Implementation placeholder - design analysis only
	throw new Error("StatusBadge not implemented yet");
}
