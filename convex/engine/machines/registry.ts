import type { AnyStateMachine } from "xstate";
import type { EntityType } from "../types";
import { mortgageMachine } from "./mortgage.machine";
import { onboardingRequestMachine } from "./onboardingRequest.machine";

export const machineRegistry: Partial<Record<EntityType, AnyStateMachine>> = {
	mortgage: mortgageMachine,
	onboardingRequest: onboardingRequestMachine,
} as const;
