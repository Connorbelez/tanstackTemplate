import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { orgIdFromMortgageId } from "../../lib/orgScope";
import type { PaymentFrequency } from "../../mortgages/paymentFrequency";
import { postObligationAccrued } from "../cashLedger/integrations";
import { ensureDefaultEntriesForObligationsImpl } from "../collectionPlan/initialScheduling";
import {
	advanceMonth,
	GRACE_PERIOD_DAYS,
	MS_PER_DAY,
} from "../obligations/generateImpl";

const LIVE_PLAN_ENTRY_STATUSES = new Set<
	Doc<"collectionPlanEntries">["status"]
>(["planned", "provider_scheduled", "executing"]);

const OBLIGATION_ACCRUAL_SOURCE = {
	channel: "scheduler" as const,
	actorId: "system",
	actorType: "system" as const,
};

type BootstrapObligationStatus = "due" | "overdue" | "upcoming";

interface ExpectedObligationSpec {
	amount: number;
	dueDate: number;
	gracePeriodEnd: number;
	paymentNumber: number;
	status: BootstrapObligationStatus;
	type: Doc<"obligations">["type"];
}

export interface GenerateInitialMortgageObligationsInput {
	firstPaymentDate: string;
	maturityDate: string;
	mortgageId: Id<"mortgages">;
	now: number;
	orgId?: string;
	paymentAmount: number;
	paymentFrequency: PaymentFrequency;
	primaryBorrowerId: Id<"borrowers">;
	principal: number;
}

export interface GenerateInitialMortgageObligationsResult {
	createdObligationIds: Id<"obligations">[];
	obligationIds: Id<"obligations">[];
	primaryBorrowerId: Id<"borrowers">;
}

export interface BootstrapOriginationPaymentsResult
	extends GenerateInitialMortgageObligationsResult {
	createdPlanEntryIds: Id<"collectionPlanEntries">[];
	scheduleRuleMissing: boolean;
}

function parseIsoBusinessDateAtNoonUtc(value: string) {
	const timestamp = new Date(`${value}T12:00:00.000Z`).getTime();
	if (!Number.isFinite(timestamp)) {
		throw new ConvexError(`Invalid ISO business date: ${value}`);
	}
	return timestamp;
}

function resolveBootstrapObligationStatus(args: {
	dueDate: number;
	now: number;
}): BootstrapObligationStatus {
	if (args.dueDate > args.now) {
		return "upcoming";
	}

	if (args.dueDate + GRACE_PERIOD_DAYS * MS_PER_DAY > args.now) {
		return "due";
	}

	return "overdue";
}

function buildRecurringDueDates(args: {
	firstPaymentDate: string;
	maturityDate: string;
	paymentFrequency: PaymentFrequency;
}) {
	const firstPaymentTs = parseIsoBusinessDateAtNoonUtc(args.firstPaymentDate);
	const maturityTs = parseIsoBusinessDateAtNoonUtc(args.maturityDate);

	if (firstPaymentTs > maturityTs) {
		throw new ConvexError(
			`Invalid schedule: firstPaymentDate (${args.firstPaymentDate}) cannot be after maturityDate (${args.maturityDate}).`
		);
	}

	const dueDates: number[] = [];
	let currentDate = new Date(firstPaymentTs);

	while (currentDate.getTime() <= maturityTs) {
		dueDates.push(currentDate.getTime());
		if (args.paymentFrequency === "monthly") {
			currentDate = advanceMonth(currentDate);
			continue;
		}

		if (
			args.paymentFrequency === "bi_weekly" ||
			args.paymentFrequency === "accelerated_bi_weekly"
		) {
			currentDate = new Date(currentDate.getTime() + 14 * MS_PER_DAY);
			continue;
		}

		currentDate = new Date(currentDate.getTime() + 7 * MS_PER_DAY);
	}

	return { dueDates, maturityTs };
}

function buildExpectedObligationSpecs(
	args: GenerateInitialMortgageObligationsInput
): ExpectedObligationSpec[] {
	if (args.paymentAmount <= 0) {
		throw new ConvexError(
			`Mortgage paymentAmount must be greater than 0. Received ${args.paymentAmount}.`
		);
	}

	const { dueDates, maturityTs } = buildRecurringDueDates(args);
	const specs: ExpectedObligationSpec[] = dueDates.map((dueDate, index) => ({
		amount: args.paymentAmount,
		dueDate,
		gracePeriodEnd: dueDate + GRACE_PERIOD_DAYS * MS_PER_DAY,
		paymentNumber: index + 1,
		status: resolveBootstrapObligationStatus({ dueDate, now: args.now }),
		type: "regular_interest",
	}));

	if (args.principal > 0) {
		specs.push({
			amount: args.principal,
			dueDate: maturityTs,
			gracePeriodEnd: maturityTs + GRACE_PERIOD_DAYS * MS_PER_DAY,
			paymentNumber: specs.length + 1,
			status: resolveBootstrapObligationStatus({
				dueDate: maturityTs,
				now: args.now,
			}),
			type: "principal_repayment",
		});
	}

	return specs;
}

function sortObligationsForBootstrap(
	left: Pick<Doc<"obligations">, "dueDate" | "paymentNumber" | "type">,
	right: Pick<Doc<"obligations">, "dueDate" | "paymentNumber" | "type">
) {
	if (left.dueDate !== right.dueDate) {
		return left.dueDate - right.dueDate;
	}

	if (left.paymentNumber !== right.paymentNumber) {
		return left.paymentNumber - right.paymentNumber;
	}

	if (left.type === right.type) {
		return 0;
	}

	return left.type === "regular_interest" ? -1 : 1;
}

