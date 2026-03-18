/**
 * PaymentMethod interface — Strategy pattern for payment processing.
 *
 * Defines a family of payment algorithms (Manual, MockPAD, future real PAD)
 * that are interchangeable at runtime. Downstream consumers depend only on
 * this interface, never on concrete implementations.
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
// Strategy interface
// ---------------------------------------------------------------------------

export interface PaymentMethod {
	cancel(ref: string): Promise<CancelResult>;
	confirm(ref: string): Promise<ConfirmResult>;
	getStatus(ref: string): Promise<StatusResult>;
	initiate(params: InitiateParams): Promise<InitiateResult>;
}
