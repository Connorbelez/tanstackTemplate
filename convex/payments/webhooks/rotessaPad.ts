import {
	makeFunctionReference,
	type SchedulableFunctionReference,
} from "convex/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	type ActionCtx,
	httpAction,
	internalMutation,
	type MutationCtx,
} from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { executeTransition } from "../../engine/transition";
import type { CommandSource } from "../../engine/types";
import {
	isTransferAlreadyInTargetState,
	markTransferWebhookFailed,
	persistVerifiedTransferWebhook,
} from "./transferCore";
import type { NormalizedTransferWebhookEventType } from "./types";
import { jsonResponse } from "./utils";
import type { VerificationResult } from "./verification";

export interface RotessaPadWebhookEvent {
	data: {
		amount?: number;
		date?: string;
		event_id?: string;
		reason?: string;
		return_code?: string;
		transaction_id: string;
	};
	event_type: string;
}

interface ProcessRotessaPadWebhookArgs {
	date?: string;
	eventId?: string;
	eventType: string;
	reason?: string;
	returnCode?: string;
	transactionId: string;
	webhookEventId: Id<"webhookEvents">;
}

type ProcessRotessaPadWebhookReferenceArgs = Record<string, unknown> &
	ProcessRotessaPadWebhookArgs;

const processRotessaPadWebhookReference = makeFunctionReference<
	"mutation",
	ProcessRotessaPadWebhookReferenceArgs,
	Promise<void>
>(
	"payments/webhooks/rotessaPad:processRotessaPadWebhook"
) as unknown as SchedulableFunctionReference;

export function mapRotessaPadStatusToTransferEvent(
	rotessaEventType: string
): NormalizedTransferWebhookEventType | undefined {
	switch (rotessaEventType) {
		case "transaction.completed":
		case "transaction.settled":
			return "FUNDS_SETTLED";
		case "transaction.nsf":
		case "transaction.failed":
			return "TRANSFER_FAILED";
		case "transaction.returned":
		case "transaction.reversed":
			return "TRANSFER_REVERSED";
		case "transaction.pending":
		case "transaction.processing":
			return "PROCESSING_UPDATE";
		default:
			return undefined;
	}
}

export function buildRotessaPadTransitionPayload(
	eventType: NormalizedTransferWebhookEventType,
	args: Pick<
		ProcessRotessaPadWebhookArgs,
		"date" | "eventId" | "eventType" | "reason" | "returnCode" | "transactionId"
	>
): Record<string, unknown> {
	switch (eventType) {
		case "FUNDS_SETTLED":
			return {
				settledAt: Date.now(),
				providerData: {
					rotessaTransactionId: args.transactionId,
					rotessaEventId: args.eventId,
					rotessaEventType: args.eventType,
				},
			};
		case "TRANSFER_FAILED":
			return {
				errorCode: args.returnCode ?? "ROTESSA_FAILURE",
				reason: args.reason ?? `Rotessa event: ${args.eventType}`,
			};
		case "TRANSFER_REVERSED":
			return {
				reversalRef: args.eventId ?? args.transactionId,
				reason: args.reason ?? `Rotessa reversal: ${args.eventType}`,
			};
		case "PROCESSING_UPDATE":
			return {
				providerData: {
					rotessaTransactionId: args.transactionId,
					rotessaEventType: args.eventType,
					processedDate: args.date,
				},
			};
		default:
			return {};
	}
}

async function finalizeWebhookEvent(
	ctx: MutationCtx,
	args: {
		error?: string;
		status: "processed" | "failed";
		webhookEventId: Id<"webhookEvents">;
	}
) {
	const doc = await ctx.db.get(args.webhookEventId);
	if (!doc) {
		console.warn(
			`[Rotessa PAD Webhook] webhookEvent ${args.webhookEventId} not found for status update`
		);
		return;
	}

	await ctx.db.patch(doc._id, {
		status: args.status,
		processedAt: Date.now(),
		attempts: doc.attempts + 1,
		...(args.error !== undefined ? { error: args.error } : {}),
	});
}

