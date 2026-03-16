import type { AnyStateMachine } from "xstate";
import type { GovernedEntityType } from "../types";
import { mortgageMachine } from "./mortgage.machine";
import { obligationMachine } from "./obligation.machine";
import { onboardingRequestMachine } from "./onboardingRequest.machine";

/**
 * Type-safe registry mapping every GovernedEntityType to its XState machine.
 * Adding a new governed entity requires a one-line addition here — TypeScript
 * enforces completeness via the Record key type.
 */
export const machineRegistry: Record<GovernedEntityType, AnyStateMachine> = {
	mortgage: mortgageMachine,
	obligation: obligationMachine,
	onboardingRequest: onboardingRequestMachine,
} as const;

/**
 * Returns a version string for audit journal entries.
 * Format: "{machineId}@{version}" (defaults to "1.0.0" if no version is set).
 */
export function getMachineVersion(entityType: GovernedEntityType): string {
	const machine = machineRegistry[entityType];
	return `${machine.id}@${machine.version ?? "1.0.0"}`;
}
