import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appendAuditJournalEntry } from "../engine/auditJournal";
import { getMachineVersion } from "../engine/machines/registry";
import type {
	CommandSource,
	EntityType,
	GovernedEntityType,
} from "../engine/types";

export const SEED_SOURCE: CommandSource = {
	channel: "admin_dashboard",
	actorType: "system",
	actorId: "seed",
};

export const ONTARIO_PROVINCE_CODE = "ON";
export const SEED_TIME_ORIGIN_MS = Date.UTC(2026, 0, 15, 14, 0, 0, 0);
export const DEFAULT_JOURNAL_TIME_STEP_MS = 60_000;

interface OntarioAddressInput {
	city: string;
	postalCode: string;
	streetAddress: string;
	unit?: string;
}

export interface SeedUserFixture {
	address?: OntarioAddressInput;
	authId: string;
	dateOfBirth?: string;
	email: string;
	firstName: string;
	lastName: string;
	phoneNumber?: string;
}

export interface SeedOrganizationFixture {
	allowProfilesOutsideOrganization: boolean;
	externalId?: string;
	metadata?: Record<string, string>;
	name: string;
	workosId: string;
}

export interface WriteCreationJournalEntryArgs {
	entityId: string;
	entityType: EntityType;
	eventType?: string;
	initialState: string;
	payload?: Record<string, unknown>;
	source?: CommandSource;
	timestamp?: number;
}

export interface WriteSyntheticJournalTrailArgs {
	entityId: string;
	entityType: EntityType;
	eventMap?: Readonly<Record<string, string>>;
	payloadByTransition?: Readonly<Record<string, Record<string, unknown>>>;
	source?: CommandSource;
	startTimestamp?: number;
	statePath: readonly string[];
	stepMs?: number;
}

