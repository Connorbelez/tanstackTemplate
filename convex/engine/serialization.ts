/**
 * Serialization helpers for XState state values.
 *
 * Simple string states are stored as-is; parallel / compound state values
 * (represented as objects by XState) are serialized to JSON.
 */

export function serializeStatus(
	stateValue: string | Record<string, unknown>
): string {
	if (typeof stateValue === "string") {
		return stateValue;
	}
	return JSON.stringify(stateValue);
}

export function deserializeStatus(
	status: string
): string | Record<string, unknown> {
	if (status.startsWith("{")) {
		try {
			return JSON.parse(status) as Record<string, unknown>;
		} catch {
			return status;
		}
	}
	return status;
}