async function listExistingMortgageObligations(
	ctx: Pick<MutationCtx, "db">,
	mortgageId: Id<"mortgages">
) {
	const obligations = await ctx.db
		.query("obligations")
		.withIndex("by_mortgage_and_date", (query) =>
			query.eq("mortgageId", mortgageId)
		)
		.collect();

	return [...obligations].sort(sortObligationsForBootstrap);
}

async function createBootstrapObligation(
	ctx: MutationCtx,
	args: {
		mortgageId: Id<"mortgages">;
		now: number;
		orgId?: string;
		primaryBorrowerId: Id<"borrowers">;
		spec: ExpectedObligationSpec;
	}
) {
	const orgId = args.orgId ?? (await orgIdFromMortgageId(ctx, args.mortgageId));
	const obligationId = await ctx.db.insert("obligations", {
		orgId,
		status: args.spec.status,
		machineContext: { obligationId: "", paymentsApplied: 0 },
		lastTransitionAt: args.now,
		mortgageId: args.mortgageId,
		borrowerId: args.primaryBorrowerId,
		paymentNumber: args.spec.paymentNumber,
		type: args.spec.type,
		amount: args.spec.amount,
		amountSettled: 0,
		dueDate: args.spec.dueDate,
		gracePeriodEnd: args.spec.gracePeriodEnd,
		createdAt: args.now,
	});

	await ctx.db.patch(obligationId, {
		machineContext: { obligationId, paymentsApplied: 0 },
	});

	if (args.spec.status === "due" || args.spec.status === "overdue") {
		await postObligationAccrued(ctx, {
			obligationId,
			source: OBLIGATION_ACCRUAL_SOURCE,
		});
	}

	return obligationId;
}

export async function generateInitialMortgageObligations(
	ctx: MutationCtx,
	args: GenerateInitialMortgageObligationsInput
): Promise<GenerateInitialMortgageObligationsResult> {
	const expectedObligations = buildExpectedObligationSpecs(args);
	const existingObligations = await listExistingMortgageObligations(
		ctx,
		args.mortgageId
	);
	const createdObligationIds: Id<"obligations">[] = [];
	const obligationIds: Id<"obligations">[] = [];

	for (const spec of expectedObligations) {
		const existing = existingObligations.find(
			(obligation) =>
				obligation.paymentNumber === spec.paymentNumber &&
				obligation.type === spec.type &&
				obligation.dueDate === spec.dueDate
		);
		if (existing) {
			obligationIds.push(existing._id);
			continue;
		}

		const obligationId = await createBootstrapObligation(ctx, {
			mortgageId: args.mortgageId,
			now: args.now,
			orgId: args.orgId,
			primaryBorrowerId: args.primaryBorrowerId,
			spec,
		});
		createdObligationIds.push(obligationId);
		obligationIds.push(obligationId);
	}

	return {
		createdObligationIds,
		obligationIds,
		primaryBorrowerId: args.primaryBorrowerId,
	};
}

async function resolveCurrentPlanEntryIdsForObligations(
	ctx: Pick<MutationCtx, "db">,
	args: {
		mortgageId: Id<"mortgages">;
		obligationIds: readonly Id<"obligations">[];
	}
) {
	if (args.obligationIds.length === 0) {
		return [];
	}

	const entries = await ctx.db
		.query("collectionPlanEntries")
		.withIndex("by_mortgage_status_scheduled", (query) =>
			query.eq("mortgageId", args.mortgageId)
		)
		.collect();
	const obligationIdSet = new Set(args.obligationIds);
	const liveEntries = entries
		.filter((entry) => LIVE_PLAN_ENTRY_STATUSES.has(entry.status))
		.sort((left, right) => left.scheduledDate - right.scheduledDate);
	const planEntryIds: Id<"collectionPlanEntries">[] = [];
	const seenPlanEntryIds = new Set<Id<"collectionPlanEntries">>();

	for (const obligationId of args.obligationIds) {
		const matchingEntry = liveEntries.find(
			(entry) =>
				entry.obligationIds.some(
					(entryObligationId) => entryObligationId === obligationId
				) &&
				entry.obligationIds.every((entryObligationId) =>
					obligationIdSet.has(entryObligationId)
				)
		);
		if (!matchingEntry || seenPlanEntryIds.has(matchingEntry._id)) {
			continue;
		}

		seenPlanEntryIds.add(matchingEntry._id);
		planEntryIds.push(matchingEntry._id);
	}

	return planEntryIds;
}

export async function bootstrapOriginationPayments(
	ctx: MutationCtx,
	args: GenerateInitialMortgageObligationsInput
): Promise<BootstrapOriginationPaymentsResult> {
	const obligationResult = await generateInitialMortgageObligations(ctx, args);
	const obligations = await listExistingMortgageObligations(
		ctx,
		args.mortgageId
	);
	const schedulingResult = await ensureDefaultEntriesForObligationsImpl(ctx, {
		mortgageId: args.mortgageId,
		nowMs: args.now,
		obligations: obligations
			.filter((obligation) =>
				obligationResult.obligationIds.includes(obligation._id)
			)
			.map((obligation) => ({
				_id: obligation._id,
				amount: obligation.amount,
				amountSettled: obligation.amountSettled,
				dueDate: obligation.dueDate,
				mortgageId: obligation.mortgageId,
				status: obligation.status,
			})),
	});

	return {
		createdObligationIds: obligationResult.createdObligationIds,
		createdPlanEntryIds: await resolveCurrentPlanEntryIdsForObligations(ctx, {
			mortgageId: args.mortgageId,
			obligationIds: obligationResult.obligationIds,
		}),
		obligationIds: obligationResult.obligationIds,
		primaryBorrowerId: obligationResult.primaryBorrowerId,
		scheduleRuleMissing: schedulingResult.scheduleRuleMissing,
	};
}