async function patchWebhookEventMetadata(
	ctx: MutationCtx,
	args: {
		normalizedEventType?: NormalizedTransferWebhookEventType;
		transferRequestId?: Id<"transferRequests">;
		webhookEventId: Id<"webhookEvents">;
	}
) {
	const patch: {
		normalizedEventType?: NormalizedTransferWebhookEventType;
		transferRequestId?: Id<"transferRequests">;
	} = {};

	if (args.normalizedEventType !== undefined) {
		patch.normalizedEventType = args.normalizedEventType;
	}
	if (args.transferRequestId !== undefined) {
		patch.transferRequestId = args.transferRequestId;
	}
	if (Object.keys(patch).length === 0) {
		return;
	}

	await ctx.db.patch(args.webhookEventId, patch);
}

export async function processRotessaPadTransferWebhook(
	ctx: MutationCtx,
	args: ProcessRotessaPadWebhookArgs
) {
	try {
		const normalizedEventType = mapRotessaPadStatusToTransferEvent(
			args.eventType
		);
		if (!normalizedEventType) {
			console.info(
				`[Rotessa PAD Webhook] Ignoring unmapped eventType="${args.eventType}" for transaction=${args.transactionId}`
			);
			await finalizeWebhookEvent(ctx, {
				webhookEventId: args.webhookEventId,
				status: "processed",
			});
			return;
		}

		const transfer = await ctx.db
			.query("transferRequests")
			.withIndex("by_provider_ref", (q) =>
				q
					.eq("providerCode", "pad_rotessa")
					.eq("providerRef", args.transactionId)
			)
			.first();

		if (!transfer) {
			console.warn(
				`[Rotessa PAD Webhook] No transfer found for providerRef=${args.transactionId}`
			);
			await patchWebhookEventMetadata(ctx, {
				webhookEventId: args.webhookEventId,
				normalizedEventType,
			});
			await finalizeWebhookEvent(ctx, {
				webhookEventId: args.webhookEventId,
				status: "processed",
			});
			return;
		}

		await patchWebhookEventMetadata(ctx, {
			webhookEventId: args.webhookEventId,
			normalizedEventType,
			transferRequestId: transfer._id,
		});

		if (isTransferAlreadyInTargetState(transfer.status, normalizedEventType)) {
			console.info(
				`[Rotessa PAD Webhook] Transfer ${transfer._id} already in target state "${transfer.status}" — idempotent skip`
			);
			await finalizeWebhookEvent(ctx, {
				webhookEventId: args.webhookEventId,
				status: "processed",
			});
			return;
		}

		const source: CommandSource = {
			actorType: "system",
			channel: "api_webhook",
			actorId: "webhook:pad_rotessa",
		};

		const result = await executeTransition(ctx, {
			entityType: "transfer",
			entityId: transfer._id,
			eventType: normalizedEventType,
			payload: buildRotessaPadTransitionPayload(normalizedEventType, args),
			source,
		});

		if (!result.success) {
			await auditLog.log(ctx, {
				action: "webhook.rotessa_pad.transition_failed",
				actorId: "system",
				resourceType: "transferRequests",
				resourceId: transfer._id,
				severity: "error",
				metadata: {
					eventType: normalizedEventType,
					transactionId: args.transactionId,
					rotessaEventType: args.eventType,
					reason: result.reason,
				},
			});

			await finalizeWebhookEvent(ctx, {
				webhookEventId: args.webhookEventId,
				status: "failed",
				error: result.reason ?? "transition_failed",
			});
			return;
		}

		await finalizeWebhookEvent(ctx, {
			webhookEventId: args.webhookEventId,
			status: "processed",
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("[Rotessa PAD Webhook] Processing failed:", error);
		await finalizeWebhookEvent(ctx, {
			webhookEventId: args.webhookEventId,
			status: "failed",
			error: message,
		});
	}
}

async function verifyRotessaPadWebhookRequest(
	ctx: ActionCtx,
	args: {
		body: string;
		signature: string | null;
	}
) {
	if (!args.signature) {
		console.warn("[Rotessa PAD Webhook] Missing signature header");
		return jsonResponse({ error: "invalid_signature" }, 401);
	}

	const verification: VerificationResult = await ctx.runAction(
		internal.payments.webhooks.verification.verifyRotessaSignatureAction,
		{ body: args.body, signature: args.signature }
	);

	if (verification.ok) {
		return null;
	}

	if (verification.error === "missing_secret") {
		console.error(
			"[Rotessa PAD Webhook] ROTESSA_WEBHOOK_SECRET not configured"
		);
		return jsonResponse({ error: "server_configuration_error" }, 500);
	}

	console.warn("[Rotessa PAD Webhook] Signature verification failed");
	return jsonResponse({ error: "invalid_signature" }, 401);
}

function parseRotessaPadWebhookEvent(body: string) {
	try {
		const event = JSON.parse(body) as RotessaPadWebhookEvent;
		if (!(event.data?.transaction_id && event.event_type)) {
			console.warn(
				"[Rotessa PAD Webhook] Missing required fields: data.transaction_id or event_type"
			);
			return {
				ok: false as const,
				response: jsonResponse({ error: "missing_required_fields" }, 400),
			};
		}
		return { ok: true as const, event };
	} catch (err) {
		console.warn(
			"[Rotessa PAD Webhook] Malformed JSON body:",
			err instanceof Error ? err.message : err
		);
		return {
			ok: false as const,
			response: jsonResponse({ error: "malformed_json" }, 400),
		};
	}
}

async function persistRotessaPadWebhookEvent(
	ctx: ActionCtx,
	args: {
		body: string;
		event: RotessaPadWebhookEvent;
	}
) {
	try {
		return {
			ok: true as const,
			webhookEventId: await persistVerifiedTransferWebhook(ctx, {
				provider: "pad_rotessa",
				providerEventId:
					args.event.data.event_id ?? args.event.data.transaction_id,
				rawBody: args.body,
				normalizedEventType: mapRotessaPadStatusToTransferEvent(
					args.event.event_type
				),
			}),
		};
	} catch (err) {
		console.error("[Rotessa PAD Webhook] Failed to persist raw event:", err);
		return jsonResponse(
			{
				error: "persistence_failed",
				message: err instanceof Error ? err.message : "Unknown error",
			},
			500
		);
	}
}

async function scheduleRotessaPadWebhookProcessing(
	ctx: ActionCtx,
	args: {
		event: RotessaPadWebhookEvent;
		webhookEventId: Id<"webhookEvents">;
	}
) {
	try {
		await ctx.scheduler.runAfter(0, processRotessaPadWebhookReference, {
			webhookEventId: args.webhookEventId,
			transactionId: args.event.data.transaction_id,
			eventType: args.event.event_type,
			eventId: args.event.data.event_id,
			reason: args.event.data.reason,
			returnCode: args.event.data.return_code,
			date: args.event.data.date,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "scheduler_failed";
		console.error(
			"[Rotessa PAD Webhook] Failed to schedule processing:",
			error
		);
		await markTransferWebhookFailed(ctx, {
			webhookEventId: args.webhookEventId,
			error: message,
		});
	}
}

export const rotessaPadWebhook = httpAction(async (ctx, request) => {
	const body = await request.text();
	const verificationError = await verifyRotessaPadWebhookRequest(ctx, {
		body,
		signature: request.headers.get("X-Rotessa-Signature"),
	});
	if (verificationError) {
		return verificationError;
	}

	const parsed = parseRotessaPadWebhookEvent(body);
	if (!parsed.ok) {
		return parsed.response;
	}

	const persisted = await persistRotessaPadWebhookEvent(ctx, {
		body,
		event: parsed.event,
	});
	if (persisted instanceof Response) {
		return persisted;
	}

	console.info(
		`[Rotessa PAD Webhook] Received event ${parsed.event.data.event_id ?? parsed.event.data.transaction_id} for transaction ${parsed.event.data.transaction_id}`
	);

	await scheduleRotessaPadWebhookProcessing(ctx, {
		webhookEventId: persisted.webhookEventId,
		event: parsed.event,
	});

	return jsonResponse({ accepted: true });
});

export const processRotessaPadWebhook = internalMutation({
	args: {
		webhookEventId: v.id("webhookEvents"),
		transactionId: v.string(),
		eventType: v.string(),
		eventId: v.optional(v.string()),
		reason: v.optional(v.string()),
		returnCode: v.optional(v.string()),
		date: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await processRotessaPadTransferWebhook(ctx, args);
	},
});
