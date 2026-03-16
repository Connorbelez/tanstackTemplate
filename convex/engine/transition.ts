import { getNextSnapshot } from "xstate";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { effectRegistry } from "./effects/registry";
import { machineRegistry } from "./machines/registry";
import type { CommandSource, EntityType, TransitionResult } from "./types";

interface ScheduledEffectDescriptor {
	actionType: string;
	params?: Record<string, unknown>;
}

function getAuditResourceType(entityType: EntityType): string {
	return entityType === "onboardingRequest" ? "onboardingRequests" : entityType;
}

function normalizeActionDescriptors(
	actions: unknown
): ScheduledEffectDescriptor[] {
	if (!actions) {
		return [];
	}

	const actionList = Array.isArray(actions) ? actions : [actions];
	const descriptors: ScheduledEffectDescriptor[] = [];

	for (const action of actionList) {
		if (typeof action === "string") {
			descriptors.push({ actionType: action });
			continue;
		}

		if (action && typeof action === "object" && "type" in action) {
			const actionType = action.type;
			if (typeof actionType === "string") {
				const params =
					"params" in action &&
					action.params &&
					typeof action.params === "object" &&
					!Array.isArray(action.params)
						? (action.params as Record<string, unknown>)
						: undefined;
				descriptors.push({ actionType, params });
			}
		}
	}

	return descriptors;
}

function extractScheduledEffects(
	machine: NonNullable<(typeof machineRegistry)[keyof typeof machineRegistry]>,
	previousState: string,
	eventType: string
): ScheduledEffectDescriptor[] {
	const stateNode =
		machine.config.states?.[
			previousState as keyof typeof machine.config.states
		];
	const eventConfig =
		stateNode && "on" in stateNode
			? (stateNode.on as Record<string, unknown>)?.[eventType]
			: undefined;
	let candidates: unknown[] = [];
	if (eventConfig) {
		candidates = Array.isArray(eventConfig) ? eventConfig : [eventConfig];
	}

	return candidates.flatMap((candidate) => {
		if (!candidate || typeof candidate !== "object") {
			return [];
		}

		if (!("actions" in candidate)) {
			return [];
		}

		return normalizeActionDescriptors(candidate.actions);
	});
}

async function scheduleEffects(
	ctx: MutationCtx,
	entityId: string,
	journalEntryId: string,
	scheduledEffects: ScheduledEffectDescriptor[]
): Promise<string[]> {
	const effectNames: string[] = [];
	for (const actionDescriptor of scheduledEffects) {
		if (actionDescriptor.actionType.startsWith("xstate.")) {
			continue;
		}
		const handler = effectRegistry[actionDescriptor.actionType];
		if (handler) {
			await ctx.scheduler.runAfter(0, handler, {
				entityId,
				journalEntryId,
				effectName: actionDescriptor.actionType,
				params: actionDescriptor.params,
			});
			effectNames.push(actionDescriptor.actionType);
		}
	}
	return effectNames;
}

/**
 * Core GT transition engine — called within mutations to maintain atomicity.
 *
 * Hydrates the entity's current state into an XState snapshot, computes the
 * next state via `getNextSnapshot()`, persists the change, writes to the
 * shared audit log, and schedules any declared effects.
 */
