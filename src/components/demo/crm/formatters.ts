const integerFormatter = new Intl.NumberFormat("en-US");

export function formatReadCount(count: number | null): string {
	if (count === null) {
		return "Pending";
	}

	return `${integerFormatter.format(count)} reads`;
}

export function formatRenderTime(milliseconds: number | null): string {
	if (milliseconds === null) {
		return "Pending";
	}

	if (milliseconds < 1) {
		return "<1 ms";
	}

	if (milliseconds < 1000) {
		return `${Math.round(milliseconds)} ms`;
	}

	return `${(milliseconds / 1000).toFixed(2)} s`;
}

export function formatMetricTimestamp(timestamp: number | null): string {
	if (timestamp === null) {
		return "No measurements yet";
	}

	return new Date(timestamp).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	});
}

export function formatShapeStatus(match: boolean | null): string {
	if (match === null) {
		return "Not compared";
	}

	return match ? "Shape match" : "Shape mismatch";
}
