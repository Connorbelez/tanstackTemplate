import { ConvexError } from "convex/values";

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;
}

function asNonEmptyString(value: unknown) {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : undefined;
}

export function hasRotessaCustomerReference(metadata: unknown) {
	const bankAccountMetadata = asRecord(metadata);
	return (
		(typeof bankAccountMetadata?.rotessaCustomerId === "number" &&
			Number.isFinite(bankAccountMetadata.rotessaCustomerId)) ||
		asNonEmptyString(bankAccountMetadata?.rotessaCustomerCustomIdentifier) !==
			undefined ||
		asNonEmptyString(bankAccountMetadata?.rotessaCustomIdentifier) !== undefined
	);
}

export function resolveRotessaCustomerReference(metadata: unknown) {
	const bankAccountMetadata = asRecord(metadata);
	const customerId = bankAccountMetadata?.rotessaCustomerId;
	if (typeof customerId === "number" && Number.isFinite(customerId)) {
		return { customerId };
	}

	const customerCustomIdentifier = asNonEmptyString(
		bankAccountMetadata?.rotessaCustomerCustomIdentifier
	);
	if (customerCustomIdentifier) {
		return {
			customIdentifier: customerCustomIdentifier,
		};
	}

	const customIdentifier = asNonEmptyString(
		bankAccountMetadata?.rotessaCustomIdentifier
	);
	if (customIdentifier) {
		return {
			customIdentifier,
		};
	}

	throw new ConvexError(
		"Rotessa recurring schedule activation requires one of bankAccount.metadata.rotessaCustomerId, bankAccount.metadata.rotessaCustomerCustomIdentifier, or bankAccount.metadata.rotessaCustomIdentifier."
	);
}
