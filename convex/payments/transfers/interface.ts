/**
 * TransferProvider strategy interface — defines the contract for all payment
 * provider integrations in the transfer domain.
 *
 * Phase 1: only ManualTransferProvider is implemented.
 * Phase 2+: real PAD, EFT, wire, and Plaid providers will be added with
 * zero changes to business logic that depends on this interface.
 */

import type { Id } from "../../_generated/dataModel";
import type { CommandSource } from "../../engine/types";
import type {
	CounterpartyType,
	ProviderCode,
	TransferDirection,
	TransferType,
} from "./types";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

/** Input for creating a transfer request */
export interface TransferRequestInput {
	/** Safe-integer cents - MUST be a positive integer */
	amount: number;
	bankAccountRef?: string;
	counterpartyId: string;
	counterpartyType: CounterpartyType;
	currency: "CAD";
	direction: TransferDirection;
	idempotencyKey: string;
	legNumber?: number;
	metadata?: Record<string, unknown>;
	pipelineId?: string;
	providerCode: ProviderCode;
	references: {
		mortgageId?: Id<"mortgages">;
		obligationId?: Id<"obligations">;
		dealId?: Id<"deals">;
		dispersalEntryId?: Id<"dispersalEntries">;
		planEntryId?: Id<"collectionPlanEntries">;
		collectionAttemptId?: Id<"collectionAttempts">;
	};
	source: CommandSource;
	transferType: TransferType;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Result of provider initiation */
export interface InitiateResult {
	providerRef: string;
	status: "pending" | "confirmed";
}

/** Result of provider confirmation */
export interface ConfirmResult {
	providerData?: Record<string, unknown>;
	providerRef: string;
	settledAmount?: number;
	settledAt: number;
}

/** Result of provider cancellation */
export interface CancelResult {
	cancelled: boolean;
}

/** Result of provider status check */
export interface StatusResult {
	providerData?: Record<string, unknown>;
	status: string;
}

// ---------------------------------------------------------------------------
// Strategy interface
// ---------------------------------------------------------------------------

/** Strategy interface for all payment providers */
export interface TransferProvider {
	cancel(providerRef: string): Promise<CancelResult>;
	confirm(providerRef: string): Promise<ConfirmResult>;
	getStatus(providerRef: string): Promise<StatusResult>;
	initiate(request: TransferRequestInput): Promise<InitiateResult>;
}
