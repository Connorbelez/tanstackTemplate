import type { EntityType } from "../types";
import { onboardingRequestMachine } from "./onboardingRequest.machine";

export const machineRegistry: Partial<
	Record<EntityType, typeof onboardingRequestMachine>
> = {
	onboardingRequest: onboardingRequestMachine,
} as const;
