import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import { AuditLog } from "convex-audit-log";
import { transition as xstateTransition } from "xstate";
import { components, internal } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query } from "../_generated/server";
import { AuditTrail } from "../auditTrailClient";
import { type EntityType, machineRegistry } from "./machines/registry";

// ── Audit Trail Client ─────────────────────────────────────────
const auditTrail = new AuditTrail(components.auditTrail);

// ── Audit Log Client (Layer 3) ─────────────────────────────────
const auditLog = new AuditLog(components.auditLog);

// ── MachineSnapshot type ───────────────────────────────────────

interface MachineSnapshot {
	allActions: string[];
	allEvents: string[];
	allGuards: string[];
	allStates: string[];
	id: string;
	initial: string;
	states: Record<
		string,
		{
			type?: "final";
			on: Record<
				string,
				{
					target: string;
					guard?: string;
					actions?: string[];
				}
			>;
		}
	>;
}

// ── Shared Transition Helper ────────────────────────────────────
// Used by both the `transition` mutation and `runFullLifecycle` to
// ensure all status changes go through the engine (Rule 2).

interface TransitionSource {
	actorId?: string;
	actorType?: string;
	channel: string;
	ip?: string;
	sessionId?: string;
}

interface TransitionResult {
	effectsScheduled?: string[];
	newState: string;
	previousState: string;
	reason?: string;
	success: boolean;
}

// ── Effect Registry ────────────────────────────────────────────
// Maps machine action names to dedicated internalMutation handlers.
// Falls back to the generic `executeEffect` for unknown actions.
const effectRegistry: Record<
	string,
	typeof internal.demo.governedTransitionsEffects.notifyReviewer
> = {
	notifyReviewer: internal.demo.governedTransitionsEffects.notifyReviewer,
	notifyApplicant: internal.demo.governedTransitionsEffects.notifyApplicant,
	scheduleFunding: internal.demo.governedTransitionsEffects.scheduleFunding,
	generateDocuments: internal.demo.governedTransitionsEffects.generateDocuments,
};

async function executeTransition(
	ctx: GenericMutationCtx<DataModel>,
	args: {
		entityId: Id<"demo_gt_entities">;
		eventType: string;
		payload?: Record<string, unknown>;
		source: TransitionSource;
	}
): Promise<TransitionResult> {
	const { entityId, eventType, payload, source } = args;

	// 1. Load entity
	const entity = await ctx.db.get(entityId);
	if (!entity) {
		throw new Error(`Entity ${entityId} not found`);
	}

	const previousState = entity.status;
	const entityType = entity.entityType as EntityType;

	// 2. Get machine definition from registry
	const machineDef = machineRegistry[entityType];
	if (!machineDef) {
		throw new Error(`No machine for entity type: ${entityType}`);
	}

	// 3. Hydrate machine to current state
	const restoredState = machineDef.resolveState({
		value: previousState,
		context: {
			entityId: entityId as string,
			data: entity.data as
				| { applicantName?: string; loanAmount?: number }
				| undefined,
			...((entity.machineContext as Record<string, unknown>) ?? {}),
		},
	});

	// 4. Compute transition (PURE — no side effects)
	// The event type is a runtime string from the client; cast to satisfy
	// xstate's literal-union constraint. Invalid events simply won't match
	// any transition and the engine will record a rejection.
	const event = { type: eventType, ...(payload ?? {}) } as Parameters<
		(typeof machineDef)["transition"]
	>[1];
	const [nextState, executableActions] = xstateTransition(
		machineDef,
		restoredState,
		event
	);

	// 5. Check if transition actually occurred
	const newStatus =
		typeof nextState.value === "string"
			? nextState.value
			: JSON.stringify(nextState.value);
	const transitioned = newStatus !== previousState;

	if (!transitioned) {
		// 5a. Command rejected — log to journal and return
		await ctx.db.insert("demo_gt_journal", {
			entityType,
			entityId,
			eventType,
			payload: payload ?? undefined,
			previousState,
			newState: previousState,
			outcome: "rejected",
			reason: `No valid transition for ${eventType} from ${previousState}`,
			source,
			machineVersion: machineDef.config.id ?? "unknown",
			timestamp: Date.now(),
		});

		return {
			success: false,
			previousState,
			newState: previousState,
			reason: `No valid transition for ${eventType} from ${previousState}`,
		};
	}

	// 6. Persist new state (ATOMIC with journal write below)
	await ctx.db.patch(entityId, {
		status: newStatus,
		machineContext: nextState.context,
		lastTransitionAt: Date.now(),
	});

	// 7. Collect declared effects (action names from the machine)
	// Filter out internal xstate actions — only keep user-defined effect names.
	const effectNames: string[] = executableActions
		.map((a) => a.type as string)
		.filter((name) => !name.startsWith("xstate."));

	// 8. Write journal entry (ATOMIC with entity patch)
	const journalId = await ctx.db.insert("demo_gt_journal", {
		entityType,
		entityId,
		eventType,
		payload: payload ?? undefined,
		previousState,
		newState: newStatus,
		outcome: "transitioned",
		source,
		machineVersion: machineDef.config.id ?? "unknown",
		timestamp: Date.now(),
		effectsScheduled: effectNames.length > 0 ? effectNames : undefined,
	});

	// 9. Schedule declared effects via registry (fire-and-forget)
	for (const effectName of effectNames) {
		const handler =
			effectRegistry[effectName] ??
			internal.demo.governedTransitions.executeEffect;
		await ctx.scheduler.runAfter(0, handler, {
			entityId,
			journalEntryId: journalId,
			effectName,
		});
	}

	// 10. Schedule hash-chain copy to auditTrail component
	await ctx.scheduler.runAfter(
		0,
		internal.demo.governedTransitions.hashChainJournalEntry,
		{ journalEntryId: journalId }
	);

	return {
		success: true,
		previousState,
		newState: newStatus,
		effectsScheduled: effectNames.length > 0 ? effectNames : undefined,
	};
}

