/**
 * Timeline Component
 *
 * Activity feed/timeline for recent events.
 *
 * Located on: Lender Portfolio Dashboard
 */
export interface TimelineEvent {
	amount?: number;
	date: string;
	description?: string;
	id: string;
	title: string;
	type: "payment" | "investment" | "maturity" | "document" | "system";
}

export interface TimelineProps {
	events: TimelineEvent[];
	limit?: number;
	onEventClick?: (event: TimelineEvent) => void;
}

export function Timeline({
	events: _events,
	limit: _limit,
	onEventClick: _onEventClick,
}: TimelineProps) {
	// Implementation placeholder - design analysis only
	throw new Error("Timeline not implemented yet");
}
