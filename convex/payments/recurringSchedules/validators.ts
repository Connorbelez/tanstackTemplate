import { v } from "convex/values";

export const collectionExecutionModeValidator = v.union(
	v.literal("app_owned"),
	v.literal("provider_managed")
);

export const externalCollectionScheduleStatusValidator = v.union(
	v.literal("draft"),
	v.literal("activating"),
	v.literal("activation_failed"),
	v.literal("active"),
	v.literal("sync_error"),
	v.literal("cancelling"),
	v.literal("cancelled"),
	v.literal("completed")
);

export const externalOccurrenceChannelValidator = v.union(
	v.literal("webhook"),
	v.literal("poller")
);

export const normalizedExternalCollectionOccurrenceEventValidator = v.object({
	amount: v.optional(v.number()),
	externalOccurrenceOrdinal: v.optional(v.number()),
	externalOccurrenceRef: v.optional(v.string()),
	externalScheduleRef: v.string(),
	mappedTransferEvent: v.union(
		v.literal("PROCESSING_UPDATE"),
		v.literal("FUNDS_SETTLED"),
		v.literal("TRANSFER_FAILED"),
		v.literal("TRANSFER_REVERSED")
	),
	occurredAt: v.optional(v.number()),
	providerCode: v.literal("pad_rotessa"),
	providerData: v.optional(v.record(v.string(), v.any())),
	providerRef: v.optional(v.string()),
	rawProviderReason: v.optional(v.string()),
	rawProviderStatus: v.string(),
	receivedVia: externalOccurrenceChannelValidator,
	scheduledDate: v.optional(v.string()),
});
