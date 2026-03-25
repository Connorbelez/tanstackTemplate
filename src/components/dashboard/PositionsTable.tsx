/**
 * PositionsTable Component
 *
 * Holdings data table with sorting for loan positions.
 *
 * Located on: Lender Portfolio Dashboard
 */
export interface Position {
	currentValue: number;
	id: string;
	investmentAmount: number;
	maturityDate?: string;
	propertyName: string;
	return: number;
	status: "active" | "paid" | "pending";
}

export interface PositionsTableProps {
	onPositionClick?: (position: Position) => void;
	onSort?: (column: keyof Position) => void;
	positions: Position[];
	sortBy?: keyof Position;
	sortDirection?: "asc" | "desc";
}

export function PositionsTable({
	positions: _positions,
	sortBy: _sortBy,
	sortDirection: _sortDirection = "asc",
	onSort: _onSort,
	onPositionClick: _onPositionClick,
}: PositionsTableProps) {
	// Implementation placeholder - design analysis only
	throw new Error("PositionsTable not implemented yet");
}
