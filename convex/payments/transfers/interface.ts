/**
 * TransferProvider strategy interface — canonical provider contract for the
 * transfer domain and all new inbound provider work.
 *
 * Contract guidance:
 * - Collection Attempts remain the business execution record.
 * - Transfer execution is delegated through this interface and related
 *   transfer lifecycle infrastructure.
 *
 * Phase 1: only ManualTransferProvider is implemented.
 * Phase 2+: real PAD, EFT, wire, and other providers are added without
 * changing business logic that depends on this interface.
 */

import type { Id } from "../../_generated/dataModel";
import type { CommandSource } from "../../engine/types";
import type {
	CounterpartyType,
	DomainEntityId,
	ProviderCode,
	TransferDirection,
	TransferType,
} from "./types";

export interface ManualSettlementDetails {
	enteredBy?: string;
	evidenceAttachmentIds?: string[];
	externalReference?: string;
	instrumentType: "cash" | "cheque" | "wire" | "journal" | "other";
	location?: string;
	settlementOccurredAt: number;
}

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

/** Input for creating a transfer request */
export interface TransferRequestInput {
	/** Safe-integer cents - MUST be a positive integer */
	amount: number;
	bankAccountRef?: string;
	/** Validated domain entity ID; never a WorkOS auth ID. */
	counterpartyId: DomainEntityId;
	counterpartyType: CounterpartyType;
	currency: "CAD";
	direction: TransferDirection;
	idempotencyKey: string;
	legNumber?: number;
	manualSettlement?: ManualSettlementDetails;
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
	providerData?: Record<string, unknown>;
	providerRef: string;
	settledAt?: number;
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

/** Canonical strategy interface for transfer-domain providers */
export interface TransferProvider {
	cancel(providerRef: string): Promise<CancelResult>;
	confirm(providerRef: string): Promise<ConfirmResult>;
	getStatus(providerRef: string): Promise<StatusResult>;
	initiate(request: TransferRequestInput): Promise<InitiateResult>;
}