// ── Transition Mutation ─────────────────────────────────────────

export const transition = mutation({
	args: {
		entityId: v.id("demo_gt_entities"),
		eventType: v.string(),
		payload: v.optional(v.any()),
		source: v.object({
			channel: v.string(),
			actorId: v.optional(v.string()),
			actorType: v.optional(v.string()),
			sessionId: v.optional(v.string()),
			ip: v.optional(v.string()),
		}),
	},
	handler: async (ctx, args) => {
		return await executeTransition(ctx, {
			entityId: args.entityId,
			eventType: args.eventType,
			payload: args.payload as Record<string, unknown> | undefined,
			source: args.source,
		});
	},
});

// ── createEntity Mutation ───────────────────────────────────────

export const createEntity = mutation({
	args: {
		label: v.string(),
		loanAmount: v.number(),
		applicantName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const entityId = await ctx.db.insert("demo_gt_entities", {
			entityType: "loanApplication",
			label: args.label,
			status: "draft",
			data: {
				loanAmount: args.loanAmount,
				applicantName: args.applicantName,
			},
			createdAt: Date.now(),
		});
		await auditLog.log(ctx, {
			action: "gt.entity.created",
			actorId: "demo-user",
			resourceType: "demo_gt_entities",
			resourceId: entityId,
			severity: "info",
			metadata: { label: args.label, loanAmount: args.loanAmount },
		});
		return entityId;
	},
});

// ── seedEntities Mutation ───────────────────────────────────────

export const seedEntities = mutation({
	args: {},
	handler: async (ctx) => {
		// Idempotent — skip if entities already exist
		const existing = await ctx.db.query("demo_gt_entities").collect();
		if (existing.length > 0) {
			return;
		}

		const samples = [
			{
				label: "First-Time Buyer Application",
				loanAmount: 350_000,
				applicantName: "Sarah Chen",
			},
			{
				label: "Investment Property Refinance",
				loanAmount: 520_000,
				applicantName: "Marcus Johnson",
			},
			{
				label: "Pre-Approval Request",
				loanAmount: 280_000,
				applicantName: "Emily Rodriguez",
			},
		] as const;

		for (const sample of samples) {
			await ctx.db.insert("demo_gt_entities", {
				entityType: "loanApplication",
				label: sample.label,
				status: "draft",
				data: {
					loanAmount: sample.loanAmount,
					applicantName: sample.applicantName,
				},
				createdAt: Date.now(),
			});
		}
		await auditLog.log(ctx, {
			action: "gt.demo.seeded",
			actorId: "demo-system",
			resourceType: "demo_gt_entities",
			resourceId: "batch",
			severity: "info",
			metadata: { count: samples.length },
		});
	},
});

