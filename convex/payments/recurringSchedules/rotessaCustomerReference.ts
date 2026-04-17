import { ConvexError } from "convex/values";

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;
}

export function hasRotessaCustomerReference(metadata: unknown) {
	const bankAccountMetadata = asRecord(metadata);
	return (
		typeof bankAccountMetadata?.rotessaCustomerId === "number" ||
		typeof bankAccountMetadata?.rotessaCustomerCustomIdentifier === "string" ||
		typeof bankAccountMetadata?.rotessaCustomIdentifier === "string"
	);
}

export function resolveRotessaCustomerReference(metadata: unknown) {
	const bankAccountMetadata = asRecord(metadata);
	const customerId = bankAccountMetadata?.rotessaCustomerId;
	if (typeof customerId === "number" && Number.isFinite(customerId)) {
		return { customerId };
	}

	if (
		typeof bankAccountMetadata?.rotessaCustomerCustomIdentifier === "string"
	) {
		return {
			customIdentifier: bankAccountMetadata.rotessaCustomerCustomIdentifier,
		};
	}

	if (typeof bankAccountMetadata?.rotessaCustomIdentifier === "string") {
		return {
			customIdentifier: bankAccountMetadata.rotessaCustomIdentifier,
		};
	}

	throw new ConvexError(
		"Rotessa recurring schedule activation requires one of bankAccount.metadata.rotessaCustomerId, bankAccount.metadata.rotessaCustomerCustomIdentifier, or bankAccount.metadata.rotessaCustomIdentifier."
	);
}
