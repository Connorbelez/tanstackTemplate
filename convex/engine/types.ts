// ── Entity Types ────────────────────────────────────────────────────
// Kept in sync with entityTypeValidator in validators.ts
export type EntityType =
	| "onboardingRequest"
	| "mortgage"
	| "obligation"
	| "deal"
	| "provisionalApplication"
	| "applicationPackage"
	| "broker"
	| "borrower"
	| "lenderOnboarding"
	| "provisionalOffer"
	| "offerCondition"
	| "lenderRenewalIntent";

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

// ── Transition Result ───────────────────────────────────────────────
export interface TransitionResult {
	effectsScheduled?: string[];
	journalEntryId?: string;
	newState: string;
	previousState: string;
	reason?: string;
	success: boolean;
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
	deal: "deals",
	provisionalApplication: "provisionalApplications",
	applicationPackage: "applicationPackages",
	broker: "brokers",
	borrower: "borrowers",
	lenderOnboarding: "lenderOnboardings",
	provisionalOffer: "provisionalOffers",
	offerCondition: "offerConditions",
	lenderRenewalIntent: "lenderRenewalIntents",
} as const satisfies Record<EntityType, string>;
