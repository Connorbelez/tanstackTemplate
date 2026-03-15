import { onboardingRequestMachine } from "./onboardingRequest.machine";

export const machineRegistry = {
	onboardingRequest: onboardingRequestMachine,
} as const;

export type EntityType = keyof typeof machineRegistry;
