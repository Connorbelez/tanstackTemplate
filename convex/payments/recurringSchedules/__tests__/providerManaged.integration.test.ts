import { webcrypto } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { makeFunctionReference } from "convex/server";
import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import workflowSchema from "../../../../node_modules/@convex-dev/workflow/dist/component/schema.js";
import workpoolSchema from "../../../../node_modules/@convex-dev/workpool/dist/component/schema.js";
import {
	drainScheduledWork,
	seedBorrowerProfile,
	seedMortgage,
	seedPlanEntry,
} from "../../../../src/test/convex/payments/helpers";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { auditLog } from "../../../auditLog";
import auditTrailSchema from "../../../components/auditTrail/schema";
import schema from "../../../schema";
import { RotessaRecurringScheduleProvider } from "../providers/rotessaRecurring";
import type { RotessaTransactionReportRow } from "../types";

type ConvexModuleLoader = () => Promise<unknown>;

const testGlobal = globalThis as typeof globalThis & {
	process?: {
		env: Record<string, string | undefined>;
	};
};

let previousEnv: {
	DISABLE_CASH_LEDGER_HASHCHAIN?: string;
	DISABLE_GT_HASHCHAIN?: string;
	ROTESSA_API_KEY?: string;
};

if (!testGlobal.process) {
	testGlobal.process = process as unknown as {
		env: Record<string, string | undefined>;
	};
}

function compareModuleKeys(a: string, b: string) {
	const aIsRootGenerated = a.startsWith("/convex/_generated/");
	const bIsRootGenerated = b.startsWith("/convex/_generated/");
	if (aIsRootGenerated !== bIsRootGenerated) {
		return aIsRootGenerated ? -1 : 1;
	}
	return a.localeCompare(b);
}

function loadModulesFromRoot(root: URL, mountPrefix: string) {
	const moduleEntries: [string, ConvexModuleLoader][] = [];

	const walk = (dir: URL, relativePath: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const nextRelativePath = relativePath
				? `${relativePath}/${entry.name}`
				: entry.name;
			const nextUrl = new URL(
				`${entry.name}${entry.isDirectory() ? "/" : ""}`,
				dir
			);

			if (entry.isDirectory()) {
				if (entry.name === "__tests__") {
					continue;
				}
				walk(nextUrl, nextRelativePath);
				continue;
			}

			if (!(entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
				continue;
			}
			if (entry.name.endsWith(".d.ts")) {
				continue;
			}

			moduleEntries.push([
				join(mountPrefix, nextRelativePath).replaceAll("\\", "/"),
				() => import(nextUrl.href),
			]);
		}
	};

	walk(root, "");

	return Object.fromEntries(
		moduleEntries.sort(([left], [right]) => compareModuleKeys(left, right))
	);
}

function createDynamicConvexHarness() {
	const t = convexTest(
		schema,
		loadModulesFromRoot(new URL("../../../", import.meta.url), "/convex")
	);
	auditLogTest.register(t, "auditLog");
	t.registerComponent(
		"auditTrail",
		auditTrailSchema,
		loadModulesFromRoot(
			new URL("../../../components/auditTrail/", import.meta.url),
			"/convex/components/auditTrail"
		)
	);
	t.registerComponent(
		"workflow",
		workflowSchema,
		loadModulesFromRoot(
			new URL(
				"../../../../node_modules/@convex-dev/workflow/dist/component/",
				import.meta.url
			),
			"/node_modules/@convex-dev/workflow/dist/component"
		)
	);
	t.registerComponent(
		"workflow/workpool",
		workpoolSchema,
		loadModulesFromRoot(
			new URL(
				"../../../../node_modules/@convex-dev/workpool/dist/component/",
				import.meta.url
			),
			"/node_modules/@convex-dev/workpool/dist/component"
		)
	);
	return t;
}

const activateRecurringScheduleRef = makeFunctionReference<
	"action",
	{
		asOf?: number;
		bankAccountId: Id<"bankAccounts">;
		mortgageId: Id<"mortgages">;
		planEntryIds?: Id<"collectionPlanEntries">[];
		providerCode: "pad_rotessa";
	},
	Promise<{ scheduleId: Id<"externalCollectionSchedules"> }>
>("payments/recurringSchedules/activation:activateRecurringSchedule");

const processRotessaPadWebhookRef = makeFunctionReference<
	"action",
	{
		date?: string;
		eventId?: string;
		eventType: string;
		reason?: string;
		returnCode?: string;
		transactionId: string;
		webhookEventId: Id<"webhookEvents">;
	},
	Promise<void>
>("payments/webhooks/rotessaPad:processRotessaPadWebhook");

const pollProviderManagedSchedulesRef = makeFunctionReference<
	"action",
	{
		asOf?: number;
		limit?: number;
	},
	Promise<{
		candidateCount: number;
		claimedCount: number;
		failedCount: number;
		ingestedEventCount: number;
		syncedCount: number;
	}>
>("payments/recurringSchedules/poller:pollProviderManagedSchedules");

const listSchedulesEligibleForPollingRef = makeFunctionReference<
	"query",
	{
		asOf: number;
		limit?: number;
	},
	Promise<
		Array<{
			_id: Id<"externalCollectionSchedules">;
			status: string;
		}>
	>
>("payments/recurringSchedules/queries:listSchedulesEligibleForPolling");

const TRANSACTION_SCHEDULE_PATH_RE = /\/transaction_schedules\/\d+$/;

function jsonResponse(body: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(body), {
		headers: { "Content-Type": "application/json" },
		status: 200,
		...init,
	});
}

function createRotessaTransactionRow(args: {
	amountCents?: number;
	processDate: string;
	scheduleId: number;
	status: RotessaTransactionReportRow["status"];
	transactionId: string;
	transactionNumber?: string;
	updatedAt: string;
	statusReason?: string | null;
}) {
	return {
		account_number: "1234567",
		amount: ((args.amountCents ?? 300_000) / 100).toFixed(2),
		comment: "provider managed schedule",
		created_at: args.updatedAt,
		custom_identifier: "borrower-rotessa-001",
		customer_id: 42,
		earliest_approval_date: null,
		id: Number(args.transactionId.replace(/\D/g, "")) || 1,
		institution_number: "001",
		process_date: args.processDate,
		settlement_date: args.status === "Approved" ? args.processDate : null,
		status: args.status,
		status_reason: args.statusReason ?? null,
		transaction_number: args.transactionNumber ?? args.transactionId,
		transaction_schedule_id: args.scheduleId,
		transit_number: "00011",
		updated_at: args.updatedAt,
	} satisfies RotessaTransactionReportRow;
}

function installRotessaFetchHarness() {
	let transactionRows: RotessaTransactionReportRow[] = [];
	let scheduleResponse = {
		amount: "3000.00",
		comment: "provider managed schedule",
		created_at: "2026-01-01T00:00:00.000Z",
		financial_transactions: [],
		frequency: "Monthly",
		id: 987,
		installments: 12,
		next_process_date: "2026-02-15",
		process_date: "2026-02-15",
		updated_at: "2026-01-01T00:00:00.000Z",
	};

	const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		if (
			(url.pathname.endsWith("/transaction_schedules") ||
				url.pathname.endsWith(
					"/transaction_schedules/create_with_custom_identifier"
				)) &&
			(init?.method ?? "GET") === "POST"
		) {
			return jsonResponse(scheduleResponse);
		}

		if (TRANSACTION_SCHEDULE_PATH_RE.test(url.pathname)) {
			return jsonResponse(scheduleResponse);
		}

		if (url.pathname.endsWith("/transaction_report")) {
			return jsonResponse(transactionRows);
		}

		return new Response("not found", { status: 404 });
	});

	vi.stubGlobal("fetch", fetchMock);

	return {
		fetchMock,
		setNextProcessDate(nextProcessDate: string | null) {
			scheduleResponse = {
				...scheduleResponse,
				next_process_date: nextProcessDate,
			};
		},
		setTransactionRows(rows: RotessaTransactionReportRow[]) {
			transactionRows = rows;
		},
	};
}

