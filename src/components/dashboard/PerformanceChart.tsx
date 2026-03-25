/**
 * PerformanceChart Component
 *
 * Line/bar chart showing returns over time.
 *
 * Located on: Lender Portfolio Dashboard
 */
export interface ChartDataPoint {
	date: string;
	value: number;
}

export interface PerformanceChartProps {
	data: ChartDataPoint[];
	metric: "returns" | "value" | "payments";
	timeframe?: "1M" | "3M" | "6M" | "1Y" | "ALL";
	type?: "line" | "bar";
}

export function PerformanceChart({
	data: _data,
	type: _type = "line",
	metric: _metric,
	timeframe: _timeframe = "1Y",
}: PerformanceChartProps) {
	// Implementation placeholder - design analysis only
	throw new Error("PerformanceChart not implemented yet");
}
