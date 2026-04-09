import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { AuditTrail } from "../auditTrailClient";

const auditTrail = new AuditTrail(components.auditTrail);
const workflow = new WorkflowManager(components.workflow);

export function buildAuditTrailInsertArgs(entry: {
	afterState?: Record<string, unknown>;
	actorId: string;
	beforeState?: Record<string, unknown>;
	channel: string;
	correlationId?: string;
	delta?: Record<string, unknown>;
	effectiveDate: string;
	effectsScheduled?: string[];
	entityId: string;
	entityType: string;
	eventCategory: string;
	eventId: string;
	eventType: string;
	idempotencyKey?: string;
	legalEntityId?: string;
	linkedRecordIds?: Record<string, unknown>;
	machineVersion?: string;
	newState: string;
	outcome: string;
	previousState: string;
	reason?: string;
	requestId?: string;
	sequenceNumber: bigint;
	timestamp: number;
}) {
	const canonicalEnvelope = {
		afterState: entry.afterState,
		actorId: entry.actorId,
		beforeState: entry.beforeState,
		channel: entry.channel,
		correlationId: entry.correlationId,
		delta: entry.delta,
		effectiveDate: entry.effectiveDate,
		effectsScheduled: entry.effectsScheduled,
		entityId: entry.entityId,
		entityType: entry.entityType,
		eventCategory: entry.eventCategory,
		eventId: entry.eventId,
		eventType: entry.eventType,
		idempotencyKey: entry.idempotencyKey,
		legalEntityId: entry.legalEntityId,
		linkedRecordIds: entry.linkedRecordIds,
		machineVersion: entry.machineVersion,
		newState: entry.newState,
		outcome: entry.outcome,
		previousState: entry.previousState,
		reason: entry.reason,
		requestId: entry.requestId,
		sequenceNumber: entry.sequenceNumber.toString(),
		timestamp: entry.timestamp,
	};
	return {
		entityId: entry.entityId,
		entityType: entry.entityType,
		eventType: entry.eventType,
		actorId: entry.actorId,
		beforeState: JSON.stringify(
			entry.beforeState ?? { status: entry.previousState }
		),
		afterState: JSON.stringify(entry.afterState ?? { status: entry.newState }),
		canonicalEnvelope: JSON.stringify(canonicalEnvelope),
		metadata: JSON.stringify({
			canonicalEnvelope,
		}),
		timestamp: entry.timestamp,
	};
}

/**
 * Mutation step: reads a journal entry and inserts it into the auditTrail
 * component for SHA-256 hash-chaining (Layer 2).
 *
 * Failures are logged and re-thrown so the workflow can apply retries.
 */
export const processHashChainStep = internalMutation({
	args: {
		journalEntryId: v.id("auditJournal"),
	},
	handler: async (ctx, args) => {
		const entry = await ctx.db.get(args.journalEntryId);
		if (!entry) {
			// Not retryable — entry genuinely doesn't exist
			console.warn(
				`[GT HashChain] Journal entry not found: ${args.journalEntryId}`
			);
			return;
		}

		try {
			await auditTrail.insert(ctx, buildAuditTrailInsertArgs(entry));
		} catch (error) {
			console.error(
				`[GT HashChain] Failed to insert audit trail entry for journal ${args.journalEntryId}:`,
				error
			);
			throw error;
		}
	},
});

/**
 * Durable workflow for Layer 2 hash-chaining.
 *
 * Wraps processHashChainStep with automatic retries via the workflow component.
 * Started by the transition engine after committing a journal entry.
 *
 * ENG-12 usage:
 *   import { hashChainWorkflow } from "./hashChain";
 *   await hashChainWorkflow.start(ctx, journalEntryId);
 */
export const hashChainJournalEntry = workflow.define({
	args: { journalEntryId: v.id("auditJournal") },
	handler: runHashChainJournalStep,
});

export async function runHashChainJournalStep(
	step: Pick<MutationCtx, "runMutation">,
	args: { journalEntryId: Id<"auditJournal"> }
) {
	await step.runMutation(internal.engine.hashChain.processHashChainStep, {
		journalEntryId: args.journalEntryId,
	});
}

/**
 * Start the hash-chain workflow from a mutation context.
 *
 * ENG-12 calls this in Step 8 of the transition pipeline:
 *   await startHashChain(ctx, journalEntryId);
 */
export async function startHashChain(
	ctx: Pick<MutationCtx, "runMutation" | "scheduler">,
	journalEntryId: Id<"auditJournal">
) {
	if (
		typeof process !== "undefined" &&
		process.env.DISABLE_GT_HASHCHAIN === "true"
	) {
		console.warn(
			"[GT HashChain] KILL SWITCH ACTIVE: Hash chain audit trail disabled " +
				`for journal ${journalEntryId}. No Layer 2 audit record will be created. ` +
				"Set DISABLE_GT_HASHCHAIN=false to re-enable."
		);
		return;
	}

	await workflow.start(
		ctx,
		internal.engine.hashChain.hashChainJournalEntry,
		{
			journalEntryId,
		},
		{
			startAsync: true,
		}
	);
}