// ── runFullLifecycle Mutation ────────────────────────────────────

export const runFullLifecycle = mutation({
	args: {},
	handler: async (ctx) => {
		// 1. Create entity
		const entityId = await ctx.db.insert("demo_gt_entities", {
			entityType: "loanApplication",
			label: `Lifecycle Demo — ${Date.now()}`,
			status: "draft",
			data: {
				loanAmount: 500_000,
				applicantName: "Demo User",
			},
			createdAt: Date.now(),
		});

		// 2. Execute 5 transitions using the shared helper
		const steps: Array<{
			eventType: string;
			source: TransitionSource;
		}> = [
			{
				eventType: "SUBMIT",
				source: {
					channel: "borrower_portal",
					actorId: "borrower-demo",
					actorType: "borrower",
					ip: "203.0.113.42",
				},
			},
			{
				eventType: "ASSIGN_REVIEWER",
				source: {
					channel: "admin_dashboard",
					actorId: "admin-demo",
					actorType: "admin",
					ip: "10.0.1.50",
				},
			},
			{
				eventType: "APPROVE",
				source: {
					channel: "admin_dashboard",
					actorId: "admin-demo",
					actorType: "admin",
					ip: "10.0.1.50",
				},
			},
			{
				eventType: "FUND",
				source: {
					channel: "api_webhook",
					actorId: "system",
					actorType: "system",
					ip: "198.51.100.1",
				},
			},
			{
				eventType: "CLOSE",
				source: {
					channel: "scheduler",
					actorId: "system",
					actorType: "system",
					// No ip — demonstrates optionality for scheduler-initiated transitions
				},
			},
		];

		for (const step of steps) {
			const result = await executeTransition(ctx, {
				entityId,
				eventType: step.eventType,
				source: step.source,
			});
			if (!result.success) {
				throw new Error(
					`Lifecycle step ${step.eventType} failed: ${result.reason}`
				);
			}
		}

		await auditLog.log(ctx, {
			action: "gt.lifecycle.executed",
			actorId: "demo-system",
			resourceType: "demo_gt_entities",
			resourceId: entityId,
			severity: "info",
			metadata: { entityId, transitionCount: steps.length },
		});

		return { entityId, journalEntries: steps.length };
	},
});

// ── Query Functions ─────────────────────────────────────────────

export const listEntities = query({
	args: {},
	handler: async (ctx) => {
		const entities = await ctx.db.query("demo_gt_entities").collect();
		// Order by creation time descending
		return entities.sort((a, b) => b.createdAt - a.createdAt);
	},
});

export const getEntity = query({
	args: { entityId: v.id("demo_gt_entities") },
	handler: async (ctx, { entityId }) => {
		return await ctx.db.get(entityId);
	},
});

export const getJournal = query({
	args: {
		entityId: v.optional(v.id("demo_gt_entities")),
		outcome: v.optional(
			v.union(v.literal("transitioned"), v.literal("rejected"))
		),
	},
	handler: async (ctx, { entityId, outcome }) => {
		if (entityId) {
			// Use by_entity index
			const entries = await ctx.db
				.query("demo_gt_journal")
				.withIndex("by_entity", (q) => q.eq("entityId", entityId))
				.collect();
			const filtered = outcome
				? entries.filter((e) => e.outcome === outcome)
				: entries;
			return filtered.sort((a, b) => b.timestamp - a.timestamp);
		}

		if (outcome) {
			// Use by_outcome index
			const entries = await ctx.db
				.query("demo_gt_journal")
				.withIndex("by_outcome", (q) => q.eq("outcome", outcome))
				.collect();
			return entries.sort((a, b) => b.timestamp - a.timestamp);
		}

		// No filters — return all, ordered by timestamp desc
		const entries = await ctx.db.query("demo_gt_journal").collect();
		return entries.sort((a, b) => b.timestamp - a.timestamp);
	},
});

