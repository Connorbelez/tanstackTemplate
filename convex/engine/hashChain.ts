import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { AuditTrail } from "../auditTrailClient";

const auditTrail = new AuditTrail(components.auditTrail);
const workflow = new WorkflowManager(components.workflow);

/**
 * Mutation step: reads a journal entry and inserts it into the auditTrail
 * component for SHA-256 hash-chaining (Layer 2).
 *
 * Fire-and-forget: errors are logged but never thrown so they don't
 * propagate to the calling workflow.
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
			await auditTrail.insert(ctx, {
				entityId: entry.entityId,
				entityType: entry.entityType,
				eventType: entry.eventType,
				actorId: entry.actorId,
				beforeState: entry.previousState,
				afterState: entry.newState,
				metadata: JSON.stringify({
					outcome: entry.outcome,
					machineVersion: entry.machineVersion,
					effectsScheduled: entry.effectsScheduled,
					channel: entry.channel,
					reason: entry.reason,
				}),
				timestamp: entry.timestamp,
			});
		} catch (error) {
			console.error(
				`[GT HashChain] Failed to insert audit trail entry for journal ${args.journalEntryId}:`,
				error
			);
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
	handler: async (step, args) => {
		await step.runMutation(internal.engine.hashChain.processHashChainStep, {
			journalEntryId: args.journalEntryId,
		});
	},
});

/**
 * Start the hash-chain workflow from a mutation context.
 *
 * ENG-12 calls this in Step 8 of the transition pipeline:
 *   await startHashChain(ctx, journalEntryId);
 */
export async function startHashChain(
	ctx: { runMutation: (...args: unknown[]) => Promise<unknown> },
	journalEntryId: Id<"auditJournal">
) {
	await workflow.start(
		// biome-ignore lint/suspicious/noExplicitAny: WorkflowManager.start accepts generic mutation ctx
		ctx as any,
		internal.engine.hashChain.hashChainJournalEntry,
		{ journalEntryId }
	);
}