export function buildOntarioAddress(
	input: OntarioAddressInput
): NonNullable<Doc<"users">["address"]> {
	return {
		streetAddress: input.streetAddress,
		unit: input.unit,
		city: input.city,
		province: ONTARIO_PROVINCE_CODE,
		postalCode: input.postalCode,
	};
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function seedAuthIdFromEmail(email: string): string {
	return `seed_${normalizeEmail(email).replace(/[^a-z0-9]/g, "_")}`;
}

export function seedTimestamp(offsetMs = 0): number {
	return SEED_TIME_ORIGIN_MS + offsetMs;
}

export function seedTimestampSequence(
	count: number,
	startTimestamp = SEED_TIME_ORIGIN_MS,
	stepMs = DEFAULT_JOURNAL_TIME_STEP_MS
): number[] {
	const timestamps: number[] = [];
	for (let index = 0; index < count; index += 1) {
		timestamps.push(startTimestamp + index * stepMs);
	}
	return timestamps;
}

export async function findUserByEmail(
	ctx: Pick<MutationCtx, "db">,
	email: string
): Promise<Doc<"users"> | null> {
	const normalizedEmail = normalizeEmail(email);
	return ctx.db
		.query("users")
		.filter((q) => q.eq(q.field("email"), normalizedEmail))
		.first();
}

export async function ensureUserByEmail(
	ctx: Pick<MutationCtx, "db">,
	fixture: SeedUserFixture
): Promise<{ userId: Id<"users">; wasCreated: boolean }> {
	const normalizedEmail = normalizeEmail(fixture.email);
	const existing = await findUserByEmail(ctx, normalizedEmail);

	if (existing) {
		return { userId: existing._id, wasCreated: false };
	}

	const userId = await ctx.db.insert("users", {
		authId: fixture.authId,
		email: normalizedEmail,
		firstName: fixture.firstName,
		lastName: fixture.lastName,
		phoneNumber: fixture.phoneNumber,
		address: fixture.address ? buildOntarioAddress(fixture.address) : undefined,
		dateOfBirth: fixture.dateOfBirth,
	});

	return { userId, wasCreated: true };
}

export async function findOrganizationByWorkosId(
	ctx: Pick<MutationCtx, "db">,
	workosId: string
): Promise<Doc<"organizations"> | null> {
	return ctx.db
		.query("organizations")
		.withIndex("workosId", (q) => q.eq("workosId", workosId))
		.unique();
}

export async function ensureOrganization(
	ctx: Pick<MutationCtx, "db">,
	fixture: SeedOrganizationFixture
): Promise<{ organizationId: Id<"organizations">; wasCreated: boolean }> {
	const existing = await findOrganizationByWorkosId(ctx, fixture.workosId);
	if (existing) {
		return { organizationId: existing._id, wasCreated: false };
	}

	const organizationId = await ctx.db.insert("organizations", {
		workosId: fixture.workosId,
		name: fixture.name,
		allowProfilesOutsideOrganization: fixture.allowProfilesOutsideOrganization,
		externalId: fixture.externalId,
		metadata: fixture.metadata,
	});

	return { organizationId, wasCreated: true };
}

export async function findBrokerByLicenseId(
	ctx: Pick<MutationCtx, "db">,
	licenseId: string
): Promise<Doc<"brokers"> | null> {
	return ctx.db
		.query("brokers")
		.withIndex("by_license", (q) => q.eq("licenseId", licenseId))
		.first();
}

export async function findBorrowerByUserId(
	ctx: Pick<MutationCtx, "db">,
	userId: Id<"users">
): Promise<Doc<"borrowers"> | null> {
	return ctx.db
		.query("borrowers")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.first();
}

export async function findLenderByUserId(
	ctx: Pick<MutationCtx, "db">,
	userId: Id<"users">
): Promise<Doc<"lenders"> | null> {
	return ctx.db
		.query("lenders")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.first();
}

function isGovernedEntityType(
	entityType: EntityType
): entityType is GovernedEntityType {
	switch (entityType) {
		case "onboardingRequest":
		case "mortgage":
		case "obligation":
			return true;
		default:
			return false;
	}
}

function resolveMachineVersion(entityType: EntityType): string | undefined {
	if (!isGovernedEntityType(entityType)) {
		return undefined;
	}
	return getMachineVersion(entityType);
}

function normalizeSource(source?: CommandSource): Required<CommandSource> {
	const mergedSource = source ?? SEED_SOURCE;
	return {
		channel: mergedSource.channel,
		actorId: mergedSource.actorId ?? SEED_SOURCE.actorId ?? "seed",
		actorType: mergedSource.actorType ?? SEED_SOURCE.actorType ?? "system",
		ip: mergedSource.ip ?? "",
		sessionId: mergedSource.sessionId ?? "",
	};
}

export async function writeCreationJournalEntry(
	ctx: MutationCtx,
	args: WriteCreationJournalEntryArgs
): Promise<Id<"auditJournal">> {
	const source = normalizeSource(args.source);
	const machineVersion = resolveMachineVersion(args.entityType);
	return appendAuditJournalEntry(ctx, {
		entityId: args.entityId,
		entityType: args.entityType,
		eventType: args.eventType ?? "CREATED",
		payload: args.payload,
		previousState: "none",
		newState: args.initialState,
		outcome: "transitioned",
		actorId: source.actorId,
		actorType: source.actorType,
		channel: source.channel,
		ip: source.ip || undefined,
		sessionId: source.sessionId || undefined,
		machineVersion,
		timestamp: args.timestamp ?? Date.now(),
	});
}

export async function writeSyntheticJournalTrail(
	ctx: MutationCtx,
	args: WriteSyntheticJournalTrailArgs
): Promise<Id<"auditJournal">[]> {
	if (args.statePath.length < 2) {
		return [];
	}

	const source = normalizeSource(args.source);
	const machineVersion = resolveMachineVersion(args.entityType);
	const startTimestamp = args.startTimestamp ?? Date.now();
	const stepMs = args.stepMs ?? DEFAULT_JOURNAL_TIME_STEP_MS;
	const entries: Id<"auditJournal">[] = [];

	for (let index = 1; index < args.statePath.length; index += 1) {
		const previousState = args.statePath[index - 1];
		const newState = args.statePath[index];
		const transitionKey = `${previousState}->${newState}`;
		const eventType =
			args.eventMap?.[transitionKey] ?? `SEED_${newState.toUpperCase()}`;
		const payload = args.payloadByTransition?.[transitionKey];
		const timestamp = startTimestamp + (index - 1) * stepMs;

		const entryId = await appendAuditJournalEntry(ctx, {
			entityId: args.entityId,
			entityType: args.entityType,
			eventType,
			payload,
			previousState,
			newState,
			outcome: "transitioned",
			actorId: source.actorId,
			actorType: source.actorType,
			channel: source.channel,
			ip: source.ip || undefined,
			sessionId: source.sessionId || undefined,
			machineVersion,
			timestamp,
		});
		entries.push(entryId);
	}

	return entries;
}