export const getJournalStats = query({
	args: {},
	handler: async (ctx) => {
		const entries = await ctx.db.query("demo_gt_journal").collect();
		let transitioned = 0;
		let rejected = 0;
		for (const entry of entries) {
			if (entry.outcome === "transitioned") {
				transitioned++;
			} else {
				rejected++;
			}
		}
		return {
			total: entries.length,
			transitioned,
			rejected,
		};
	},
});

export const getValidTransitions = query({
	args: { entityId: v.id("demo_gt_entities") },
	handler: async (ctx, { entityId }) => {
		const entity = await ctx.db.get(entityId);
		if (!entity) {
			throw new Error(`Entity ${entityId} not found`);
		}

		const entityType = entity.entityType as EntityType;
		const machineDef = machineRegistry[entityType];
		if (!machineDef) {
			throw new Error(`No machine for entity type: ${entityType}`);
		}

		// Hydrate machine to current state
		const restoredState = machineDef.resolveState({
			value: entity.status,
			context: {
				entityId: entityId as string,
				data: entity.data as
					| { applicantName?: string; loanAmount?: number }
					| undefined,
				...((entity.machineContext as Record<string, unknown>) ?? {}),
			},
		});

		// All possible event types for the loanApplication machine
		const allEventTypes = [
			"SUBMIT",
			"ASSIGN_REVIEWER",
			"APPROVE",
			"REJECT",
			"REQUEST_INFO",
			"RESUBMIT",
			"REOPEN",
			"FUND",
			"CLOSE",
		];

		const validTransitions: Array<{ eventType: string; targetState: string }> =
			[];

		for (const eventType of allEventTypes) {
			const event = { type: eventType } as Parameters<
				(typeof machineDef)["transition"]
			>[1];
			const [nextState] = xstateTransition(machineDef, restoredState, event);
			const nextStatus =
				typeof nextState.value === "string"
					? nextState.value
					: JSON.stringify(nextState.value);

			if (nextStatus !== entity.status) {
				validTransitions.push({
					eventType,
					targetState: nextStatus,
				});
			}
		}

		return validTransitions;
	},
});

export const getEffectsLog = query({
	args: {
		entityId: v.optional(v.id("demo_gt_entities")),
	},
	handler: async (ctx, { entityId }) => {
		if (entityId) {
			return await ctx.db
				.query("demo_gt_effects_log")
				.withIndex("by_entity", (q) => q.eq("entityId", entityId))
				.collect();
		}
		return await ctx.db.query("demo_gt_effects_log").collect();
	},
});

// ── Machine config extraction helpers ────────────────────────────

function extractGuardName(
	guard: unknown,
	guardsSet: Set<string>
): string | undefined {
	if (!guard) {
		return undefined;
	}
	const name =
		typeof guard === "string"
			? guard
			: ((guard as Record<string, unknown>).type as string | undefined);
	if (name) {
		guardsSet.add(name);
	}
	return name;
}

function extractActionNames(
	actions: unknown,
	actionsSet: Set<string>
): string[] | undefined {
	if (!actions) {
		return undefined;
	}
	const rawActions = actions as Array<string | Record<string, unknown>>;
	return rawActions.map((a) => {
		if (typeof a === "string") {
			actionsSet.add(a);
			return a;
		}
		const actionType = (a as Record<string, unknown>).type as string;
		actionsSet.add(actionType);
		return actionType;
	});
}

function parseEventDefinitions(
	onConfig: Record<string, unknown>,
	eventsSet: Set<string>,
	guardsSet: Set<string>,
	actionsSet: Set<string>
): MachineSnapshot["states"][string]["on"] {
	const on: MachineSnapshot["states"][string]["on"] = {};
	for (const [eventName, eventDef] of Object.entries(onConfig)) {
		eventsSet.add(eventName);
		const def = eventDef as Record<string, unknown>;
		const guardName = extractGuardName(def.guard, guardsSet);
		const actionNames = extractActionNames(def.actions, actionsSet);
		on[eventName] = {
			target: (def.target as string) ?? "",
			...(guardName ? { guard: guardName } : {}),
			...(actionNames ? { actions: actionNames } : {}),
		};
	}
	return on;
}