async function seedProviderManagedFixture() {
	const t = createDynamicConvexHarness();
	const borrowerId = await seedBorrowerProfile(t);
	const mortgageId = await seedMortgage(t);

	await t.run(async (ctx) => {
		await ctx.db.insert("mortgageBorrowers", {
			addedAt: Date.now(),
			borrowerId,
			mortgageId,
			role: "primary",
		});
	});

	const bankAccountId = await t.run(async (ctx) =>
		ctx.db.insert("bankAccounts", {
			ownerType: "borrower",
			ownerId: `${borrowerId}`,
			institutionNumber: "001",
			transitNumber: "00011",
			accountLast4: "6789",
			status: "validated",
			validationMethod: "provider_verified",
			mandateStatus: "active",
			isDefaultInbound: true,
			country: "CA",
			currency: "CAD",
			createdAt: Date.now(),
			metadata: {
				rotessaCustomerCustomIdentifier: "borrower-rotessa-001",
			},
		})
	);

	await t.mutation(internal.payments.obligations.generate.generateObligations, {
		mortgageId,
	});

	const mortgage = await t.run((ctx) => ctx.db.get(mortgageId));
	if (!mortgage) {
		throw new Error("expected seeded mortgage");
	}

	await t.mutation(
		internal.payments.collectionPlan.mutations.scheduleInitialEntries,
		{
			delayDays: 0,
			mortgageId,
			nowMs: Date.parse(`${mortgage.maturityDate}T12:00:00.000Z`),
		}
	);
	await t.action(
		internal.payments.obligations.crons.processObligationTransitions,
		{}
	);
	await drainScheduledWork(t);

	const planEntries = await t.run(async (ctx) =>
		ctx.db
			.query("collectionPlanEntries")
			.withIndex("by_mortgage_status_scheduled", (q) =>
				q.eq("mortgageId", mortgageId).eq("status", "planned")
			)
			.collect()
	);

	return {
		t,
		bankAccountId,
		borrowerId,
		mortgageId,
		planEntries: planEntries.sort(
			(left, right) => left.scheduledDate - right.scheduledDate
		),
	};
}

async function activateRotessaSchedule(
	t: ReturnType<typeof createDynamicConvexHarness>,
	args: {
		asOf?: number;
		bankAccountId: Id<"bankAccounts">;
		mortgageId: Id<"mortgages">;
		planEntryIds: Id<"collectionPlanEntries">[];
	}
) {
	return t.action(activateRecurringScheduleRef, {
		asOf: args.asOf,
		bankAccountId: args.bankAccountId,
		mortgageId: args.mortgageId,
		planEntryIds: args.planEntryIds,
		providerCode: "pad_rotessa",
	});
}

function fullScheduleActivationAsOf(
	planEntries: { scheduledDate: number }[]
): number {
	const earliestScheduledDate = planEntries[0]?.scheduledDate;
	if (earliestScheduledDate === undefined) {
		throw new Error("expected at least one collection plan entry");
	}
	return earliestScheduledDate - 60_000;
}

function buildActivationIdempotencyKey(args: {
	bankAccountId: Id<"bankAccounts">;
	planEntryIds: Id<"collectionPlanEntries">[];
}) {
	return [
		"provider-managed-schedule",
		"pad_rotessa",
		`${args.bankAccountId}`,
		...[...args.planEntryIds].map((planEntryId) => `${planEntryId}`).sort(),
	].join(":");
}

async function createWebhookEvent(
	t: ReturnType<typeof createDynamicConvexHarness>,
	transactionId: string
) {
	return t.run(async (ctx) =>
		ctx.db.insert("webhookEvents", {
			attempts: 0,
			provider: "pad_rotessa",
			providerEventId: `evt:${transactionId}:${Date.now()}`,
			rawBody: JSON.stringify({ transactionId }),
			receivedAt: Date.now(),
			status: "pending",
		})
	);
}

async function ensurePlanEntryObligationIsDue(
	t: ReturnType<typeof createDynamicConvexHarness>,
	planEntryId: Id<"collectionPlanEntries">
) {
	const planEntry = await t.run((ctx) => ctx.db.get(planEntryId));
	const obligationId = planEntry?.obligationIds[0];
	if (!obligationId) {
		throw new Error(`expected obligation for plan entry ${planEntryId}`);
	}

	const obligation = await t.run((ctx) => ctx.db.get(obligationId));
	if (!obligation) {
		throw new Error(`expected obligation ${obligationId}`);
	}
	if (obligation.status !== "upcoming") {
		return;
	}

	await t.mutation(internal.engine.transitionMutation.transitionMutation, {
		entityId: obligationId,
		entityType: "obligation",
		eventType: "BECAME_DUE",
		payload: {},
		source: {
			actorId: "test:provider-managed-schedule",
			actorType: "system",
			channel: "scheduler",
		},
	});
	await drainScheduledWork(t);
}

beforeEach(() => {
	const env = testGlobal.process?.env;
	if (!env) {
		throw new Error("expected process env in test harness");
	}
	previousEnv = {
		ROTESSA_API_KEY: env.ROTESSA_API_KEY,
		DISABLE_GT_HASHCHAIN: env.DISABLE_GT_HASHCHAIN,
		DISABLE_CASH_LEDGER_HASHCHAIN: env.DISABLE_CASH_LEDGER_HASHCHAIN,
	};
	env.ROTESSA_API_KEY = "test-rotessa-key";
	env.DISABLE_GT_HASHCHAIN = "true";
	env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
	vi.stubGlobal("crypto", globalThis.crypto ?? webcrypto);
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.clearAllTimers();
	vi.useRealTimers();
	const env = testGlobal.process?.env;
	if (env) {
		env.ROTESSA_API_KEY = previousEnv.ROTESSA_API_KEY;
		env.DISABLE_GT_HASHCHAIN = previousEnv.DISABLE_GT_HASHCHAIN;
		env.DISABLE_CASH_LEDGER_HASHCHAIN =
			previousEnv.DISABLE_CASH_LEDGER_HASHCHAIN;
	}
});

