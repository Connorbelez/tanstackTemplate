import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type MutationCtx,
	type QueryCtx,
} from "../_generated/server";
import { appendAuditJournalEntry } from "../engine/auditJournal";
import { entityTypeValidator } from "../engine/validators";

const auditEvidenceScopeValidator = v.object({
	entityId: v.optional(v.string()),
	entityType: v.optional(entityTypeValidator),
	lenderId: v.optional(v.id("lenders")),
	mortgageId: v.optional(v.id("mortgages")),
	obligationId: v.optional(v.id("obligations")),
	transferRequestId: v.optional(v.id("transferRequests")),
});

interface AuditEvidenceScope {
	entityId?: string;
	entityType?: Doc<"auditJournal">["entityType"];
	lenderId?: string;
	mortgageId?: string;
	obligationId?: string;
	transferRequestId?: string;
}

function normalizeScope(
	scope: {
		entityId?: string;
		entityType?: Doc<"auditJournal">["entityType"];
		lenderId?: string;
		mortgageId?: string;
		obligationId?: string;
		transferRequestId?: string;
	} | null
): AuditEvidenceScope {
	return {
		entityId: scope?.entityId,
		entityType: scope?.entityType,
		lenderId: scope?.lenderId ? `${scope.lenderId}` : undefined,
		mortgageId: scope?.mortgageId ? `${scope.mortgageId}` : undefined,
		obligationId: scope?.obligationId ? `${scope.obligationId}` : undefined,
		transferRequestId: scope?.transferRequestId
			? `${scope.transferRequestId}`
			: undefined,
	};
}

function csvEscape(value: unknown) {
	if (value == null) {
		return "";
	}
	const stringValue = typeof value === "string" ? value : JSON.stringify(value);
	if (
		stringValue.includes(",") ||
		stringValue.includes('"') ||
		stringValue.includes("\n")
	) {
		return `"${stringValue.replaceAll('"', '""')}"`;
	}
	return stringValue;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]) {
	const lines = [headers.join(",")];
	for (const row of rows) {
		lines.push(headers.map((header) => csvEscape(row[header])).join(","));
	}
	return lines.join("\n");
}

function scopeMatchesEvent(
	event: Doc<"auditJournal">,
	scope: AuditEvidenceScope
) {
	const linkedValues = Object.values(
		(event.linkedRecordIds as Record<string, unknown> | undefined) ?? {}
	).map((value) => `${value}`);

	if (scope.entityType && event.entityType !== scope.entityType) {
		return false;
	}
	if (scope.entityId && event.entityId !== scope.entityId) {
		return false;
	}
	if (
		scope.mortgageId &&
		event.entityId !== scope.mortgageId &&
		!linkedValues.includes(scope.mortgageId)
	) {
		return false;
	}
	if (
		scope.obligationId &&
		event.entityId !== scope.obligationId &&
		!linkedValues.includes(scope.obligationId)
	) {
		return false;
	}
	if (
		scope.lenderId &&
		event.entityId !== scope.lenderId &&
		!linkedValues.includes(scope.lenderId)
	) {
		return false;
	}
	if (
		scope.transferRequestId &&
		event.entityId !== scope.transferRequestId &&
		!linkedValues.includes(scope.transferRequestId)
	) {
		return false;
	}
	return true;
}

function scopeMatchesCashEntry(
	entry: Doc<"cash_ledger_journal_entries">,
	scope: AuditEvidenceScope
) {
	if (scope.mortgageId && `${entry.mortgageId}` !== scope.mortgageId) {
		return false;
	}
	if (scope.obligationId && `${entry.obligationId}` !== scope.obligationId) {
		return false;
	}
	if (scope.lenderId && `${entry.lenderId}` !== scope.lenderId) {
		return false;
	}
	if (
		scope.transferRequestId &&
		`${entry.transferRequestId}` !== scope.transferRequestId
	) {
		return false;
	}
	return true;
}

