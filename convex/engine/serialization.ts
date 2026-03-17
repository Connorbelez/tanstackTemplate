import type { StateValue } from "xstate";

function parseLegacyObjectStatus(status: string): StateValue {
	try {
		const parsed = JSON.parse(status) as unknown;
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed)
		) {
			throw new Error("Legacy JSON status must decode to an object");
		}

		serializeState(parsed as StateValue);
		return parsed as StateValue;
	} catch {
		throw new Error(
			`deserializeState could not parse legacy JSON status: "${status}"`
		);
	}
}

/**
 * Serialization helpers for XState compound state values.
 *
 * Flat string states pass through unchanged.
 * Compound states (single-region objects) serialize to dot-notation:
 *   { lawyerOnboarding: "verified" } -> "lawyerOnboarding.verified"
 */
export function serializeState(stateValue: StateValue): string {
	if (typeof stateValue === "string") {
		return stateValue;
	}

	const entries = Object.entries(stateValue);
	if (entries.length === 0) {
		throw new Error(
			"serializeStateValue: cannot serialize an empty state object"
		);
	}

	if (entries.length > 1) {
		throw new Error(
			"serializeStateValue: parallel states with multiple active regions are not supported by dot-notation serialization"
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
	const trimmedStatus = status.trim();
	if (trimmedStatus === "") {
		throw new Error("deserializeState requires a non-empty status string");
	}

	if (!trimmedStatus.includes(".")) {
		if (trimmedStatus.startsWith("{")) {
			return parseLegacyObjectStatus(trimmedStatus);
		}

		return trimmedStatus;
	}

	const parts = trimmedStatus.split(".");
	if (parts.some((part) => part === "")) {
		throw new Error(
			`deserializeState requires non-empty state segments; got "${status}"`
		);
	}

	let result: StateValue = parts.at(-1) ?? "";
	for (let index = parts.length - 2; index >= 0; index -= 1) {
		result = { [parts[index]]: result };
	}

	return result;
}

// Compatibility wrappers for older call sites that still use the *Status names.
export function serializeStatus(
	stateValue: string | Record<string, unknown>
): string {
	return serializeState(stateValue as StateValue);
}

export function deserializeStatus(
	status: string
): string | Record<string, unknown> {
	const trimmedStatus = status.trim();
	if (trimmedStatus.startsWith("{") || trimmedStatus.startsWith("[")) {
		try {
			const parsedStatus = JSON.parse(trimmedStatus) as unknown;
			if (
				parsedStatus !== null &&
				typeof parsedStatus === "object" &&
				!Array.isArray(parsedStatus)
			) {
				return parsedStatus as Record<string, unknown>;
			}

			return status;
		} catch {
			return status;
		}
	}

	return deserializeState(trimmedStatus) as string | Record<string, unknown>;
}