describe("provider-managed recurring schedules", () => {
	it("activates one Rotessa schedule and patches future plan entries to provider-managed ownership", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);

		const activation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});

		const schedule = await fixture.t.run((ctx) =>
			ctx.db.get(activation.scheduleId)
		);
		expect(schedule?.status).toBe("active");
		expect(schedule?.externalScheduleRef).toBe("987");
		expect(schedule?.coveredFromPlanEntryId).toBe(fixture.planEntries[0]?._id);
		expect(schedule?.coveredToPlanEntryId).toBe(
			fixture.planEntries.at(-1)?._id
		);

		const mortgage = await fixture.t.run((ctx) =>
			ctx.db.get(fixture.mortgageId)
		);
		expect(mortgage?.collectionExecutionMode).toBe("provider_managed");
		expect(mortgage?.collectionExecutionProviderCode).toBe("pad_rotessa");
		expect(mortgage?.activeExternalCollectionScheduleId).toBe(
			activation.scheduleId
		);

		const planEntries = await fixture.t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_external_schedule_ordinal", (q) =>
					q.eq("externalCollectionScheduleId", activation.scheduleId)
				)
				.collect()
		);
		expect(planEntries).toHaveLength(12);
		expect(
			planEntries.every((entry) => entry.status === "provider_scheduled")
		).toBe(true);
		expect(
			planEntries.every((entry) => entry.executionMode === "provider_managed")
		).toBe(true);
		expect(
			planEntries
				.map((entry) => entry.externalOccurrenceOrdinal)
				.sort((left, right) => (left ?? 0) - (right ?? 0))
		).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
		expect(rotessa.fetchMock).toHaveBeenCalled();
	});

	it("rejects activation when the mortgage has no explicit primary borrower", async () => {
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);

		await fixture.t.run(async (ctx) => {
			const borrowerLinks = await ctx.db
				.query("mortgageBorrowers")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", fixture.mortgageId))
				.collect();
			for (const borrowerLink of borrowerLinks) {
				await ctx.db.patch(borrowerLink._id, { role: "co_borrower" });
			}
		});

		await expect(
			activateRotessaSchedule(fixture.t, {
				asOf: activationAsOf,
				bankAccountId: fixture.bankAccountId,
				mortgageId: fixture.mortgageId,
				planEntryIds: fixture.planEntries.map((entry) => entry._id),
			})
		).rejects.toThrow(
			`Mortgage ${fixture.mortgageId} must have exactly one explicit primary borrower for schedule activation.`
		);
	});

	it("rejects activation when the mortgage has multiple primary borrowers", async () => {
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);

		await fixture.t.run(async (ctx) => {
			const borrowerLink = await ctx.db
				.query("mortgageBorrowers")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", fixture.mortgageId))
				.first();
			if (!borrowerLink) {
				throw new Error("expected borrower link");
			}
			await ctx.db.insert("mortgageBorrowers", {
				addedAt: Date.now(),
				borrowerId: borrowerLink.borrowerId,
				mortgageId: fixture.mortgageId,
				role: "primary",
			});
		});

		await expect(
			activateRotessaSchedule(fixture.t, {
				asOf: activationAsOf,
				bankAccountId: fixture.bankAccountId,
				mortgageId: fixture.mortgageId,
				planEntryIds: fixture.planEntries.map((entry) => entry._id),
			})
		).rejects.toThrow(
			`Mortgage ${fixture.mortgageId} must have exactly one explicit primary borrower for schedule activation.`
		);
	});

	it("rejects activation when the bank account is missing every supported Rotessa customer reference", async () => {
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);

		await fixture.t.run(async (ctx) => {
			await ctx.db.patch(fixture.bankAccountId, {
				metadata: {
					unrelatedKey: true,
				},
			});
		});

		await expect(
			activateRotessaSchedule(fixture.t, {
				asOf: activationAsOf,
				bankAccountId: fixture.bankAccountId,
				mortgageId: fixture.mortgageId,
				planEntryIds: fixture.planEntries.map((entry) => entry._id),
			})
		).rejects.toThrow(
			"Rotessa recurring schedule activation requires one of bankAccount.metadata.rotessaCustomerId, bankAccount.metadata.rotessaCustomerCustomIdentifier, or bankAccount.metadata.rotessaCustomIdentifier."
		);
	});

	it("rejects explicit empty planEntryIds instead of activating every future entry", async () => {
		const fixture = await seedProviderManagedFixture();

		await expect(
			activateRotessaSchedule(fixture.t, {
				bankAccountId: fixture.bankAccountId,
				mortgageId: fixture.mortgageId,
				planEntryIds: [],
			})
		).rejects.toThrow(
			"At least one collection plan entry is required for schedule activation."
		);
	});

	it("rejects duplicate planEntryIds before resolving activation entries", async () => {
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const duplicatePlanEntryId = fixture.planEntries[0]?._id;
		if (!duplicatePlanEntryId) {
			throw new Error("expected duplicate plan entry id");
		}

		await expect(
			activateRotessaSchedule(fixture.t, {
				asOf: activationAsOf,
				bankAccountId: fixture.bankAccountId,
				mortgageId: fixture.mortgageId,
				planEntryIds: [duplicatePlanEntryId, duplicatePlanEntryId],
			})
		).rejects.toThrow(
			`Provider-managed activation does not accept duplicate collection plan entry ids: ${duplicatePlanEntryId}.`
		);
	});

	it("rejects requested plan entries that are no longer future planned app-owned entries", async () => {
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const stalePlanEntry = fixture.planEntries.at(-1);
		if (!stalePlanEntry) {
			throw new Error("expected stale plan entry");
		}
		await fixture.t.run(async (ctx) => {
			await ctx.db.patch(stalePlanEntry._id, {
				scheduledDate: activationAsOf - 1,
			});
		});

		await expect(
			activateRotessaSchedule(fixture.t, {
				asOf: activationAsOf,
				bankAccountId: fixture.bankAccountId,
				mortgageId: fixture.mortgageId,
				planEntryIds: fixture.planEntries.map((entry) => entry._id),
			})
		).rejects.toThrow(
			`Requested collection plan entry ${stalePlanEntry._id} is not eligible for provider-managed activation on mortgage ${fixture.mortgageId}. Expected a future planned app-owned entry.`
		);
	});

	it("rejects sparse plan entry selections that would create a non-contiguous Rotessa schedule", async () => {
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const sparseSelection = [
			fixture.planEntries[0]?._id,
			fixture.planEntries[2]?._id,
		].filter((planEntryId): planEntryId is Id<"collectionPlanEntries"> =>
			Boolean(planEntryId)
		);
		if (sparseSelection.length !== 2) {
			throw new Error("expected sparse plan entry selection");
		}

		await expect(
			activateRotessaSchedule(fixture.t, {
				asOf: activationAsOf,
				bankAccountId: fixture.bankAccountId,
				mortgageId: fixture.mortgageId,
				planEntryIds: sparseSelection,
			})
		).rejects.toThrow(
			"Requested collection plan entries must form a contiguous future installment window for provider-managed activation."
		);
	});

	it("accepts same-day requested plan entries using the canonical eligible-window order", async () => {
		installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const firstPlanEntry = fixture.planEntries[0];
		const secondPlanEntry = fixture.planEntries[1];
		if (!(firstPlanEntry && secondPlanEntry)) {
			throw new Error("expected at least two plan entries");
		}

		await fixture.t.run(async (ctx) => {
			await ctx.db.patch(secondPlanEntry._id, {
				scheduledDate: firstPlanEntry.scheduledDate,
			});
		});

		const activation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: [secondPlanEntry._id, firstPlanEntry._id],
		});

		const schedule = await fixture.t.run((ctx) =>
			ctx.db.get(activation.scheduleId)
		);
		expect(schedule?.coveredFromPlanEntryId).toBe(firstPlanEntry._id);
		expect(schedule?.coveredToPlanEntryId).toBe(secondPlanEntry._id);
	});

	it("rejects commit when a selected plan entry drifts after provider activation begins", async () => {
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const firstPlanEntry = fixture.planEntries[0];
		const lastPlanEntry = fixture.planEntries.at(-1);
		if (!(firstPlanEntry && lastPlanEntry)) {
			throw new Error("expected plan entries for activation drift test");
		}

		const activationIdempotencyKey = buildActivationIdempotencyKey({
			bankAccountId: fixture.bankAccountId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const begin = await fixture.t.mutation(
			internal.payments.recurringSchedules.activation
				.beginRecurringScheduleActivation,
			{
				activationIdempotencyKey,
				bankAccountId: fixture.bankAccountId,
				borrowerId: fixture.borrowerId,
				cadence: "Monthly",
				coveredFromPlanEntryId: firstPlanEntry._id,
				coveredToPlanEntryId: lastPlanEntry._id,
				endDate: lastPlanEntry.scheduledDate,
				mortgageId: fixture.mortgageId,
				providerCode: "pad_rotessa",
				source: "test",
				startDate: firstPlanEntry.scheduledDate,
			}
		);

		await fixture.t.mutation(
			internal.payments.recurringSchedules.activation
				.recordRecurringScheduleProviderActivation,
			{
				activatedAt: activationAsOf,
				externalScheduleRef: "987",
				nextPollAt: activationAsOf + 15 * 60 * 1000,
				providerStatus: "active",
				scheduleId: begin.scheduleId,
			}
		);

		await fixture.t.run(async (ctx) => {
			await ctx.db.patch(firstPlanEntry._id, {
				status: "executing",
			});
		});

		await expect(
			fixture.t.mutation(
				internal.payments.recurringSchedules.activation
					.commitRecurringScheduleActivation,
				{
					planEntryIds: fixture.planEntries.map((entry) => entry._id),
					scheduleId: begin.scheduleId,
				}
			)
		).rejects.toThrow(
			`Collection plan entry ${firstPlanEntry._id} is no longer eligible for provider-managed activation.`
		);

		const [schedule, mortgage, planEntries] = await Promise.all([
			fixture.t.run((ctx) => ctx.db.get(begin.scheduleId)),
			fixture.t.run((ctx) => ctx.db.get(fixture.mortgageId)),
			fixture.t.run(async (ctx) =>
				Promise.all(fixture.planEntries.map((entry) => ctx.db.get(entry._id)))
			),
		]);

		expect(schedule?.status).toBe("activating");
		expect(mortgage?.activeExternalCollectionScheduleId).toBeUndefined();
		expect(
			planEntries.every(
				(entry) => entry?.externalCollectionScheduleId === undefined
			)
		).toBe(true);
	});

	it("marks a provider-managed schedule as completed when the provider reports completion", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const activation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const asOf = Date.now() + 15 * 60 * 1000;

		rotessa.setNextProcessDate(null);
		rotessa.setTransactionRows([]);

		const summary = await fixture.t.action(pollProviderManagedSchedulesRef, {
			asOf,
			limit: 10,
		});
		await drainScheduledWork(fixture.t);

		const schedule = await fixture.t.run((ctx) =>
			ctx.db.get(activation.scheduleId)
		);
		expect(summary.claimedCount).toBe(1);
		expect(summary.syncedCount).toBe(1);
		expect(schedule?.status).toBe("completed");
		expect(schedule?.lastProviderScheduleStatus).toBe("completed");
		expect(schedule?.nextPollAt).toBe(asOf + 15 * 60 * 1000);
	});

	it("retries the same activation key after an activation_failed schedule", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);

		rotessa.fetchMock.mockImplementationOnce(async () => {
			return new Response(
				JSON.stringify({
					errors: [{ error_message: "temporary activation failure" }],
				}),
				{
					status: 500,
					statusText: "Internal Server Error",
					headers: { "Content-Type": "application/json" },
				}
			);
		});

		await expect(
			activateRotessaSchedule(fixture.t, {
				asOf: activationAsOf,
				bankAccountId: fixture.bankAccountId,
				mortgageId: fixture.mortgageId,
				planEntryIds: fixture.planEntries.map((entry) => entry._id),
			})
		).rejects.toThrow("Rotessa API request failed");

		const failedSchedule = await fixture.t.run(async (ctx) =>
			ctx.db.query("externalCollectionSchedules").first()
		);
		expect(failedSchedule?.status).toBe("activation_failed");
		expect(failedSchedule?.externalScheduleRef).toBeUndefined();

		const retryActivation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});

		expect(retryActivation.scheduleId).toBe(failedSchedule?._id);

		const recoveredSchedule = await fixture.t.run((ctx) =>
			ctx.db.get(retryActivation.scheduleId)
		);
		expect(recoveredSchedule?.status).toBe("active");
		expect(recoveredSchedule?.externalScheduleRef).toBe("987");
		expect(recoveredSchedule?.lastSyncErrorMessage).toBeUndefined();
	});

	it("resumes local activation from a persisted provider schedule without minting a duplicate remote schedule", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const firstPlanEntry = fixture.planEntries[0];
		const secondPlanEntry = fixture.planEntries[1];
		const lastPlanEntry = fixture.planEntries.at(-1);
		if (!(firstPlanEntry && secondPlanEntry && lastPlanEntry)) {
			throw new Error(
				"Expected seeded fixture to include at least two plan entries."
			);
		}
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const activationIdempotencyKey = buildActivationIdempotencyKey({
			bankAccountId: fixture.bankAccountId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const scheduleId = await fixture.t.run(async (ctx) =>
			ctx.db.insert("externalCollectionSchedules", {
				status: "activation_failed",
				mortgageId: fixture.mortgageId,
				borrowerId: fixture.borrowerId,
				providerCode: "pad_rotessa",
				bankAccountId: fixture.bankAccountId,
				externalScheduleRef: "987",
				activationIdempotencyKey,
				startDate: firstPlanEntry.scheduledDate,
				endDate: lastPlanEntry.scheduledDate,
				cadence: "Monthly",
				coveredFromPlanEntryId: firstPlanEntry._id ?? secondPlanEntry._id,
				coveredToPlanEntryId: lastPlanEntry._id,
				activatedAt: activationAsOf,
				nextPollAt: activationAsOf,
				lastProviderScheduleStatus: "active",
				providerData: { resumeTest: true },
				consecutiveSyncFailures: 1,
				lastSyncErrorAt: activationAsOf,
				lastSyncErrorMessage: "local commit failed after provider create",
				source: "test",
				createdAt: activationAsOf,
				lastTransitionAt: activationAsOf,
			})
		);

		const activation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});

		expect(activation.scheduleId).toBe(scheduleId);
		expect(rotessa.fetchMock).not.toHaveBeenCalled();
		const schedule = await fixture.t.run((ctx) => ctx.db.get(scheduleId));
		expect(schedule?.status).toBe("active");
		expect(schedule?.externalScheduleRef).toBe("987");
		expect(schedule?.lastSyncErrorMessage).toBeUndefined();
		const planEntries = await fixture.t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_external_schedule_ordinal", (q) =>
					q.eq("externalCollectionScheduleId", scheduleId)
				)
				.collect()
		);
		expect(planEntries).toHaveLength(12);
	});

	it("rejects activating a second live external schedule for the same mortgage", async () => {
		installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const firstActivation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const obligationId = fixture.planEntries[0]?.obligationIds[0];
		if (!obligationId) {
			throw new Error("expected obligation for second activation test");
		}
		const laterPlanEntryId = await seedPlanEntry(fixture.t, {
			obligationIds: [obligationId],
			amount: fixture.planEntries[0]?.amount ?? 300_000,
			method: "manual",
			scheduledDate:
				(fixture.planEntries.at(-1)?.scheduledDate ?? Date.now()) +
				40 * 86_400_000,
			status: "planned",
		});

		await expect(
			activateRotessaSchedule(fixture.t, {
				asOf: activationAsOf,
				bankAccountId: fixture.bankAccountId,
				mortgageId: fixture.mortgageId,
				planEntryIds: [laterPlanEntryId],
			})
		).rejects.toThrow(
			`Mortgage ${fixture.mortgageId} already has live external collection schedule ${firstActivation.scheduleId}`
		);
	});

	it("surfaces sync_error when an active schedule is missing its external provider reference", async () => {
		installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const activation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const asOf = Date.now() + 30 * 60 * 1000;

		await fixture.t.run(async (ctx) => {
			await ctx.db.patch(activation.scheduleId, {
				externalScheduleRef: undefined,
				nextPollAt: asOf - 1,
				status: "active",
			});
		});

		const summary = await fixture.t.action(pollProviderManagedSchedulesRef, {
			asOf,
			limit: 10,
		});
		await drainScheduledWork(fixture.t);

		const schedule = await fixture.t.run((ctx) =>
			ctx.db.get(activation.scheduleId)
		);
		expect(summary.candidateCount).toBe(1);
		expect(summary.claimedCount).toBe(0);
		expect(schedule?.status).toBe("sync_error");
		expect(schedule?.lastSyncErrorMessage).toBe(
			"External collection schedule is missing externalScheduleRef"
		);
		expect(schedule?.nextPollAt).toBe(asOf + 15 * 60 * 1000);
	});

	it("fills polling candidates from later unleased rows when early rows are leased", async () => {
		const fixture = await seedProviderManagedFixture();
		const asOf = Date.now();
		const coveredFromPlanEntryId = fixture.planEntries[0]?._id;
		const coveredToPlanEntryId = fixture.planEntries[1]?._id;
		if (!(coveredFromPlanEntryId && coveredToPlanEntryId)) {
			throw new Error("expected plan entries for polling candidate test");
		}

		const [
			leasedScheduleId,
			firstEligibleScheduleId,
			secondEligibleScheduleId,
		] = await fixture.t.run(async (ctx) =>
			Promise.all([
				ctx.db.insert("externalCollectionSchedules", {
					status: "active",
					mortgageId: fixture.mortgageId,
					borrowerId: fixture.borrowerId,
					providerCode: "pad_rotessa",
					bankAccountId: fixture.bankAccountId,
					activationIdempotencyKey: "leased",
					startDate: asOf,
					endDate: asOf + 86_400_000,
					cadence: "Monthly",
					coveredFromPlanEntryId,
					coveredToPlanEntryId,
					nextPollAt: asOf - 3000,
					syncLeaseExpiresAt: asOf + 60_000,
					consecutiveSyncFailures: 0,
					source: "test",
					createdAt: asOf - 3000,
				}),
				ctx.db.insert("externalCollectionSchedules", {
					status: "active",
					mortgageId: fixture.mortgageId,
					borrowerId: fixture.borrowerId,
					providerCode: "pad_rotessa",
					bankAccountId: fixture.bankAccountId,
					activationIdempotencyKey: "eligible-1",
					startDate: asOf,
					endDate: asOf + 86_400_000,
					cadence: "Monthly",
					coveredFromPlanEntryId,
					coveredToPlanEntryId,
					nextPollAt: asOf - 2000,
					consecutiveSyncFailures: 0,
					source: "test",
					createdAt: asOf - 2000,
				}),
				ctx.db.insert("externalCollectionSchedules", {
					status: "active",
					mortgageId: fixture.mortgageId,
					borrowerId: fixture.borrowerId,
					providerCode: "pad_rotessa",
					bankAccountId: fixture.bankAccountId,
					activationIdempotencyKey: "eligible-2",
					startDate: asOf,
					endDate: asOf + 86_400_000,
					cadence: "Monthly",
					coveredFromPlanEntryId,
					coveredToPlanEntryId,
					nextPollAt: asOf - 1000,
					consecutiveSyncFailures: 0,
					source: "test",
					createdAt: asOf - 1000,
				}),
			])
		);

		const candidates = await fixture.t.query(
			listSchedulesEligibleForPollingRef,
			{
				asOf,
				limit: 2,
			}
		);

		expect(candidates.map((schedule) => schedule._id)).toEqual([
			firstEligibleScheduleId,
			secondEligibleScheduleId,
		]);
		expect(
			candidates.some((schedule) => schedule._id === leasedScheduleId)
		).toBe(false);
	});

	it("keeps retry capacity for sync_error schedules even when active schedules fill the polling limit", async () => {
		const fixture = await seedProviderManagedFixture();
		const asOf = Date.now();
		const coveredFromPlanEntryId = fixture.planEntries[0]?._id;
		const coveredToPlanEntryId = fixture.planEntries[1]?._id;
		if (!(coveredFromPlanEntryId && coveredToPlanEntryId)) {
			throw new Error("expected plan entries for sync_error polling test");
		}

		const [firstActiveScheduleId, secondActiveScheduleId, syncErrorScheduleId] =
			await fixture.t.run(async (ctx) =>
				Promise.all([
					ctx.db.insert("externalCollectionSchedules", {
						status: "active",
						mortgageId: fixture.mortgageId,
						borrowerId: fixture.borrowerId,
						providerCode: "pad_rotessa",
						bankAccountId: fixture.bankAccountId,
						activationIdempotencyKey: "active-1",
						startDate: asOf,
						endDate: asOf + 86_400_000,
						cadence: "Monthly",
						coveredFromPlanEntryId,
						coveredToPlanEntryId,
						nextPollAt: asOf - 3000,
						consecutiveSyncFailures: 0,
						source: "test",
						createdAt: asOf - 3000,
					}),
					ctx.db.insert("externalCollectionSchedules", {
						status: "active",
						mortgageId: fixture.mortgageId,
						borrowerId: fixture.borrowerId,
						providerCode: "pad_rotessa",
						bankAccountId: fixture.bankAccountId,
						activationIdempotencyKey: "active-2",
						startDate: asOf,
						endDate: asOf + 86_400_000,
						cadence: "Monthly",
						coveredFromPlanEntryId,
						coveredToPlanEntryId,
						nextPollAt: asOf - 2000,
						consecutiveSyncFailures: 0,
						source: "test",
						createdAt: asOf - 2000,
					}),
					ctx.db.insert("externalCollectionSchedules", {
						status: "sync_error",
						mortgageId: fixture.mortgageId,
						borrowerId: fixture.borrowerId,
						providerCode: "pad_rotessa",
						bankAccountId: fixture.bankAccountId,
						activationIdempotencyKey: "sync-error-1",
						startDate: asOf,
						endDate: asOf + 86_400_000,
						cadence: "Monthly",
						coveredFromPlanEntryId,
						coveredToPlanEntryId,
						nextPollAt: asOf - 1000,
						consecutiveSyncFailures: 2,
						source: "test",
						createdAt: asOf - 1000,
						lastSyncErrorAt: asOf - 1000,
						lastSyncErrorMessage: "previous sync failure",
					}),
				])
			);

		const candidates = await fixture.t.query(
			listSchedulesEligibleForPollingRef,
			{
				asOf,
				limit: 2,
			}
		);

		expect(candidates.map((schedule) => schedule._id)).toEqual([
			firstActiveScheduleId,
			syncErrorScheduleId,
		]);
		expect(
			candidates.some((schedule) => schedule._id === secondActiveScheduleId)
		).toBe(false);
	});

	it("materializes a webhook-driven lifecycle through Future, Pending, and Approved", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const activation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const firstPlanEntry = fixture.planEntries[0];
		if (!firstPlanEntry) {
			throw new Error("expected first plan entry");
		}
		const firstObligationId = firstPlanEntry.obligationIds[0];
		if (!firstObligationId) {
			throw new Error("expected first obligation");
		}

		const futureWebhookEventId = await createWebhookEvent(
			fixture.t,
			"txn-1001"
		);
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate: new Date(firstPlanEntry.scheduledDate)
					.toISOString()
					.slice(0, 10),
				scheduleId: 987,
				status: "Future",
				transactionId: "1001",
				transactionNumber: "txn-1001",
				updatedAt: "2026-02-01T12:00:00.000Z",
			}),
		]);
		await fixture.t.action(processRotessaPadWebhookRef, {
			eventType: "Future",
			transactionId: "txn-1001",
			webhookEventId: futureWebhookEventId,
		});
		await drainScheduledWork(fixture.t);

		let planEntry = await fixture.t.run((ctx) =>
			ctx.db.get(firstPlanEntry._id)
		);
		expect(planEntry?.status).toBe("executing");
		expect(planEntry?.externalProviderEventStatus).toBe("Future");
		expect(planEntry?.collectionAttemptId).toBeTruthy();

		let attempt = await fixture.t.run((ctx) =>
			planEntry?.collectionAttemptId
				? ctx.db.get(planEntry.collectionAttemptId)
				: Promise.resolve(null)
		);
		expect(attempt?.status).toBe("pending");
		expect(attempt?.providerLifecycleStatus).toBe("Future");

		let transfer = await fixture.t.run(async (ctx) =>
			attempt?.transferRequestId ? ctx.db.get(attempt.transferRequestId) : null
		);
		expect(transfer?.status).toBe("pending");
		expect(transfer?.providerRef).toBe("txn-1001");

		const pendingWebhookEventId = await createWebhookEvent(
			fixture.t,
			"txn-1001"
		);
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate: new Date(firstPlanEntry.scheduledDate)
					.toISOString()
					.slice(0, 10),
				scheduleId: 987,
				status: "Pending",
				transactionId: "1001",
				transactionNumber: "txn-1001",
				updatedAt: "2026-02-02T12:00:00.000Z",
			}),
		]);
		await fixture.t.action(processRotessaPadWebhookRef, {
			eventType: "Pending",
			transactionId: "txn-1001",
			webhookEventId: pendingWebhookEventId,
		});
		await drainScheduledWork(fixture.t);

		planEntry = await fixture.t.run((ctx) => ctx.db.get(firstPlanEntry._id));
		expect(planEntry?.externalProviderEventStatus).toBe("Pending");
		attempt = await fixture.t.run((ctx) =>
			planEntry?.collectionAttemptId
				? ctx.db.get(planEntry.collectionAttemptId)
				: Promise.resolve(null)
		);
		transfer = await fixture.t.run(async (ctx) =>
			attempt?.transferRequestId ? ctx.db.get(attempt.transferRequestId) : null
		);
		expect(attempt?.status).toBe("pending");
		expect(attempt?.providerLifecycleStatus).toBe("Pending");
		expect(transfer?.status).toBe("processing");

		const approvedWebhookEventId = await createWebhookEvent(
			fixture.t,
			"txn-1001"
		);
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate: new Date(firstPlanEntry.scheduledDate)
					.toISOString()
					.slice(0, 10),
				scheduleId: 987,
				status: "Approved",
				transactionId: "1001",
				transactionNumber: "txn-1001",
				updatedAt: "2026-02-03T12:00:00.000Z",
			}),
		]);
		await fixture.t.action(processRotessaPadWebhookRef, {
			eventType: "Approved",
			transactionId: "txn-1001",
			webhookEventId: approvedWebhookEventId,
		});
		await drainScheduledWork(fixture.t);

		planEntry = await fixture.t.run((ctx) => ctx.db.get(firstPlanEntry._id));
		attempt = await fixture.t.run((ctx) =>
			planEntry?.collectionAttemptId
				? ctx.db.get(planEntry.collectionAttemptId)
				: Promise.resolve(null)
		);
		transfer = await fixture.t.run(async (ctx) =>
			attempt?.transferRequestId ? ctx.db.get(attempt.transferRequestId) : null
		);
		const obligation = await fixture.t.run((ctx) =>
			ctx.db.get(firstObligationId)
		);

		expect(planEntry?.externalProviderEventStatus).toBe("Approved");
		expect(attempt?.status).toBe("confirmed");
		expect(attempt?.providerLifecycleStatus).toBe("Approved");
		expect(transfer?.status).toBe("confirmed");
		expect(obligation?.amountSettled).toBe(obligation?.amount);
		expect(activation.scheduleId).toBeTruthy();
	});

	it("materializes provider-managed occurrences from transaction-style Rotessa webhook events", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const firstPlanEntry = fixture.planEntries[0];
		if (!firstPlanEntry) {
			throw new Error("expected first plan entry");
		}
		const processDate = new Date(firstPlanEntry.scheduledDate)
			.toISOString()
			.slice(0, 10);

		const pendingWebhookEventId = await createWebhookEvent(
			fixture.t,
			"txn-transaction-style"
		);
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate,
				scheduleId: 987,
				status: "Pending",
				transactionId: "2001",
				transactionNumber: "txn-transaction-style",
				updatedAt: "2026-02-02T12:00:00.000Z",
			}),
		]);
		await fixture.t.action(processRotessaPadWebhookRef, {
			eventType: "transaction.pending",
			transactionId: "txn-transaction-style",
			webhookEventId: pendingWebhookEventId,
		});
		await drainScheduledWork(fixture.t);

		let planEntry = await fixture.t.run((ctx) =>
			ctx.db.get(firstPlanEntry._id)
		);
		let attempt = await fixture.t.run((ctx) =>
			planEntry?.collectionAttemptId
				? ctx.db.get(planEntry.collectionAttemptId)
				: Promise.resolve(null)
		);
		let transfer = await fixture.t.run(async (ctx) =>
			attempt?.transferRequestId ? ctx.db.get(attempt.transferRequestId) : null
		);
		let webhookEvent = await fixture.t.run((ctx) =>
			ctx.db.get(pendingWebhookEventId)
		);

		expect(planEntry?.status).toBe("executing");
		expect(planEntry?.externalProviderEventStatus).toBe("Pending");
		expect(attempt?.status).toBe("pending");
		expect(attempt?.providerLifecycleStatus).toBe("Pending");
		expect(transfer?.status).toBe("processing");
		expect(transfer?.providerRef).toBe("txn-transaction-style");
		expect(webhookEvent?.status).toBe("processed");
		expect(webhookEvent?.transferRequestId).toBe(transfer?._id);

		const approvedWebhookEventId = await createWebhookEvent(
			fixture.t,
			"txn-transaction-style"
		);
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate,
				scheduleId: 987,
				status: "Approved",
				transactionId: "2001",
				transactionNumber: "txn-transaction-style",
				updatedAt: "2026-02-03T12:00:00.000Z",
			}),
		]);
		await fixture.t.action(processRotessaPadWebhookRef, {
			eventType: "transaction.completed",
			transactionId: "txn-transaction-style",
			webhookEventId: approvedWebhookEventId,
		});
		await drainScheduledWork(fixture.t);

		planEntry = await fixture.t.run((ctx) => ctx.db.get(firstPlanEntry._id));
		attempt = await fixture.t.run((ctx) =>
			planEntry?.collectionAttemptId
				? ctx.db.get(planEntry.collectionAttemptId)
				: Promise.resolve(null)
		);
		transfer = await fixture.t.run(async (ctx) =>
			attempt?.transferRequestId ? ctx.db.get(attempt.transferRequestId) : null
		);
		webhookEvent = await fixture.t.run((ctx) =>
			ctx.db.get(approvedWebhookEventId)
		);

		expect(planEntry?.externalProviderEventStatus).toBe("Approved");
		expect(attempt?.status).toBe("confirmed");
		expect(attempt?.providerLifecycleStatus).toBe("Approved");
		expect(transfer?.status).toBe("confirmed");
		expect(webhookEvent?.status).toBe("processed");
		expect(webhookEvent?.transferRequestId).toBe(transfer?._id);
	});

	it("does not reopen a completed plan entry when provider-managed lifecycle updates replay", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const firstPlanEntry = fixture.planEntries[0];
		if (!firstPlanEntry) {
			throw new Error("expected first plan entry");
		}
		const processDate = new Date(firstPlanEntry.scheduledDate)
			.toISOString()
			.slice(0, 10);

		const futureWebhookEventId = await createWebhookEvent(
			fixture.t,
			"txn-terminal-replay"
		);
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate,
				scheduleId: 987,
				status: "Future",
				transactionId: "3001",
				transactionNumber: "txn-terminal-replay",
				updatedAt: "2026-02-01T12:00:00.000Z",
			}),
		]);
		await fixture.t.action(processRotessaPadWebhookRef, {
			eventType: "Future",
			transactionId: "txn-terminal-replay",
			webhookEventId: futureWebhookEventId,
		});
		await drainScheduledWork(fixture.t);

		await fixture.t.run(async (ctx) => {
			await ctx.db.patch(firstPlanEntry._id, {
				status: "completed",
			});
		});

		const pendingWebhookEventId = await createWebhookEvent(
			fixture.t,
			"txn-terminal-replay"
		);
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate,
				scheduleId: 987,
				status: "Pending",
				transactionId: "3001",
				transactionNumber: "txn-terminal-replay",
				updatedAt: "2026-02-02T12:00:00.000Z",
			}),
		]);
		await fixture.t.action(processRotessaPadWebhookRef, {
			eventType: "Pending",
			transactionId: "txn-terminal-replay",
			webhookEventId: pendingWebhookEventId,
		});
		await drainScheduledWork(fixture.t);

		const planEntry = await fixture.t.run((ctx) =>
			ctx.db.get(firstPlanEntry._id)
		);
		expect(planEntry?.status).toBe("completed");
		expect(planEntry?.externalProviderEventStatus).toBe("Pending");
	});

	it("fails a replayed regression from confirmed back to processing instead of silently accepting it", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const firstPlanEntry = fixture.planEntries[0];
		if (!firstPlanEntry) {
			throw new Error("expected first plan entry");
		}
		const processDate = new Date(firstPlanEntry.scheduledDate)
			.toISOString()
			.slice(0, 10);

		for (const status of ["Future", "Pending", "Approved"] as const) {
			const updatedDayByStatus = {
				Future: "1",
				Pending: "2",
				Approved: "3",
			} as const;
			const webhookEventId = await createWebhookEvent(fixture.t, "txn-1001");
			rotessa.setTransactionRows([
				createRotessaTransactionRow({
					amountCents: firstPlanEntry.amount,
					processDate,
					scheduleId: 987,
					status,
					transactionId: "1001",
					transactionNumber: "txn-1001",
					updatedAt: `2026-02-0${updatedDayByStatus[status]}T12:00:00.000Z`,
				}),
			]);
			await fixture.t.action(processRotessaPadWebhookRef, {
				eventType: status,
				transactionId: "txn-1001",
				webhookEventId,
			});
			await drainScheduledWork(fixture.t);
		}

		const stalePendingWebhookEventId = await createWebhookEvent(
			fixture.t,
			"txn-1001"
		);
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate,
				scheduleId: 987,
				status: "Pending",
				transactionId: "1001",
				transactionNumber: "txn-1001",
				updatedAt: "2026-02-04T12:00:00.000Z",
			}),
		]);

		await expect(
			fixture.t.action(processRotessaPadWebhookRef, {
				eventType: "Pending",
				transactionId: "txn-1001",
				webhookEventId: stalePendingWebhookEventId,
			})
		).rejects.toThrow("was rejected");

		const webhookEvent = await fixture.t.run((ctx) =>
			ctx.db.get(stalePendingWebhookEventId)
		);
		expect(webhookEvent?.status).toBe("failed");
	});

	it("ignores stale provider lifecycle replays when updating raw mirror fields", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const firstPlanEntry = fixture.planEntries[0];
		if (!firstPlanEntry) {
			throw new Error("expected first plan entry");
		}
		const processDate = new Date(firstPlanEntry.scheduledDate)
			.toISOString()
			.slice(0, 10);

		for (const [status, updatedAt] of [
			["Future", "2026-02-01T12:00:00.000Z"],
			["Pending", "2026-02-02T12:00:00.000Z"],
			["Approved", "2026-02-03T12:00:00.000Z"],
		] as const) {
			const webhookEventId = await createWebhookEvent(fixture.t, "txn-stale");
			rotessa.setTransactionRows([
				createRotessaTransactionRow({
					amountCents: firstPlanEntry.amount,
					processDate,
					scheduleId: 987,
					status,
					transactionId: "7777",
					transactionNumber: "txn-stale",
					updatedAt,
				}),
			]);
			await fixture.t.action(processRotessaPadWebhookRef, {
				eventType: status,
				transactionId: "txn-stale",
				webhookEventId,
			});
			await drainScheduledWork(fixture.t);
		}

		const staleFutureWebhookEventId = await createWebhookEvent(
			fixture.t,
			"txn-stale"
		);
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate,
				scheduleId: 987,
				status: "Future",
				transactionId: "7777",
				transactionNumber: "txn-stale",
				updatedAt: "2026-02-01T12:00:00.000Z",
			}),
		]);
		await fixture.t.action(processRotessaPadWebhookRef, {
			eventType: "Future",
			transactionId: "txn-stale",
			webhookEventId: staleFutureWebhookEventId,
		});
		await drainScheduledWork(fixture.t);

		const hydratedPlanEntry = await fixture.t.run((ctx) =>
			ctx.db.get(firstPlanEntry._id)
		);
		const collectionAttemptId = hydratedPlanEntry?.collectionAttemptId;
		const hydratedAttempt = collectionAttemptId
			? await fixture.t.run((ctx) => ctx.db.get(collectionAttemptId))
			: null;
		expect(hydratedPlanEntry?.externalProviderEventStatus).toBe("Approved");
		expect(hydratedPlanEntry?.externalLastReportedAt).toBe(
			Date.parse("2026-02-03T12:00:00.000Z")
		);
		expect(hydratedAttempt?.providerLifecycleStatus).toBe("Approved");
		expect(hydratedAttempt?.providerLastReportedAt).toBe(
			Date.parse("2026-02-03T12:00:00.000Z")
		);
	});

	it("fails provider-managed lifecycle webhooks when the occurrence cannot be matched locally", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const webhookEventId = await createWebhookEvent(fixture.t, "txn-unmatched");

		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: fixture.planEntries[0]?.amount ?? 300_000,
				processDate: "2099-01-01",
				scheduleId: 987,
				status: "Pending",
				transactionId: "9001",
				transactionNumber: "txn-unmatched",
				updatedAt: "2026-02-02T12:00:00.000Z",
			}),
		]);

		await expect(
			fixture.t.action(processRotessaPadWebhookRef, {
				eventType: "Pending",
				transactionId: "txn-unmatched",
				webhookEventId,
			})
		).rejects.toThrow(
			"No matching provider-managed collection plan entry was found for the external occurrence event."
		);

		const webhookEvent = await fixture.t.run((ctx) =>
			ctx.db.get(webhookEventId)
		);
		expect(webhookEvent?.status).toBe("failed");
		expect(webhookEvent?.normalizedEventType).toBe("PROCESSING_UPDATE");
		expect(webhookEvent?.error).toContain(
			"No matching provider-managed collection plan entry was found for the external occurrence event."
		);

		const auditEntries = await fixture.t.run((ctx) =>
			auditLog.queryByAction(ctx, {
				action: "payments.provider_managed_occurrence.unresolved",
				limit: 10,
			})
		);
		expect(auditEntries[0]?.resourceType).toBe("providerManagedOccurrences");
		expect(auditEntries[0]?.metadata).toMatchObject({
			externalScheduleRef: "987",
			providerCode: "pad_rotessa",
			providerRef: "txn-unmatched",
			reason:
				"No matching provider-managed collection plan entry was found for the external occurrence event.",
		});
	});

	it("fails provider-managed lifecycle webhooks when a matched Rotessa report row cannot be normalized", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const firstPlanEntry = fixture.planEntries[0];
		if (!firstPlanEntry) {
			throw new Error("expected first plan entry");
		}
		const webhookEventId = await createWebhookEvent(
			fixture.t,
			"txn-unsupported"
		);
		const unsupportedRow = {
			...createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate: new Date(firstPlanEntry.scheduledDate)
					.toISOString()
					.slice(0, 10),
				scheduleId: 987,
				status: "Pending",
				transactionId: "4001",
				transactionNumber: "txn-unsupported",
				updatedAt: "2026-02-02T12:00:00.000Z",
			}),
			status: "Unsupported" as unknown as RotessaTransactionReportRow["status"],
		};
		rotessa.setTransactionRows([unsupportedRow]);

		await expect(
			fixture.t.action(processRotessaPadWebhookRef, {
				eventType: "transaction.pending",
				transactionId: "txn-unsupported",
				webhookEventId,
			})
		).rejects.toThrow(
			`Rotessa transaction report row ${unsupportedRow.id} for transaction txn-unsupported could not be normalized from provider status "Unsupported".`
		);

		const [planEntry, webhookEvent] = await Promise.all([
			fixture.t.run((ctx) => ctx.db.get(firstPlanEntry._id)),
			fixture.t.run((ctx) => ctx.db.get(webhookEventId)),
		]);

		expect(planEntry?.collectionAttemptId).toBeUndefined();
		expect(webhookEvent?.status).toBe("failed");
		expect(webhookEvent?.normalizedEventType).toBe("PROCESSING_UPDATE");
		expect(webhookEvent?.error).toContain(
			`Rotessa transaction report row ${unsupportedRow.id} for transaction txn-unsupported could not be normalized from provider status "Unsupported".`
		);
	});

	it("marks polling sync_error when a provider occurrence cannot be matched locally", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const activation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const activatedSchedule = await fixture.t.run((ctx) =>
			ctx.db.get(activation.scheduleId)
		);
		const asOf = (activatedSchedule?.nextPollAt ?? Date.now()) + 1;

		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: fixture.planEntries[0]?.amount ?? 300_000,
				processDate: "2099-01-01",
				scheduleId: 987,
				status: "Pending",
				transactionId: "9002",
				transactionNumber: "txn-poll-unmatched",
				updatedAt: new Date(asOf).toISOString(),
			}),
		]);

		const summary = await fixture.t.action(pollProviderManagedSchedulesRef, {
			asOf,
			limit: 10,
		});
		await drainScheduledWork(fixture.t);

		const schedule = await fixture.t.run((ctx) =>
			ctx.db.get(activation.scheduleId)
		);

		expect(summary.claimedCount).toBe(1);
		expect(summary.failedCount).toBe(1);
		expect(summary.syncedCount).toBe(0);
		expect(summary.ingestedEventCount).toBe(0);
		expect(schedule?.status).toBe("sync_error");
		expect(schedule?.lastSyncErrorMessage).toContain(
			"No matching provider-managed collection plan entry was found for the external occurrence event."
		);
		expect(schedule?.lastSyncCursor).toBeUndefined();
	});

	it("heals attempt and transfer backlinks when a polled occurrence reuses an existing transfer", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const activation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});
		const firstPlanEntry = fixture.planEntries[0];
		if (!firstPlanEntry) {
			throw new Error("expected first plan entry for backlink test");
		}
		const activatedSchedule = await fixture.t.run((ctx) =>
			ctx.db.get(activation.scheduleId)
		);
		const firstPollAt = (activatedSchedule?.nextPollAt ?? Date.now()) + 1;

		const processDate = new Date(firstPlanEntry.scheduledDate)
			.toISOString()
			.slice(0, 10);
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate,
				scheduleId: 987,
				status: "Future",
				transactionId: "1001",
				transactionNumber: "txn-backlink",
				updatedAt: new Date(firstPollAt).toISOString(),
			}),
		]);
		await fixture.t.action(pollProviderManagedSchedulesRef, {
			asOf: firstPollAt,
			limit: 10,
		});
		await drainScheduledWork(fixture.t);

		const initialLinks = await fixture.t.run(async (ctx) => {
			const planEntry = await ctx.db.get(firstPlanEntry._id);
			const attempt = planEntry?.collectionAttemptId
				? await ctx.db.get(planEntry.collectionAttemptId)
				: null;
			const transfer = attempt?.transferRequestId
				? await ctx.db.get(attempt.transferRequestId)
				: null;
			return { attempt, transfer };
		});
		if (!(initialLinks.attempt && initialLinks.transfer)) {
			throw new Error("expected initial provider-managed attempt and transfer");
		}
		const attemptId = initialLinks.attempt._id;
		const transferId = initialLinks.transfer._id;

		await fixture.t.run(async (ctx) => {
			await ctx.db.patch(attemptId, {
				transferRequestId: undefined,
			});
			await ctx.db.patch(transferId, {
				collectionAttemptId: undefined,
				planEntryId: undefined,
			});
		});

		const secondPollAt = firstPollAt + 15 * 60 * 1000;
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				amountCents: firstPlanEntry.amount,
				processDate,
				scheduleId: 987,
				status: "Pending",
				transactionId: "1001",
				transactionNumber: "txn-backlink",
				updatedAt: new Date(secondPollAt).toISOString(),
			}),
		]);
		await fixture.t.action(pollProviderManagedSchedulesRef, {
			asOf: secondPollAt,
			limit: 10,
		});
		await drainScheduledWork(fixture.t);

		const healedLinks = await fixture.t.run(async (ctx) => {
			const attempt = await ctx.db.get(attemptId);
			const transfer = await ctx.db.get(transferId);
			const planEntry = await ctx.db.get(firstPlanEntry._id);
			return { attempt, transfer, planEntry };
		});

		expect(healedLinks.planEntry?.collectionAttemptId).toBe(attemptId);
		expect(healedLinks.attempt?.transferRequestId).toBe(transferId);
		expect(healedLinks.transfer?.collectionAttemptId).toBe(attemptId);
		expect(healedLinks.transfer?.planEntryId).toBe(firstPlanEntry._id);
	});

	it("recovers missed webhooks through the polling cron for a 12 month cycle and NSF decline", async () => {
		const rotessa = installRotessaFetchHarness();
		const fixture = await seedProviderManagedFixture();
		const activationAsOf = fullScheduleActivationAsOf(fixture.planEntries);
		const activation = await activateRotessaSchedule(fixture.t, {
			asOf: activationAsOf,
			bankAccountId: fixture.bankAccountId,
			mortgageId: fixture.mortgageId,
			planEntryIds: fixture.planEntries.map((entry) => entry._id),
		});

		const updatedAtBase = Date.now();
		const pollStepMs = 16 * 60 * 1000;

		for (const [index, planEntry] of fixture.planEntries.entries()) {
			const scheduledDate = new Date(planEntry.scheduledDate)
				.toISOString()
				.slice(0, 10);
			const transactionNumber = `txn-${index + 1}`;
			const occurrenceBase = updatedAtBase + index * pollStepMs * 3;

			rotessa.setTransactionRows([
				createRotessaTransactionRow({
					amountCents: planEntry.amount,
					processDate: scheduledDate,
					scheduleId: 987,
					status: "Future",
					transactionId: `${1000 + index}`,
					transactionNumber,
					updatedAt: new Date(occurrenceBase).toISOString(),
				}),
			]);
			await fixture.t.action(pollProviderManagedSchedulesRef, {
				asOf: occurrenceBase,
				limit: 10,
			});
			await drainScheduledWork(fixture.t);
			await ensurePlanEntryObligationIsDue(fixture.t, planEntry._id);

			rotessa.setTransactionRows([
				createRotessaTransactionRow({
					amountCents: planEntry.amount,
					processDate: scheduledDate,
					scheduleId: 987,
					status: index === 0 ? "Declined" : "Pending",
					transactionId: `${1000 + index}`,
					transactionNumber,
					updatedAt: new Date(occurrenceBase + pollStepMs).toISOString(),
					statusReason: index === 0 ? "NSF" : null,
				}),
			]);
			await fixture.t.action(pollProviderManagedSchedulesRef, {
				asOf: occurrenceBase + pollStepMs,
				limit: 10,
			});
			await drainScheduledWork(fixture.t);

			if (index === 0) {
				continue;
			}

			rotessa.setTransactionRows([
				createRotessaTransactionRow({
					amountCents: planEntry.amount,
					processDate: scheduledDate,
					scheduleId: 987,
					status: "Approved",
					transactionId: `${1000 + index}`,
					transactionNumber,
					updatedAt: new Date(occurrenceBase + pollStepMs * 2).toISOString(),
				}),
			]);
			await fixture.t.action(pollProviderManagedSchedulesRef, {
				asOf: occurrenceBase + pollStepMs * 2,
				limit: 10,
			});
			await drainScheduledWork(fixture.t);
		}

		const planEntries = await fixture.t.run(async (ctx) =>
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_external_schedule_ordinal", (q) =>
					q.eq("externalCollectionScheduleId", activation.scheduleId)
				)
				.collect()
		);
		const attempts = await fixture.t.run((ctx) =>
			ctx.db.query("collectionAttempts").collect()
		);
		const transfers = await fixture.t.run((ctx) =>
			ctx.db.query("transferRequests").collect()
		);
		const obligations = await fixture.t.run((ctx) =>
			ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) => q.eq("mortgageId", fixture.mortgageId))
				.collect()
		);

		expect(planEntries).toHaveLength(12);
		expect(attempts).toHaveLength(12);
		expect(transfers).toHaveLength(12);

		const declinedPlanEntry = planEntries.find(
			(entry) => entry.externalOccurrenceOrdinal === 1
		);
		const declinedAttempt = attempts.find(
			(entry) => entry.planEntryId === declinedPlanEntry?._id
		);
		const declinedTransfer = transfers.find(
			(entry) => entry.collectionAttemptId === declinedAttempt?._id
		);
		expect(declinedPlanEntry?.externalProviderEventStatus).toBe("Declined");
		expect(declinedPlanEntry?.externalProviderReason).toBe("NSF");
		expect(declinedAttempt?.providerLifecycleStatus).toBe("Declined");
		expect(declinedAttempt?.providerLifecycleReason).toBe("NSF");
		expect(declinedTransfer?.status).toBe("failed");

		const approvedObligations = obligations.filter(
			(obligation) => obligation.paymentNumber !== 1
		);
		expect(
			approvedObligations.every(
				(obligation) => obligation.amountSettled === obligation.amount
			)
		).toBe(true);
		expect(
			obligations.find((obligation) => obligation.paymentNumber === 1)
				?.amountSettled
		).toBe(0);
	});

	it("does not drop a same-timestamp occurrence when polling resumes from a composite cursor", async () => {
		const rotessa = installRotessaFetchHarness();
		const provider = new RotessaRecurringScheduleProvider();
		rotessa.setTransactionRows([
			createRotessaTransactionRow({
				processDate: "2026-02-15",
				scheduleId: 987,
				status: "Pending",
				transactionId: "1001",
				transactionNumber: "txn-1001",
				updatedAt: "2026-02-02T12:00:00.000Z",
			}),
			createRotessaTransactionRow({
				processDate: "2026-03-15",
				scheduleId: 987,
				status: "Pending",
				transactionId: "1002",
				transactionNumber: "txn-1002",
				updatedAt: "2026-02-02T12:00:00.000Z",
			}),
		]);

		const firstPage = await provider.pollOccurrenceUpdates({
			externalScheduleRef: "987",
			maxEvents: 1,
			startDate: "2026-02-01",
		});
		const secondPage = await provider.pollOccurrenceUpdates({
			externalScheduleRef: "987",
			maxEvents: 1,
			sinceCursor: firstPage.nextCursor,
			startDate: "2026-02-01",
		});

		expect(firstPage.events).toHaveLength(1);
		expect(secondPage.events).toHaveLength(1);
		expect(firstPage.events[0]?.providerRef).not.toBe(
			secondPage.events[0]?.providerRef
		);
	});
});
