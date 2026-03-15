import { getNextSnapshot } from "xstate";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { effectRegistry } from "./effects/registry";
import { type EntityType, machineRegistry } from "./machines/registry";

export interface CommandSource {
	actorId?: string;
	actorType?: string;
	channel: string;
}

export interface TransitionResult {
	newState: string;
	previousState: string;
	reason?: string;
	success: boolean;
}

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
	machine: (typeof machineRegistry)[keyof typeof machineRegistry],
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
	entityId: Id<"onboardingRequests">,
	eventType: string,
	payload?: Record<string, unknown>,
	source?: CommandSource
): Promise<TransitionResult> {
	// 1. Load entity
	const entity = await ctx.db.get(entityId);
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
	const currentSnapshot = machine.resolveState({
		value: previousState,
		context: (entity.machineContext as { requestId: string }) ?? {
			requestId: entityId as string,
		},
	});

	// 4. Compute next state (pure — no side effects)
	const event = { ...(payload ?? {}), type: eventType } as Parameters<
		typeof getNextSnapshot<typeof machine>
	>[2];
	const nextSnapshot = getNextSnapshot(machine, currentSnapshot, event);
	const newState = nextSnapshot.value as string;
	const resourceType = getAuditResourceType(entityType);
	const journalEntryId = `${entityType}:${entityId}:${eventType}:${Date.now()}`;

	// 5. Check if transition occurred
	if (newState === previousState) {
		await auditLog.log(ctx, {
			action: `transition.${entityType}.rejected`,
			actorId: source?.actorId ?? "system",
			resourceType,
			resourceId: entityId as string,
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
				source: source ?? { channel: "unknown" },
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

	// 6. Persist state change
	await ctx.db.patch(entityId, {
		status: newState,
		machineContext: nextSnapshot.context,
		lastTransitionAt: Date.now(),
	});

	// 7. Write audit entry
	await auditLog.log(ctx, {
		action: `transition.${entityType}.${eventType.toLowerCase()}`,
		actorId: source?.actorId ?? "system",
		resourceType,
		resourceId: entityId as string,
		severity: "info",
		metadata: {
			journalEntryId,
			entityType,
			eventType,
			payload,
			previousState,
			newState,
			outcome: "transitioned",
			source: source ?? { channel: "unknown" },
			machineVersion: machine.id,
		},
	});

	// 8. Schedule effects
	for (const actionDescriptor of extractScheduledEffects(
		machine,
		previousState,
		eventType
	)) {
		if (actionDescriptor.actionType.startsWith("xstate.")) {
			continue;
		}

		const handler = effectRegistry[actionDescriptor.actionType];
		if (handler) {
			await ctx.scheduler.runAfter(0, handler, {
				entityId: entityId as string,
				journalEntryId,
				effectName: actionDescriptor.actionType,
				params: actionDescriptor.params,
			});
		}
	}

	// 9. Return
	return { success: true, previousState, newState };
}
