import { useQuery } from "convex/react";
import {
	Activity,
	ArrowRightLeft,
	Link2,
	Pencil,
	Plus,
	Unlink2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ScrollArea } from "#/components/ui/scroll-area";
import { cn } from "#/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { ActivityEvent } from "../../../../convex/crm/types";
import { FieldDiffDisplay } from "./FieldDiffDisplay";

interface ActivityTimelineProps {
	recordId: string;
	recordKind: "record" | "native";
}

const PAGE_SIZE = 20;

const EVENT_STYLES = {
	created: {
		accentClassName:
			"border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400",
		Icon: Plus,
		label: "Created",
	},
	field_updated: {
		accentClassName:
			"border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-400",
		Icon: Pencil,
		label: "Updated",
	},
	linked: {
		accentClassName:
			"border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:text-violet-400",
		Icon: Link2,
		label: "Linked",
	},
	unlinked: {
		accentClassName:
			"border-orange-200 bg-orange-500/10 text-orange-700 dark:border-orange-900 dark:text-orange-400",
		Icon: Unlink2,
		label: "Unlinked",
	},
	status_changed: {
		accentClassName:
			"border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-400",
		Icon: ArrowRightLeft,
		label: "Status",
	},
	other: {
		accentClassName:
			"border-slate-200 bg-slate-500/10 text-slate-700 dark:border-slate-800 dark:text-slate-300",
		Icon: Activity,
		label: "Event",
	},
} as const;

export function ActivityTimeline({
	recordId,
	recordKind,
}: ActivityTimelineProps) {
	const [cursor, setCursor] = useState<string | null>(null);
	const [events, setEvents] = useState<ActivityEvent[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [isDone, setIsDone] = useState(false);
	const activeRecordRef = useRef({ recordId, recordKind });

	const page = useQuery(api.crm.activityQueries.getRecordActivity, {
		recordId,
		recordKind,
		limit: PAGE_SIZE,
		cursor: cursor ?? undefined,
	});

	useEffect(() => {
		if (!(recordId && recordKind)) {
			return;
		}

		activeRecordRef.current = { recordId, recordKind };
		setCursor(null);
		setEvents([]);
		setNextCursor(null);
		setIsDone(false);
	}, [recordId, recordKind]);

	useEffect(() => {
		if (!page) {
			return;
		}

		// Ignore stale responses from previous record context
		if (
			activeRecordRef.current.recordId !== recordId ||
			activeRecordRef.current.recordKind !== recordKind
		) {
			return;
		}

		setEvents((current) =>
			cursor === null ? page.events : mergeActivityEvents(current, page.events)
		);
		setNextCursor(page.continueCursor);
		setIsDone(page.isDone);
	}, [cursor, page, recordId, recordKind]);

	const isInitialLoading = page === undefined && events.length === 0;
	const isLoadingMore = page === undefined && events.length > 0;

	if (isInitialLoading) {
		return (
			<div className="space-y-3 rounded-lg border p-3">
				<div className="h-5 w-28 animate-pulse rounded bg-muted" />
				<div className="h-16 rounded bg-muted/70" />
				<div className="h-16 rounded bg-muted/70" />
			</div>
		);
	}

	return (
		<div className="space-y-3 rounded-lg border p-3">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h3 className="font-medium text-sm">Activity</h3>
					<p className="text-muted-foreground text-xs">
						Recent record history and link changes
					</p>
				</div>
				<Badge variant="secondary">{events.length}</Badge>
			</div>

			{events.length === 0 ? (
				<div className="rounded-md border border-dashed px-4 py-6 text-center">
					<Activity className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
					<p className="font-medium text-sm">No activity yet</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Changes to this record will appear here.
					</p>
				</div>
			) : (
				<ScrollArea className="max-h-[32rem] pr-3">
					<div className="space-y-1">
						{events.map((event, index) => (
							<ActivityEventItem
								event={event}
								isLast={index === events.length - 1}
								key={event._id}
							/>
						))}
					</div>
				</ScrollArea>
			)}

			{!isDone && (
				<Button
					disabled={isLoadingMore || nextCursor === null}
					onClick={() => {
						if (nextCursor) {
							setCursor(nextCursor);
						}
					}}
					variant="outline"
				>
					{isLoadingMore ? "Loading..." : "Load more"}
				</Button>
			)}
		</div>
	);
}

function ActivityEventItem({
	event,
	isLast,
}: {
	event: ActivityEvent;
	isLast: boolean;
}) {
	const { Icon, accentClassName, label } =
		EVENT_STYLES[event.eventType] ?? EVENT_STYLES.other;

	return (
		<div className="flex gap-3">
			<div className="flex shrink-0 flex-col items-center">
				<div
					className={cn(
						"flex h-9 w-9 items-center justify-center rounded-full border",
						accentClassName
					)}
				>
					<Icon className="h-4 w-4" />
				</div>
				{!isLast && <div className="mt-2 h-full w-px flex-1 bg-border" />}
			</div>

			<div className={cn("min-w-0 flex-1 pb-6", isLast && "pb-0")}>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<Avatar className="h-6 w-6">
								{event.actor.avatarUrl ? (
									<AvatarImage
										alt={`Avatar for ${event.actor.name}`}
										src={event.actor.avatarUrl}
									/>
								) : null}
								<AvatarFallback className="text-[10px]">
									{getInitials(event.actor.name)}
								</AvatarFallback>
							</Avatar>
							<span className="font-medium text-sm">{event.actor.name}</span>
							<Badge variant="outline">{label}</Badge>
						</div>

						<p className="mt-2 text-sm">{event.description}</p>
					</div>

					<div className="shrink-0 text-right text-muted-foreground text-xs">
						<p>{formatRelativeTime(event.timestamp)}</p>
						<p className="mt-1 hidden sm:block">
							{new Date(event.timestamp).toLocaleString()}
						</p>
					</div>
				</div>

				{event.eventType === "field_updated" && event.diff ? (
					<div className="mt-3">
						<FieldDiffDisplay diff={event.diff} />
					</div>
				) : null}
			</div>
		</div>
	);
}

function mergeActivityEvents(
	currentEvents: ActivityEvent[],
	incomingEvents: ActivityEvent[]
): ActivityEvent[] {
	const eventsById = new Map(currentEvents.map((event) => [event._id, event]));

	for (const event of incomingEvents) {
		eventsById.set(event._id, event);
	}

	return [...eventsById.values()].sort(
		(left, right) => right.timestamp - left.timestamp
	);
}

function getInitials(name: string): string {
	const initials = name
		.split(" ")
		.map((part) => part.trim()[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();

	return initials || "?";
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = Math.max(0, now - timestamp);
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) {
		return "just now";
	}
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	if (hours < 24) {
		return `${hours}h ago`;
	}
	if (days < 7) {
		return `${days}d ago`;
	}
	return new Date(timestamp).toLocaleDateString();
}