function reconstructEntitySnapshots(events: Doc<"auditJournal">[]) {
	const entities = new Map<
		string,
		{
			entityId: string;
			entityType: string;
			lastEventAt: number;
			lastEventType: string;
			state: unknown;
		}
	>();

	for (const event of events) {
		const key = `${event.entityType}:${event.entityId}`;
		entities.set(key, {
			entityId: event.entityId,
			entityType: event.entityType,
			lastEventAt: event.timestamp,
			lastEventType: event.eventType,
			state: event.afterState ?? {
				status: event.newState,
			},
		});
	}

	return Array.from(entities.values());
}

function reconstructBalances(entries: Doc<"cash_ledger_journal_entries">[]) {
	const balances = new Map<string, bigint>();
	for (const entry of entries) {
		const currentDebit = balances.get(`${entry.debitAccountId}`) ?? 0n;
		balances.set(`${entry.debitAccountId}`, currentDebit + entry.amount);

		const currentCredit = balances.get(`${entry.creditAccountId}`) ?? 0n;
		balances.set(`${entry.creditAccountId}`, currentCredit - entry.amount);
	}
	return Array.from(balances.entries()).map(([accountId, balance]) => ({
		accountId,
		balance: balance.toString(),
	}));
}

async function collectAuditEvidenceDataImpl(
	ctx: Pick<QueryCtx, "db">,
	args: {
		asOf: number;
		scope: unknown;
	}
) {
	const scope = normalizeScope(
		(args.scope as Parameters<typeof normalizeScope>[0] | undefined) ?? null
	);
	const [journalEvents, cashEntries] = await Promise.all([
		ctx.db.query("auditJournal").collect(),
		ctx.db.query("cash_ledger_journal_entries").collect(),
	]);

	const filteredEvents = journalEvents
		.filter((event) => event.timestamp <= args.asOf)
		.filter((event) => scopeMatchesEvent(event, scope))
		.sort((left, right) => {
			if (left.sequenceNumber < right.sequenceNumber) {
				return -1;
			}
			if (left.sequenceNumber > right.sequenceNumber) {
				return 1;
			}
			return 0;
		});

	const filteredCashEntries = cashEntries
		.filter((entry) => entry.timestamp <= args.asOf)
		.filter((entry) => scopeMatchesCashEntry(entry, scope))
		.sort((left, right) => {
			if (left.sequenceNumber < right.sequenceNumber) {
				return -1;
			}
			if (left.sequenceNumber > right.sequenceNumber) {
				return 1;
			}
			return 0;
		});

	return {
		cashEntries: filteredCashEntries,
		events: filteredEvents,
		entities: reconstructEntitySnapshots(filteredEvents),
		balances: reconstructBalances(filteredCashEntries),
		scope,
	};
}

async function recordAuditEvidenceAccessImpl(
	ctx: Pick<MutationCtx, "db" | "scheduler" | "runMutation">,
	args: {
		action: string;
		actorId?: string;
		asOf: number;
		packageId?: Doc<"auditEvidencePackages">["_id"];
		scope: unknown;
	}
) {
	const normalizedScope = normalizeScope(
		(args.scope as Parameters<typeof normalizeScope>[0] | undefined) ?? null
	);
	const packageEntityId = args.packageId
		? `${args.packageId}`
		: JSON.stringify(normalizedScope);

	await appendAuditJournalEntry(ctx as MutationCtx, {
		entityType: "auditEvidencePackage",
		entityId: packageEntityId,
		eventType: args.action,
		eventCategory: "audit_access",
		previousState: "none",
		newState: "accessed",
		outcome: "transitioned",
		actorId: args.actorId ?? "system",
		actorType: "system",
		channel: "admin_dashboard",
		payload: {
			asOf: args.asOf,
			scope: normalizedScope,
		},
		afterState: {
			action: args.action,
			asOf: args.asOf,
			packageId: args.packageId ? `${args.packageId}` : undefined,
			scope: normalizedScope,
		},
		timestamp: Date.now(),
	});
}

