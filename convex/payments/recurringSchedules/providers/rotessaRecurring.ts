import { RotessaApiClient } from "../../rotessa/api";
import { buildNormalizedOccurrenceFromRotessaRow } from "../../rotessa/financialTransactions";
import type {
	NormalizedExternalCollectionOccurrenceEvent,
	RecurringCollectionScheduleInput,
	RecurringCollectionScheduleProvider,
} from "../types";

function buildOccurrenceSortKey(
	event: Pick<
		NormalizedExternalCollectionOccurrenceEvent,
		| "externalOccurrenceOrdinal"
		| "externalOccurrenceRef"
		| "providerRef"
		| "scheduledDate"
	>
) {
	return (
		event.providerRef ??
		event.externalOccurrenceRef ??
		(event.externalOccurrenceOrdinal !== undefined
			? `ordinal:${event.externalOccurrenceOrdinal}`
			: undefined) ??
		(event.scheduledDate ? `date:${event.scheduledDate}` : undefined) ??
		"no-occurrence-key"
	);
}

function parseOccurrenceCursor(cursor: string | undefined) {
	if (!cursor) {
		return null;
	}
	try {
		const parsed = JSON.parse(cursor) as {
			occurredAt?: unknown;
			sortKey?: unknown;
		};
		if (
			typeof parsed.occurredAt === "number" &&
			Number.isFinite(parsed.occurredAt) &&
			typeof parsed.sortKey === "string"
		) {
			return {
				occurredAt: parsed.occurredAt,
				sortKey: parsed.sortKey,
			};
		}
	} catch {
		// Fall through to the legacy timestamp-only cursor parsing.
	}

	const occurredAt = Date.parse(cursor);
	if (Number.isNaN(occurredAt)) {
		return null;
	}
	return {
		occurredAt,
		sortKey: "",
	};
}

function encodeOccurrenceCursor(args: { occurredAt: number; sortKey: string }) {
	return JSON.stringify(args);
}

export class RotessaRecurringScheduleProvider
	implements RecurringCollectionScheduleProvider
{
	private readonly apiClient: RotessaApiClient;

	constructor(apiClient = new RotessaApiClient()) {
		this.apiClient = apiClient;
	}

	async cancelSchedule(externalScheduleRef: string) {
		await this.apiClient.deleteTransactionSchedule(externalScheduleRef);
		return { cancelled: true };
	}

	async createSchedule(input: RecurringCollectionScheduleInput) {
		const schedule = await this.apiClient.createTransactionSchedule(input);
		return {
			externalScheduleRef: String(schedule.id),
			status: "active" as const,
			providerData: {
				rotessaScheduleId: schedule.id,
				frequency: schedule.frequency,
				nextProcessDate: schedule.next_process_date,
				installments: schedule.installments,
				processDate: schedule.process_date,
			},
		};
	}

	async getScheduleStatus(externalScheduleRef: string) {
		const schedule =
			await this.apiClient.getTransactionSchedule(externalScheduleRef);
		return {
			status: schedule.next_process_date ? "active" : "completed",
			providerData: {
				rotessaScheduleId: schedule.id,
				frequency: schedule.frequency,
				nextProcessDate: schedule.next_process_date,
				installments: schedule.installments,
				processDate: schedule.process_date,
				comment: schedule.comment,
			},
		};
	}

	async pollOccurrenceUpdates(args: {
		endDate?: string;
		externalScheduleRef: string;
		maxEvents?: number;
		sinceCursor?: string;
		startDate: string;
	}) {
		const maxEvents = args.maxEvents ?? 100;
		let page = 1;
		let pagesVisited = 0;
		const events: NormalizedExternalCollectionOccurrenceEvent[] = [];
		const sinceCursor = parseOccurrenceCursor(args.sinceCursor);

		while (true) {
			const rows = await this.apiClient.getTransactionReport({
				startDate: args.startDate,
				endDate: args.endDate,
				status: "All",
				page,
			});
			pagesVisited += 1;

			const filtered = rows
				.filter(
					(row) =>
						String(row.transaction_schedule_id) === args.externalScheduleRef
				)
				.map((row) =>
					buildNormalizedOccurrenceFromRotessaRow({
						externalScheduleRef: args.externalScheduleRef,
						receivedVia: "poller",
						row,
					})
				)
				.filter(
					(
						occurrenceEvent
					): occurrenceEvent is NormalizedExternalCollectionOccurrenceEvent =>
						occurrenceEvent !== null
				)
				.filter((occurrenceEvent) => {
					if (!(sinceCursor && occurrenceEvent.occurredAt !== undefined)) {
						return true;
					}
					const sortKey = buildOccurrenceSortKey(occurrenceEvent);
					return (
						occurrenceEvent.occurredAt > sinceCursor.occurredAt ||
						(occurrenceEvent.occurredAt === sinceCursor.occurredAt &&
							sortKey > sinceCursor.sortKey)
					);
				});

			events.push(...filtered);
			if (rows.length < 1000) {
				break;
			}
			page += 1;
		}
		const emittedEvents = [...events]
			.sort((left, right) => {
				const occurredAtDelta =
					(left.occurredAt ?? 0) - (right.occurredAt ?? 0);
				if (occurredAtDelta !== 0) {
					return occurredAtDelta;
				}
				return buildOccurrenceSortKey(left).localeCompare(
					buildOccurrenceSortKey(right)
				);
			})
			.slice(0, maxEvents);
		const lastEmittedEvent = [...emittedEvents]
			.reverse()
			.find((occurrenceEvent) => occurrenceEvent.occurredAt !== undefined);

		return {
			events: emittedEvents,
			nextCursor:
				lastEmittedEvent?.occurredAt !== undefined
					? encodeOccurrenceCursor({
							occurredAt: lastEmittedEvent.occurredAt,
							sortKey: buildOccurrenceSortKey(lastEmittedEvent),
						})
					: args.sinceCursor,
			providerData: {
				pagesVisited,
				startDate: args.startDate,
				endDate: args.endDate,
			},
		};
	}
}
