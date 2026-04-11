// ── Entity Types ────────────────────────────────────────────────────
// Kept in sync with entityTypeValidator in validators.ts
export type EntityType =
	| "onboardingRequest"
	| "mortgage"
	| "obligation"
	| "collectionAttempt"
	| "deal"
	| "transfer"
	| "servicingFeeEntry"
	| "dispersalCalculationRun"
	| "auditEvidencePackage"
	| "provisionalApplication"
	| "applicationPackage"
	| "broker"
	| "borrower"
	| "lender"
	| "lenderOnboarding"
	| "provisionalOffer"
	| "offerCondition"
	| "lenderRenewalIntent"
	| "dispersalEntry";

// ── Governed Entity Types ──────────────────────────────────────────
// Subset of EntityType that have XState machine definitions.
// TypeScript enforces completeness — machineRegistry must map every GovernedEntityType.
export type GovernedEntityType =
	| "onboardingRequest"
	| "mortgage"
	| "obligation"
	| "collectionAttempt"
	| "deal"
	| "transfer";

// ── Command Source ──────────────────────────────────────────────────
export type CommandChannel =
	| "borrower_portal"
	| "broker_portal"
	| "onboarding_portal"
	| "admin_dashboard"
	| "api_webhook"
	| "scheduler"
	| "simulation"
	| "principal_return";

export type ActorType = "borrower" | "broker" | "member" | "admin" | "system";

export interface CommandSource {
	actorId?: string;
	actorType?: ActorType;
	channel: CommandChannel;
	ip?: string;
	sessionId?: string;
}

// ── Command Envelope ────────────────────────────────────────────────
export interface Command<TPayload = Record<string, unknown>> {
	entityId: string;
	entityType: EntityType;
	eventType: string;
	payload?: TPayload;
	source: CommandSource;
}

// ── Deal Command Envelopes ─────────────────────────────────────────
export type DealEventType =
	| "DEAL_LOCKED"
	| "LAWYER_VERIFIED"
	| "REPRESENTATION_CONFIRMED"
	| "LAWYER_APPROVED_DOCUMENTS"
	| "ALL_PARTIES_SIGNED"
	| "FUNDS_RECEIVED"
	| "DEAL_CANCELLED";

export interface DealLockedPayload {
	closingDate: number;
}

export interface LawyerVerifiedPayload {
	verificationId: string;
}

export interface FundsReceivedPayload {
	method: "vopay" | "wire_receipt" | "manual";
}

export interface DealCancelledPayload {
	reason: string;
}

export type DealCommand =
	| (Command<DealLockedPayload> & {
			entityType: "deal";
			eventType: "DEAL_LOCKED";
			payload: DealLockedPayload;
	  })
	| (Command<LawyerVerifiedPayload> & {
			entityType: "deal";
			eventType: "LAWYER_VERIFIED";
			payload: LawyerVerifiedPayload;
	  })
	| (Command<Record<string, never>> & {
			entityType: "deal";
			eventType: "REPRESENTATION_CONFIRMED";
			payload?: undefined;
	  })
	| (Command<Record<string, never>> & {
			entityType: "deal";
			eventType: "LAWYER_APPROVED_DOCUMENTS";
			payload?: undefined;
	  })
	| (Command<Record<string, never>> & {
			entityType: "deal";
			eventType: "ALL_PARTIES_SIGNED";
			payload?: undefined;
	  })
	| (Command<FundsReceivedPayload> & {
			entityType: "deal";
			eventType: "FUNDS_RECEIVED";
			payload: FundsReceivedPayload;
	  })
	| (Command<DealCancelledPayload> & {
			entityType: "deal";
			eventType: "DEAL_CANCELLED";
			payload: DealCancelledPayload;
	  });

// ── Transition Result ───────────────────────────────────────────────
export interface TransitionResult {
	effectsScheduled?: string[];
	journalEntryId?: string;
	newState: string;
	previousState: string;
	reason?: string;
	success: boolean;
}

// ── Effect Payload ──────────────────────────────────────────────────
export interface EffectPayload {
	effectName: string;
	entityId: string;
	entityType: EntityType;
	eventType: string;
	journalEntryId: string;
	payload?: Record<string, unknown>;
	source: CommandSource;
}

// ── Audit Journal Entry ─────────────────────────────────────────────
// Mirrors the auditJournal table in schema.ts — source fields flattened for indexability
export interface AuditJournalEntry {
	// Source fields flattened (Convex cannot index nested objects)
	actorId: string;
	actorType?: ActorType;
	afterState?: Record<string, unknown>;
	beforeState?: Record<string, unknown>;
	channel: CommandChannel;
	correlationId?: string;
	delta?: Record<string, unknown>;
	effectiveDate: string;
	effectsScheduled?: string[];
	entityId: string;
	entityType: EntityType;
	eventCategory: string;
	eventId: string;
	eventType: string;
	/** Canonical idempotency key for the domain write, when available. */
	idempotencyKey?: string;
	ip?: string;
	/** WorkOS organization id or other legal-entity scope for compliance exports. */
	legalEntityId?: string;
	lenderId?: string;
	/** Linked record IDs that tie the event to related domain/ledger entities. */
	linkedRecordIds?: Record<string, unknown>;
	machineVersion?: string;
	mortgageId?: string;
	newState: string;
	obligationId?: string;
	organizationId?: string;
	/** WorkOS organization id for org-scoped audit queries */
	originSystem: string;
	outcome: "transitioned" | "rejected";
	payload?: Record<string, unknown>;
	previousState: string;
	reason?: string;
	requestId?: string;
	sequenceNumber: bigint;
	sessionId?: string;
	timestamp: number;
	transferRequestId?: string;
}

// ── Entity Type → Table Name Mapping ────────────────────────────────
export const ENTITY_TABLE_MAP = {
	onboardingRequest: "onboardingRequests",
	mortgage: "mortgages",
	obligation: "obligations",
	collectionAttempt: "collectionAttempts",
	deal: "deals",
	transfer: "transferRequests",
	servicingFeeEntry: "servicingFeeEntries",
	dispersalCalculationRun: "dispersalCalculationRuns",
	auditEvidencePackage: "auditEvidencePackages",
	provisionalApplication: "provisionalApplications",
	applicationPackage: "applicationPackages",
	broker: "brokers",
	borrower: "borrowers",
	lender: "lenders",
	lenderOnboarding: "lenderOnboardings",
	provisionalOffer: "provisionalOffers",
	offerCondition: "offerConditions",
	lenderRenewalIntent: "lenderRenewalIntents",
	dispersalEntry: "dispersalEntries",
} as const satisfies Record<EntityType, string>;