async function persistAuditEvidencePackageImpl(
	ctx: Pick<MutationCtx, "db" | "scheduler" | "runMutation">,
	args: {
		asOf: number;
		balancesCsv: string;
		createdBy: string;
		entitiesCsv: string;
		eventsCsv: string;
		eventsJson: string;
		format: "json" | "json_and_csv";
		linkageCsv: string;
		manifestJson: string;
		reconstructionNotes: string;
		scope: unknown;
		verificationJson?: string;
	}
) {
	const packageId = await ctx.db.insert("auditEvidencePackages", {
		scope: normalizeScope(
			(args.scope as Parameters<typeof normalizeScope>[0] | undefined) ?? null
		),
		asOf: args.asOf,
		format: args.format,
		manifestJson: args.manifestJson,
		eventsJson: args.eventsJson,
		eventsCsv: args.eventsCsv,
		entitiesCsv: args.entitiesCsv,
		balancesCsv: args.balancesCsv,
		linkageCsv: args.linkageCsv,
		reconstructionNotes: args.reconstructionNotes,
		verificationJson: args.verificationJson,
		createdAt: Date.now(),
		createdBy: args.createdBy,
	});

	await appendAuditJournalEntry(ctx as MutationCtx, {
		entityType: "auditEvidencePackage",
		entityId: `${packageId}`,
		eventType: "PACKAGE_GENERATED",
		eventCategory: "audit_access",
		previousState: "none",
		newState: "generated",
		outcome: "transitioned",
		actorId: args.createdBy,
		actorType: "system",
		channel: "admin_dashboard",
		payload: {
			asOf: args.asOf,
			format: args.format,
			scope: normalizeScope(
				(args.scope as Parameters<typeof normalizeScope>[0] | undefined) ?? null
			),
		},
		afterState: {
			_id: `${packageId}`,
			asOf: args.asOf,
			format: args.format,
			scope: normalizeScope(
				(args.scope as Parameters<typeof normalizeScope>[0] | undefined) ?? null
			),
		},
		timestamp: Date.now(),
	});

	return packageId;
}

export const collectAuditEvidenceData = internalQuery({
	args: {
		asOf: v.number(),
		scope: v.any(),
	},
	handler: async (ctx, args) => collectAuditEvidenceDataImpl(ctx, args),
});

export const recordAuditEvidenceAccess = internalMutation({
	args: {
		action: v.string(),
		actorId: v.optional(v.string()),
		asOf: v.number(),
		packageId: v.optional(v.id("auditEvidencePackages")),
		scope: v.any(),
	},
	handler: async (ctx, args) => recordAuditEvidenceAccessImpl(ctx, args),
});

export const persistAuditEvidencePackage = internalMutation({
	args: {
		asOf: v.number(),
		balancesCsv: v.string(),
		createdBy: v.string(),
		entitiesCsv: v.string(),
		eventsCsv: v.string(),
		eventsJson: v.string(),
		format: v.union(v.literal("json"), v.literal("json_and_csv")),
		linkageCsv: v.string(),
		manifestJson: v.string(),
		reconstructionNotes: v.string(),
		scope: v.any(),
		verificationJson: v.optional(v.string()),
	},
	handler: async (ctx, args) => persistAuditEvidencePackageImpl(ctx, args),
});

export const getAuditEvidencePackage = internalQuery({
	args: { packageId: v.id("auditEvidencePackages") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.packageId);
	},
});