function buildMachineSnapshot(): MachineSnapshot {
	const machineDef = machineRegistry.loanApplication;
	const config = machineDef.config;

	const allEventsSet = new Set<string>();
	const allGuardsSet = new Set<string>();
	const allActionsSet = new Set<string>();
	const allStates: string[] = [];
	const states: MachineSnapshot["states"] = {};

	const statesConfig = config.states ?? {};
	for (const [stateName, stateDef] of Object.entries(statesConfig)) {
		allStates.push(stateName);
		const stateObj = stateDef as Record<string, unknown>;
		const onConfig = stateObj.on as Record<string, unknown> | undefined;

		states[stateName] = {
			...(stateObj.type === "final" ? { type: "final" as const } : {}),
			on: onConfig
				? parseEventDefinitions(
						onConfig,
						allEventsSet,
						allGuardsSet,
						allActionsSet
					)
				: {},
		};
	}

	return {
		id: config.id ?? "unknown",
		initial: (config.initial as string) ?? "draft",
		states,
		allStates,
		allEvents: [...allEventsSet],
		allGuards: [...allGuardsSet],
		allActions: [...allActionsSet],
	};
}

export const getMachineDefinition = query({
	args: {},
	handler: async () => {
		return buildMachineSnapshot();
	},
});

// ── Internal Mutations ──────────────────────────────────────────

export const executeEffect = internalMutation({
	args: {
		entityId: v.id("demo_gt_entities"),
		journalEntryId: v.id("demo_gt_journal"),
		effectName: v.string(),
	},
	handler: async (ctx, { entityId, journalEntryId, effectName }) => {
		await ctx.db.insert("demo_gt_effects_log", {
			entityId,
			journalEntryId,
			effectName,
			status: "completed",
			scheduledAt: Date.now(),
			completedAt: Date.now(),
		});
	},
});

export const hashChainJournalEntry = internalMutation({
	args: { journalEntryId: v.id("demo_gt_journal") },
	handler: async (ctx, { journalEntryId }) => {
		const entry = await ctx.db.get(journalEntryId);
		if (!entry) {
			return;
		}

		await auditTrail.insert(ctx, {
			entityId: entry.entityId as string,
			entityType: entry.entityType,
			eventType: entry.eventType,
			actorId: entry.source.actorId ?? "demo-anonymous",
			beforeState: JSON.stringify({ status: entry.previousState }),
			afterState: JSON.stringify({ status: entry.newState }),
			metadata: JSON.stringify({
				outcome: entry.outcome,
				source: entry.source,
				effectsScheduled: entry.effectsScheduled,
			}),
			timestamp: entry.timestamp,
		});
	},
});

// ── resetDemo Mutation ──────────────────────────────────────────

export const resetDemo = mutation({
	args: {},
	handler: async (ctx) => {
		const entities = await ctx.db.query("demo_gt_entities").collect();
		for (const e of entities) {
			await ctx.db.delete(e._id);
		}

		const journal = await ctx.db.query("demo_gt_journal").collect();
		for (const j of journal) {
			await ctx.db.delete(j._id);
		}

		const effects = await ctx.db.query("demo_gt_effects_log").collect();
		for (const ef of effects) {
			await ctx.db.delete(ef._id);
		}

		await auditLog.log(ctx, {
			action: "gt.demo.reset",
			actorId: "demo-user",
			resourceType: "demo_gt_entities",
			resourceId: "all",
			severity: "warning",
			metadata: {
				entitiesDeleted: entities.length,
				journalEntriesDeleted: journal.length,
				effectsDeleted: effects.length,
			},
		});
	},
});

// ── Index-backed Queries ────────────────────────────────────────

export const getJournalByActor = query({
	args: { actorId: v.string() },
	handler: async (ctx, { actorId }) => {
		return await ctx.db
			.query("demo_gt_journal")
			.withIndex("by_actor", (q) => q.eq("source.actorId", actorId))
			.collect();
	},
});

export const getJournalByEntityType = query({
	args: { entityType: v.string() },
	handler: async (ctx, { entityType }) => {
		return await ctx.db
			.query("demo_gt_journal")
			.withIndex("by_type_and_time", (q) => q.eq("entityType", entityType))
			.collect();
	},
});