export async function transitionEntity(
	ctx: MutationCtx,
	entityType: EntityType,
	entityId: string,
	eventType: string,
	payload?: Record<string, unknown>,
	source?: CommandSource
): Promise<TransitionResult> {
	// 1. Load entity
	// Internal cast: only onboardingRequests exists today.
	// ENG-12 generalizes this with a table lookup from entityType.
	if (entityType !== "onboardingRequest") {
		throw new Error(
			`Entity type ${entityType} is not yet supported by transitionEntity`
		);
	}
	const entity = await ctx.db.get(entityId as Id<"onboardingRequests">);
	if (!entity) {
		throw new Error(`Entity ${entityType}/${entityId} not found`);
	}

	// 2. Get machine
	const machine = machineRegistry[entityType];
	if (!machine) {
		throw new Error(`No machine registered for entity type: ${entityType}`);
	}

	// 3. Hydrate current state
	const previousState = entity.status as string;
	// machineContext is v.optional(v.any()) in schema — cast to satisfy resolveState.
	// Today the onboardingRequest machine has an empty context; ENG-12 will generalize.
	const hydratedContext = (entity.machineContext ?? {}) as Record<
		string,
		unknown
	> as Parameters<typeof machine.resolveState>[0]["context"];
	const currentSnapshot = machine.resolveState({
		value: previousState,
		context: hydratedContext,
	});

	// 4. Compute next state (pure — no side effects)
	const event = { ...(payload ?? {}), type: eventType } as Parameters<
		typeof getNextSnapshot<typeof machine>
	>[2];
	const nextSnapshot = getNextSnapshot(machine, currentSnapshot, event);
	const newState = nextSnapshot.value as string;
	const resourceType = getAuditResourceType(entityType);
	const journalEntryId = `${entityType}:${entityId}:${eventType}:${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
	const defaultSource: CommandSource = { channel: "scheduler" };

	// 5. Check if transition occurred (state change) or if targetless transition has effects
	const scheduledEffects = extractScheduledEffects(
		machine,
		previousState,
		eventType
	);
	const hasEffects = scheduledEffects.length > 0;

	if (newState === previousState) {
		if (!hasEffects) {
			// No state change and no effects — event is ignored/rejected
			await auditLog.log(ctx, {
				action: `transition.${entityType}.rejected`,
				actorId: source?.actorId ?? "system",
				resourceType,
				resourceId: entityId,
				severity: "warning",
				metadata: {
					journalEntryId,
					entityType,
					eventType,
					payload,
					previousState,
					newState,
					outcome: "rejected",
					reason: `Event "${eventType}" not valid in state "${previousState}"`,
					source: source ?? defaultSource,
					machineVersion: machine.id,
				},
			});
			return {
				success: false,
				previousState,
				newState,
				reason: `Event "${eventType}" not valid in state "${previousState}"`,
			};
		}
		// Same state but has effects — run effects only, no persistence
		const effectNames = await scheduleEffects(
			ctx,
			entityId,
			journalEntryId,
			scheduledEffects
		);
		await auditLog.log(ctx, {
			action: `transition.${entityType}.${eventType.toLowerCase()}`,
			actorId: source?.actorId ?? "system",
			resourceType,
			resourceId: entityId,
			severity: "info",
			metadata: {
				journalEntryId,
				entityType,
				eventType,
				payload,
				previousState,
				newState,
				outcome: "same_state_with_effects",
				effectsScheduled: effectNames,
				source: source ?? defaultSource,
				machineVersion: machine.id,
			},
		});
		return {
			success: true,
			previousState,
			newState,
			journalEntryId,
			effectsScheduled: effectNames,
		};
	}

	// 6. Persist state change
	await ctx.db.patch(entityId as Id<"onboardingRequests">, {
		status: newState,
		machineContext: nextSnapshot.context,
		lastTransitionAt: Date.now(),
	});

	// 7. Write audit entry
	await auditLog.log(ctx, {
		action: `transition.${entityType}.${eventType.toLowerCase()}`,
		actorId: source?.actorId ?? "system",
		resourceType,
		resourceId: entityId,
		severity: "info",
		metadata: {
			journalEntryId,
			entityType,
			eventType,
			payload,
			previousState,
			newState,
			outcome: "transitioned",
			source: source ?? defaultSource,
			machineVersion: machine.id,
		},
	});

	// 8. Schedule effects (reuse extraction from step 5)
	const effectNames = await scheduleEffects(
		ctx,
		entityId,
		journalEntryId,
		scheduledEffects
	);

	// 9. Return
	return {
		success: true,
		previousState,
		newState,
		journalEntryId,
		effectsScheduled: effectNames,
	};
}