export const listAuditPackages = internalMutation({
	args: {
		scope: v.optional(auditEvidenceScopeValidator),
	},
	handler: async (ctx, args) => {
		const packages = (
			await ctx.db.query("auditEvidencePackages").collect()
		).sort((left, right) => right.createdAt - left.createdAt);
		const scope = normalizeScope(args.scope ?? null);
		await recordAuditEvidenceAccessImpl(ctx, {
			action: "PACKAGE_LIST_VIEWED",
			asOf: Date.now(),
			scope: args.scope ?? {},
		});
		return packages.filter((pkg: Doc<"auditEvidencePackages">) => {
			if (scope.entityType && pkg.scope.entityType !== scope.entityType) {
				return false;
			}
			if (scope.entityId && pkg.scope.entityId !== scope.entityId) {
				return false;
			}
			return true;
		});
	},
});

export const getAuditEvidencePackageList = internalQuery({
	args: {},
	handler: async (ctx) => {
		return (await ctx.db.query("auditEvidencePackages").collect()).sort(
			(left, right) => right.createdAt - left.createdAt
		);
	},
});

export const generateAuditPackage = internalMutation({
	args: {
		asOf: v.number(),
		actorId: v.optional(v.string()),
		format: v.optional(v.union(v.literal("json"), v.literal("json_and_csv"))),
		scope: auditEvidenceScopeValidator,
	},
	handler: async (ctx, args) => {
		const collected = await collectAuditEvidenceDataImpl(ctx, {
			asOf: args.asOf,
			scope: args.scope,
		});

		const linkageRows = collected.events.flatMap((event: Doc<"auditJournal">) =>
			Object.entries(
				(event.linkedRecordIds as Record<string, unknown> | undefined) ?? {}
			).map(([key, value]) => ({
				entityId: event.entityId,
				entityType: event.entityType,
				eventId: event.eventId,
				linkKey: key,
				linkValue: `${value}`,
			}))
		);

		const manifest = {
			asOf: args.asOf,
			balanceCount: collected.balances.length,
			entityCount: collected.entities.length,
			eventCount: collected.events.length,
			format: args.format ?? "json_and_csv",
			generatedAt: Date.now(),
			scope: collected.scope,
		};

		const packageId = await persistAuditEvidencePackageImpl(ctx, {
			asOf: args.asOf,
			balancesCsv: toCsv(["accountId", "balance"], collected.balances),
			createdBy: args.actorId ?? "system",
			entitiesCsv: toCsv(
				["entityType", "entityId", "lastEventType", "lastEventAt", "state"],
				collected.entities.map(
					(entity: (typeof collected.entities)[number]) => ({
						...entity,
						state: entity.state,
					})
				)
			),
			eventsCsv: toCsv(
				[
					"sequenceNumber",
					"eventId",
					"eventCategory",
					"entityType",
					"entityId",
					"eventType",
					"outcome",
					"effectiveDate",
					"timestamp",
				],
				collected.events.map((event: Doc<"auditJournal">) => ({
					effectiveDate: event.effectiveDate,
					entityId: event.entityId,
					entityType: event.entityType,
					eventCategory: event.eventCategory,
					eventId: event.eventId,
					eventType: event.eventType,
					outcome: event.outcome,
					sequenceNumber: event.sequenceNumber.toString(),
					timestamp: event.timestamp,
				}))
			),
			eventsJson: JSON.stringify(collected.events, null, 2),
			format: args.format ?? "json_and_csv",
			linkageCsv: toCsv(
				["eventId", "entityType", "entityId", "linkKey", "linkValue"],
				linkageRows
			),
			manifestJson: JSON.stringify(manifest, null, 2),
			reconstructionNotes: [
				"# Reconstruction Notes",
				"",
				"- Source of truth: auditJournal sequence order plus cash ledger journal entries.",
				`- As of: ${new Date(args.asOf).toISOString()}`,
				`- Scope: ${JSON.stringify(collected.scope)}`,
				`- Entities reconstructed: ${collected.entities.length}`,
				`- Cash balances reconstructed: ${collected.balances.length}`,
			].join("\n"),
			scope: args.scope,
		});

		await recordAuditEvidenceAccessImpl(ctx, {
			action: "AUDIT_PACKAGE_EXPORTED",
			actorId: args.actorId,
			asOf: args.asOf,
			packageId,
			scope: args.scope,
		});

		return {
			artifacts: {
				"balances.csv": manifest.balanceCount,
				"entities.csv": manifest.entityCount,
				"events.csv": manifest.eventCount,
				"events.json": manifest.eventCount,
				"linkage.csv": linkageRows.length,
				"manifest.json": manifest,
				"reconstruction-notes.md": true,
			},
			packageId,
		};
	},
});

