/**
 * Pure helpers for commitment deposit collection — safe to import from unit tests
 * and from Convex actions/mutations without pulling in `internalAction` wiring.
 */

import type { ProviderCode } from "./types";

/**
 * Builds a deterministic idempotency key. When both deal and application are
 * present, both are included so multiple applications under one deal do not
 * collide.
 */
export function buildCommitmentDepositIdempotencyKey(
	dealId: string | undefined,
	applicationId: string | undefined
): string {
	if (dealId !== undefined && applicationId !== undefined) {
		return `commitment-deposit:${dealId}:application:${applicationId}`;
	}
	if (dealId !== undefined) {
		return `commitment-deposit:${dealId}`;
	}
	if (applicationId !== undefined) {
		return `commitment-deposit:${applicationId}`;
	}
	throw new Error(
		"buildCommitmentDepositIdempotencyKey requires at least one of dealId or applicationId"
	);
}

export function getCommitmentDepositValidationError(args: {
	dealId?: string;
	applicationId?: string;
	amount: number;
}): string | null {
	if (!(args.dealId || args.applicationId)) {
		return "At least one of dealId or applicationId must be provided";
	}
	if (!Number.isInteger(args.amount) || args.amount <= 0) {
		return "Amount must be a positive integer (cents)";
	}
	return null;
}

export function buildCommitmentDepositMetadata(
	applicationId: string | undefined
): Record<string, string> | undefined {
	return applicationId ? { applicationId } : undefined;
}

export function resolveCommitmentDepositProviderCode(
	providerCode: ProviderCode | undefined
): ProviderCode {
	return providerCode ?? "manual";
}
