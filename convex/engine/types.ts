// ── Entity Types ────────────────────────────────────────────────────
// Kept in sync with entityTypeValidator in validators.ts
export type EntityType =
	| "onboardingRequest"
	| "mortgage"
	| "obligation"
	| "collectionAttempt"
	| "deal"
	| "provisionalApplication"
	| "applicationPackage"
	| "broker"
	| "borrower"
	| "lender"
	| "lenderOnboarding"
	| "provisionalOffer"
	| "offerCondition"
	| "lenderRenewalIntent";

// ── Governed Entity Types ──────────────────────────────────────────
// Subset of EntityType that have XState machine definitions.
// TypeScript enforces completeness — machineRegistry must map every GovernedEntityType.
export type GovernedEntityType =
	| "onboardingRequest"
	| "mortgage"
	| "obligation"
	| "collectionAttempt"
	| "deal";

// ── Command Source ──────────────────────────────────────────────────
export type CommandChannel =
	| "borrower_portal"
	| "broker_portal"
	| "onboarding_portal"
	| "admin_dashboard"
	| "api_webhook"
	| "scheduler";

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
	channel: CommandChannel;
	effectsScheduled?: string[];
	entityId: string;
	entityType: EntityType;
	eventType: string;
	ip?: string;
	machineVersion?: string;
	newState: string;
	outcome: "transitioned" | "rejected";
	payload?: Record<string, unknown>;
	previousState: string;
	reason?: string;
	sessionId?: string;
	timestamp: number;
}

// ── Entity Type → Table Name Mapping ────────────────────────────────
export const ENTITY_TABLE_MAP = {
	onboardingRequest: "onboardingRequests",
	mortgage: "mortgages",
	obligation: "obligations",
	collectionAttempt: "collectionAttempts",
	deal: "deals",
	provisionalApplication: "provisionalApplications",
	applicationPackage: "applicationPackages",
	broker: "brokers",
	borrower: "borrowers",
	lender: "lenders",
	lenderOnboarding: "lenderOnboardings",
	provisionalOffer: "provisionalOffers",
	offerCondition: "offerConditions",
	lenderRenewalIntent: "lenderRenewalIntents",
} as const satisfies Record<EntityType, string>;