export const verifyAuditPackage = internalMutation({
	args: {
		actorId: v.optional(v.string()),
		packageId: v.optional(v.id("auditEvidencePackages")),
		scope: v.optional(auditEvidenceScopeValidator),
	},
	handler: async (ctx, args) => {
		const packageDoc = args.packageId ? await ctx.db.get(args.packageId) : null;
		const sourceScope = args.scope ?? packageDoc?.scope;
		if (!sourceScope) {
			throw new Error("verifyAuditPackage requires packageId or scope");
		}

		const asOf = packageDoc?.asOf ?? Date.now();
		const collected = await collectAuditEvidenceDataImpl(ctx, {
			asOf,
			scope: sourceScope,
		});

		let isSequenceValid = true;
		for (let index = 1; index < collected.events.length; index += 1) {
			if (
				collected.events[index - 1].sequenceNumber >=
				collected.events[index].sequenceNumber
			) {
				isSequenceValid = false;
				break;
			}
		}

		const verification = {
			asOf,
			eventCount: collected.events.length,
			isSequenceValid,
			scope: normalizeScope(sourceScope),
			verifiedAt: Date.now(),
		};

		await recordAuditEvidenceAccessImpl(ctx, {
			action: "AUDIT_PACKAGE_VERIFIED",
			actorId: args.actorId,
			asOf,
			packageId: args.packageId,
			scope: sourceScope,
		});

		if (args.packageId) {
			await ctx.db.patch(args.packageId, {
				verificationJson: JSON.stringify(verification, null, 2),
			});
		}

		return verification;
	},
});

export const reconstructEntityState = internalMutation({
	args: {
		actorId: v.optional(v.string()),
		asOf: v.number(),
		entityId: v.string(),
		entityType: entityTypeValidator,
	},
	handler: async (ctx, args) => {
		const collected = await collectAuditEvidenceDataImpl(ctx, {
			asOf: args.asOf,
			scope: {
				entityId: args.entityId,
				entityType: args.entityType,
			},
		});

		const latestEvent = collected.events.at(-1) ?? null;
		await recordAuditEvidenceAccessImpl(ctx, {
			action: "ENTITY_STATE_RECONSTRUCTED",
			actorId: args.actorId,
			asOf: args.asOf,
			scope: {
				entityId: args.entityId,
				entityType: args.entityType,
			},
		});

		return {
			asOf: args.asOf,
			entityId: args.entityId,
			entityType: args.entityType,
			eventCount: collected.events.length,
			state:
				latestEvent?.afterState ??
				(latestEvent
					? {
							status: latestEvent.newState,
						}
					: null),
		};
	},
});

export const reconstructLedgerBalances = internalMutation({
	args: {
		actorId: v.optional(v.string()),
		asOf: v.number(),
		scope: auditEvidenceScopeValidator,
	},
	handler: async (ctx, args) => {
		const collected = await collectAuditEvidenceDataImpl(ctx, {
			asOf: args.asOf,
			scope: args.scope,
		});

		await recordAuditEvidenceAccessImpl(ctx, {
			action: "LEDGER_BALANCES_RECONSTRUCTED",
			actorId: args.actorId,
			asOf: args.asOf,
			scope: args.scope,
		});

		return {
			asOf: args.asOf,
			balanceCount: collected.balances.length,
			balances: collected.balances,
		};
	},
});
