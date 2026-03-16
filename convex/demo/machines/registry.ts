import { loanApplicationMachine } from "./loanApplication.machine";

export const machineRegistry = {
	loanApplication: loanApplicationMachine,
} as const;

export type EntityType = keyof typeof machineRegistry;
