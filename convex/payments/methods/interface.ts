/**
 * PaymentMethod interface — legacy inbound collection compatibility.
 *
 * This interface still supports older borrower-collection flows, but it is no
 * longer the forward-looking provider contract for new inbound work.
 *
 * Canonical contract guidance:
 * - New inbound provider integrations target `TransferProvider`.
 * - `PaymentMethod` exists as transitional compatibility while older flows are
 *   migrated behind the transfer-domain boundary.
 * - Collection Attempts remain the business execution record even when
 *   provider execution is delegated through transfer infrastructure.
 */

// ---------------------------------------------------------------------------
// Params & Results
// ---------------------------------------------------------------------------

export interface InitiateParams {
	/** Amount in cents */
	amount: number;
	borrowerId: string;
	metadata?: Record<string, unknown>;
	method: string;
	mortgageId: string;
	planEntryId: string;
}

export interface InitiateResult {
	providerRef: string;
	status: "pending" | "confirmed";
}

export interface ConfirmResult {
	providerData?: Record<string, unknown>;
	providerRef: string;
	settledAt: number;
}

export interface CancelResult {
	cancelled: boolean;
}

export interface StatusResult {
	providerData?: Record<string, unknown>;
	status: string;
}

// ---------------------------------------------------------------------------
// Compatibility interface
// ---------------------------------------------------------------------------

export interface PaymentMethod {
	cancel(ref: string): Promise<CancelResult>;
	confirm(ref: string): Promise<ConfirmResult>;
	getStatus(ref: string): Promise<StatusResult>;
	initiate(params: InitiateParams): Promise<InitiateResult>;
}
