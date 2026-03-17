import type { GenericId } from "convex/values";
import { ConvexError } from "convex/values";
import type { AnyStateMachine, StateValue } from "xstate";
import { getNextSnapshot } from "xstate";
import type { TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { appendAuditJournalEntry } from "./auditJournal";
import { effectRegistry } from "./effects/registry";
import { getMachineVersion, machineRegistry } from "./machines/registry";
import { deserializeState, serializeState } from "./serialization";
import type {
	CommandSource,
	EntityType,
	GovernedEntityType,
	TransitionResult,
} from "./types";
import { ENTITY_TABLE_MAP } from "./types";

function isGovernedEntityType(
	entityType: EntityType
): entityType is GovernedEntityType {
	return (
		entityType in machineRegistry &&
		Boolean(machineRegistry[entityType as GovernedEntityType])
	);
}

interface ScheduledEffectDescriptor {
	actionType: string;
	params?: Record<string, unknown>;
}

interface MachineConfigStateNode {
	on?: Record<string, unknown>;
	states?: Record<string, MachineConfigStateNode>;
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

function getActiveStatePath(stateValue: StateValue): string[] {
	if (typeof stateValue === "string") {
		return [stateValue];
	}

	const entries = Object.entries(stateValue);
	if (entries.length !== 1) {
		throw new Error(
			`extractScheduledEffects only supports a single active state path; got: ${Object.keys(stateValue).join(", ")}`
		);
	}

	const [region, subState] = entries[0]!;
	if (typeof subState === "string") {
		return [region, subState];
	}

	return [region, ...getActiveStatePath(subState)];
}

function getActiveStateNodes(
	machine: AnyStateMachine,
	activeStatePath: string[]
): MachineConfigStateNode[] {
	const nodes: MachineConfigStateNode[] = [];
	let states = machine.config.states as Record<string, MachineConfigStateNode> | undefined;

	for (const segment of activeStatePath) {
		if (!states) {
			break;
		}

		const stateNode = states[segment];
		if (!stateNode) {
			break;
		}

		nodes.push(stateNode);
		states = stateNode.states;
	}

	return nodes;
}

function extractScheduledEffects(
	machine: AnyStateMachine,
	previousStateValue: StateValue,
	eventType: string
): ScheduledEffectDescriptor[] {
	const activeStateNodes = getActiveStateNodes(
		machine,
		getActiveStatePath(previousStateValue)
	);
	const eventConfig =
		[...activeStateNodes]
			.reverse()
			.find((stateNode) => stateNode.on?.[eventType] !== undefined)?.on?.[
				eventType
			] ?? (machine.config.on as Record<string, unknown> | undefined)?.[eventType];
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
 * Checks whether a named action resolves to an XState built-in action (assign, raise, etc.)
 * rather than an effect-marker action. Built-in actions are executed during the pure COMPUTE
 * step and should NOT be scheduled as effects.
 */
function isBuiltInAction(
	machine: AnyStateMachine,
	actionName: string
): boolean {
	const implementations = machine.implementations?.actions;
	if (!implementations) {
		return false;
	}
	const impl = implementations[actionName];
	if (!impl || typeof impl !== "object") {
		return false;
	}
	const implType = (impl as { type?: string }).type;
	return typeof implType === "string" && implType.startsWith("xstate.");
}

async function scheduleEffects(
	ctx: MutationCtx,
	machine: AnyStateMachine,
	entityId: string,
	entityType: EntityType,
	eventType: string,
	journalEntryId: string,
	source: CommandSource,
	payload: Record<string, unknown> | undefined,
	scheduledEffects: ScheduledEffectDescriptor[]
): Promise<string[]> {
	const effectNames: string[] = [];
	for (const actionDescriptor of scheduledEffects) {
		if (actionDescriptor.actionType.startsWith("xstate.")) {
			continue;
		}
		// Skip XState built-in actions (assign, raise, etc.) — they execute
		// during the pure COMPUTE step, not as scheduled effects.
		if (isBuiltInAction(machine, actionDescriptor.actionType)) {
			continue;
		}
		const handler = effectRegistry[actionDescriptor.actionType];
		if (handler) {
			await ctx.scheduler.runAfter(0, handler, {
				entityId,
				entityType,
				eventType,
				journalEntryId,
				effectName: actionDescriptor.actionType,
				payload: actionDescriptor.params ?? payload,
				source,
			});
			effectNames.push(actionDescriptor.actionType);
		} else {
			console.warn(
				`[GT Effect Scheduler] No handler registered for effect "${actionDescriptor.actionType}". Skipping.`
			);
		}
	}
	return effectNames;
}

/**
 * Core GT transition engine — called within mutations to maintain atomicity.
 *
 * Implements the 8-step pipeline:
 * 1. RESOLVE — Look up machine from registry (fail fast for unknown entity types)
 * 2. LOAD — Read entity record (status + machineContext)
 * 3. HYDRATE — Restore XState snapshot from persisted state
 * 4. COMPUTE — Pure `getNextSnapshot()` call
 * 5. DETECT — Compare new vs previous state; unchanged → rejection path
 * 6. PERSIST — Atomic patch + audit journal entry
 * 7. AUDIT — Layer 2 hash-chain entry (via appendAuditJournalEntry)
 * 8. EFFECTS — Schedule declared actions
 */
export async function executeTransition(
	ctx: MutationCtx,
	command: {
		entityType: EntityType;
		entityId: string;
		eventType: string;
		payload?: Record<string, unknown>;
		source?: CommandSource;
	}
): Promise<TransitionResult> {
	const { entityType, entityId, eventType, payload } = command;
	const source: CommandSource = command.source ?? { channel: "scheduler" };

	// ── 1. RESOLVE ──────────────────────────────────────────────────────
	// Fail fast before any DB reads if the entity type has no registered machine.
	if (!isGovernedEntityType(entityType)) {
		throw new ConvexError({
			code: "UNKNOWN_ENTITY_TYPE",
			message: `No machine registered for entity type: ${entityType}`,
		});
	}
	const machine = machineRegistry[entityType];
	const machineVersion = getMachineVersion(entityType);

	// ── 2. LOAD ─────────────────────────────────────────────────────────
	const tableName = ENTITY_TABLE_MAP[entityType];
	const entity = await ctx.db.get(
		entityId as GenericId<typeof tableName & TableNames>
	);
	if (!entity) {
		throw new ConvexError({
			code: "ENTITY_NOT_FOUND",
			message: `Entity ${entityType}/${entityId} not found`,
		});
	}

	// ── 3. HYDRATE ───────────────────────────────────────────────────────
	// Cast to a governed record shape — all governed entities share `status` + `machineContext`.
	const governedEntity = entity as unknown as {
		status: string;
		machineContext?: Record<string, unknown>;
	};
	const previousStateValue = deserializeState(governedEntity.status);
	const previousStateSerialized = serializeState(previousStateValue);
	const hydratedContext = (governedEntity.machineContext ?? {}) as Parameters<
		typeof machine.resolveState
	>[0]["context"];
	const currentSnapshot = machine.resolveState({
		value: previousStateValue as Parameters<
			typeof machine.resolveState
		>[0]["value"],
		context: hydratedContext,
	});

	// ── 4. COMPUTE ───────────────────────────────────────────────────────
	const event = { ...(payload ?? {}), type: eventType } as Parameters<
		typeof getNextSnapshot<typeof machine>
	>[2];
	const nextSnapshot = getNextSnapshot(machine, currentSnapshot, event);
	const newStateValue = nextSnapshot.value as StateValue;
	const newStateSerialized = serializeState(newStateValue);

	const resourceType = tableName;
	let journalEntryId = `${entityType}:${entityId}:${eventType}:${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

	// ── 5. DETECT ────────────────────────────────────────────────────────
	const scheduledEffects = extractScheduledEffects(
		machine,
		previousStateValue,
		eventType
	);
	const hasEffects = scheduledEffects.length > 0;

	if (newStateSerialized === previousStateSerialized) {
		if (!hasEffects) {
			// No state change and no effects — event is rejected
			journalEntryId = await appendAuditJournalEntry(ctx, {
				actorId: source.actorId ?? "system",
				actorType: source.actorType,
				channel: source.channel,
				entityId,
				entityType,
				eventType,
				ip: source.ip,
				sessionId: source.sessionId,
				payload,
				previousState: previousStateSerialized,
				newState: newStateSerialized,
				outcome: "rejected",
				reason: `Event "${eventType}" not valid in state "${previousStateSerialized}"`,
				machineVersion,
				timestamp: Date.now(),
			});

			await auditLog.log(ctx, {
				action: `transition.${entityType}.rejected`,
				actorId: source.actorId ?? "system",
				resourceType,
				resourceId: entityId,
				severity: "warning",
				metadata: {
					journalEntryId,
					entityType,
					eventType,
					payload,
					previousState: previousStateSerialized,
					newState: newStateSerialized,
					outcome: "rejected",
					reason: `Event "${eventType}" not valid in state "${previousStateSerialized}"`,
					source,
					machineVersion,
				},
			});
			return {
				success: false,
				previousState: previousStateSerialized,
				newState: newStateSerialized,
				reason: `Event "${eventType}" not valid in state "${previousStateSerialized}"`,
			};
		}

		// Same state but has effects — write journal entry for traceability and
		// deterministic idempotency key, then schedule effects.
		journalEntryId = await appendAuditJournalEntry(ctx, {
			actorId: source.actorId ?? "system",
			actorType: source.actorType,
			channel: source.channel,
			entityId,
			entityType,
			eventType,
			ip: source.ip,
			sessionId: source.sessionId,
			payload,
			previousState: previousStateSerialized,
			newState: newStateSerialized,
			outcome: "transitioned",
			reason: "same_state_with_effects",
			machineVersion,
			timestamp: Date.now(),
		});
		const effectNames = await scheduleEffects(
			ctx,
			machine,
			entityId,
			entityType,
			eventType,
			journalEntryId,
			source,
			payload,
			scheduledEffects
		);
		await auditLog.log(ctx, {
			action: `transition.${entityType}.${eventType.toLowerCase()}`,
			actorId: source.actorId ?? "system",
			resourceType,
			resourceId: entityId,
			severity: "info",
			metadata: {
				journalEntryId,
				entityType,
				eventType,
				payload,
				previousState: previousStateSerialized,
				newState: newStateSerialized,
				outcome: "same_state_with_effects",
				effectsScheduled: effectNames,
				source,
				machineVersion,
			},
		});
		return {
			success: true,
			previousState: previousStateSerialized,
			newState: newStateSerialized,
			journalEntryId,
			effectsScheduled: effectNames,
		};
	}

	// ── 6. PERSIST ───────────────────────────────────────────────────────
	await ctx.db.patch(entityId as GenericId<typeof tableName & TableNames>, {
		status: newStateSerialized,
		machineContext: nextSnapshot.context,
		lastTransitionAt: Date.now(),
	});
	journalEntryId = await appendAuditJournalEntry(ctx, {
		actorId: source.actorId ?? "system",
		actorType: source.actorType,
		channel: source.channel,
		entityId,
		entityType,
		eventType,
		ip: source.ip,
		sessionId: source.sessionId,
		payload,
		previousState: previousStateSerialized,
		newState: newStateSerialized,
		outcome: "transitioned",
		machineVersion,
		timestamp: Date.now(),
	});

	// ── 7. AUDIT (Layer 2 — handled inside appendAuditJournalEntry) ────
	await auditLog.log(ctx, {
		action: `transition.${entityType}.${eventType.toLowerCase()}`,
		actorId: source.actorId ?? "system",
		resourceType,
		resourceId: entityId,
		severity: "info",
		metadata: {
			journalEntryId,
			entityType,
			eventType,
			payload,
			previousState: previousStateSerialized,
			newState: newStateSerialized,
			outcome: "transitioned",
			source,
			machineVersion,
		},
	});

	// ── 8. EFFECTS ───────────────────────────────────────────────────────
	const effectNames = await scheduleEffects(
		ctx,
		machine,
		entityId,
		entityType,
		eventType,
		journalEntryId,
		source,
		payload,
		scheduledEffects
	);

	// ── 9. Return ────────────────────────────────────────────────────────
	return {
		success: true,
		previousState: previousStateSerialized,
		newState: newStateSerialized,
		journalEntryId,
		effectsScheduled: effectNames,
	};
}
