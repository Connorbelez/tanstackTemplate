import { getNextSnapshot } from "xstate";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
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

/**
 * Core GT transition engine — called within mutations to maintain atomicity.
 *
 * Hydrates the entity's current state into an XState snapshot, computes the
 * next state via `getNextSnapshot()`, persists the change, writes to the
 * audit journal, and schedules any declared effects.
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
			requestId: "",
		},
	});

	// 4. Compute next state (pure — no side effects)
	const event = { type: eventType, ...payload } as Parameters<
		typeof getNextSnapshot<typeof machine>
	>[2];
	const nextSnapshot = getNextSnapshot(machine, currentSnapshot, event);
	const newState = nextSnapshot.value as string;

	// 5. Check if transition occurred
	if (newState === previousState) {
		// Transition rejected — log to journal
		await ctx.db.insert("auditJournal", {
			entityType,
			entityId: entityId as string,
			eventType,
			payload: payload as Record<string, unknown> | undefined,
			previousState,
			newState,
			outcome: "rejected",
			reason: `Event "${eventType}" not valid in state "${previousState}"`,
			source: source ?? { channel: "unknown" },
			machineVersion: machine.id,
			timestamp: Date.now(),
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

	// 7. Write journal entry
	const journalEntryId = await ctx.db.insert("auditJournal", {
		entityType,
		entityId: entityId as string,
		eventType,
		payload: payload as Record<string, unknown> | undefined,
		previousState,
		newState,
		outcome: "transitioned",
		source: source ?? { channel: "unknown" },
		machineVersion: machine.id,
		timestamp: Date.now(),
	});

	// 8. Schedule effects — extract action names from the snapshot's output
	// XState v5: nextSnapshot.output contains the actions that were executed
	// We look at the machine definition's transition actions instead
	const stateNode =
		machine.config.states?.[
			previousState as keyof typeof machine.config.states
		];
	const eventConfig =
		stateNode && "on" in stateNode
			? (stateNode.on as Record<string, unknown>)?.[eventType]
			: undefined;
	const actions =
		eventConfig && typeof eventConfig === "object" && "actions" in eventConfig
			? (eventConfig.actions as string[])
			: undefined;

	if (actions) {
		for (const actionName of actions) {
			if (actionName.startsWith("xstate.")) {
				continue;
			}
			const handler = effectRegistry[actionName];
			if (handler) {
				await ctx.scheduler.runAfter(0, handler, {
					entityId: entityId as string,
					journalEntryId,
					effectName: actionName,
				});
			}
		}
	}

	// 9. Return
	return { success: true, previousState, newState };
}
