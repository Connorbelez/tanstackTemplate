import type { StateValue } from "xstate";

/**
 * Serialization helpers for XState compound state values.
 *
 * Flat string states pass through unchanged.
 * Compound states (single-region objects) serialize to dot-notation:
 *   { lawyerOnboarding: "verified" } → "lawyerOnboarding.verified"
 */
export function serializeState(stateValue: StateValue): string {
	if (typeof stateValue === "string") {
		return stateValue;
	}

	const entries = Object.entries(stateValue);
	if (entries.length !== 1) {
		throw new Error(
			`serializeState only supports single-region compound states; got keys: ${Object.keys(stateValue).join(", ")}`
		);
	}

	const [region, subState] = entries[0];
	if (subState === undefined) {
		throw new Error(
			`serializeState encountered an undefined sub-state for region "${region}"`
		);
	}

	if (typeof subState === "string") {
		return `${region}.${subState}`;
	}

	return `${region}.${serializeState(subState)}`;
}

export function deserializeState(status: string): StateValue {
	if (status.trim() === "") {
		throw new Error("deserializeState requires a non-empty status string");
	}

	const trimmedStatus = status.trim();
	if (!status.includes(".")) {
		if (trimmedStatus.startsWith("{")) {
			try {
				const parsed = JSON.parse(trimmedStatus) as StateValue;
				serializeState(parsed);
				return parsed;
			} catch {
				throw new Error(
					`deserializeState could not parse legacy JSON status: "${status}"`
				);
			}
		}

		return status;
	}

	const parts = status.split(".");
	if (parts.some((part) => part === "")) {
		throw new Error(
			`deserializeState requires non-empty state segments; got "${status}"`
		);
	}

	const leaf = parts[parts.length - 1]!;
	let result: StateValue = leaf;

	for (let index = parts.length - 2; index >= 0; index--) {
		result = { [parts[index]]: result };
	}

	return result;
}
