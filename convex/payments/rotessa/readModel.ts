import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { normalizeEmail } from "../../seed/seedHelpers";

const MS_PER_DAY = 86_400_000;

export interface NormalizedRotessaScheduleSnapshot {
	amountCents?: number;
	comment?: string;
	externalScheduleRef: string;
	frequency: string;
	installments?: number;
	nextProcessDate?: string;
	originationPaymentFrequency?: Doc<"mortgages">["paymentFrequency"];
	processDate: string;
	providerData?: Record<string, unknown>;
	providerScheduleStatus?: string;
}

export interface NormalizedRotessaCustomerSnapshot {
	accountLast4?: string;
	accountNumber?: string;
	authorizationType?: string;
	bankAccountType?: string;
	bankName?: string;
	customerType?: string;
	email?: string;
	externalCustomerCustomIdentifier?: string;
	externalCustomerRef: string;
	fullName: string;
	institutionNumber?: string;
	phone?: string;
	providerData?: Record<string, unknown>;
	schedules: NormalizedRotessaScheduleSnapshot[];
	transitNumber?: string;
}

interface BorrowerMatch {
	borrowerId?: Id<"borrowers">;
	matchStatus: Doc<"externalCustomerProfiles">["matchStatus"];
	orgId?: string;
}

function trimToUndefined(value: string | null | undefined) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function accountLast4FromNumber(accountNumber: string | null | undefined) {
	const digits = accountNumber?.replace(/\s+/g, "");
	return digits && digits.length >= 4 ? digits.slice(-4) : undefined;
}

function buildBankAccountMetadata(args: {
	existingMetadata?: Record<string, unknown>;
	externalCustomerCustomIdentifier?: string;
	externalCustomerRef: string;
}) {
	return {
		...(args.existingMetadata ?? {}),
		rotessaCustomerCustomIdentifier: args.externalCustomerCustomIdentifier,
		rotessaCustomerId: Number.parseInt(args.externalCustomerRef, 10),
	};
}

function scheduleLinkStatusForUpsert(args: {
	current?: Doc<"externalProviderSchedules"> | null;
	linkedMortgageId?: Id<"mortgages">;
	reservedForCaseId?: Id<"adminOriginationCases">;
}) {
	if (args.current?.linkStatus === "suppressed") {
		return "suppressed" as const;
	}
	if (args.current?.linkStatus === "conflict") {
		return "conflict" as const;
	}
	if (args.linkedMortgageId || args.current?.linkedMortgageId) {
		return "linked" as const;
	}
	if (args.reservedForCaseId || args.current?.reservedForCaseId) {
		return "reserved" as const;
	}
	return "available" as const;
}

export function parseRotessaAmountToCents(amount: string | null | undefined) {
	const normalized = trimToUndefined(amount);
	if (!normalized) {
		return undefined;
	}

	const parsed = Number.parseFloat(normalized);
	if (!Number.isFinite(parsed)) {
		return undefined;
	}

	return Math.round(parsed * 100);
}

export function mapRotessaFrequencyToOriginationPaymentFrequency(
	frequency: string | null | undefined
) {
	switch (trimToUndefined(frequency)) {
		case "Monthly":
			return "monthly" as const;
		case "Every Other Week":
			return "bi_weekly" as const;
		case "Weekly":
			return "weekly" as const;
		default:
			return undefined;
	}
}

export function computeScheduledInstallmentCount(args: {
	firstPaymentDate: string;
	maturityDate: string;
	paymentFrequency: Doc<"mortgages">["paymentFrequency"];
}) {
	const firstTs = Date.parse(`${args.firstPaymentDate}T12:00:00.000Z`);
	const maturityTs = Date.parse(`${args.maturityDate}T12:00:00.000Z`);
	if (!(Number.isFinite(firstTs) && Number.isFinite(maturityTs))) {
		throw new ConvexError(
			"Valid first payment and maturity dates are required to compute the Rotessa installment count."
		);
	}

	const dates: number[] = [];
	let current = new Date(firstTs);

	while (current.getTime() <= maturityTs) {
		dates.push(current.getTime());
		if (args.paymentFrequency === "monthly") {
			const next = new Date(current.getTime());
			const targetMonth = next.getMonth() + 1;
			next.setMonth(targetMonth);
			if (next.getMonth() !== targetMonth % 12) {
				next.setDate(0);
			}
			current = next;
			continue;
		}

		const deltaDays = args.paymentFrequency === "weekly" ? 7 : 14;
		current = new Date(current.getTime() + deltaDays * MS_PER_DAY);
	}

	return dates.length;
}

export async function resolveBorrowerMatchForRotessaCustomer(
	ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
	customer: Pick<NormalizedRotessaCustomerSnapshot, "email">
): Promise<BorrowerMatch> {
	const email = customer.email ? normalizeEmail(customer.email) : undefined;
	if (!email) {
		return { matchStatus: "unmatched" };
	}

	const user = await ctx.db
		.query("users")
		.filter((query) => query.eq(query.field("email"), email))
		.first();
	if (!user) {
		return { matchStatus: "unmatched" };
	}

	const borrowers = await ctx.db
		.query("borrowers")
		.withIndex("by_user", (query) => query.eq("userId", user._id))
		.collect();

	if (borrowers.length === 1) {
		return {
			borrowerId: borrowers[0]._id,
			matchStatus: "linked",
			orgId: borrowers[0].orgId,
		};
	}

	if (borrowers.length === 0) {
		return { matchStatus: "unmatched" };
	}

	return { matchStatus: "conflict" };
}

export async function ensureBorrowerBankAccountForRotessaCustomer(
	ctx: Pick<MutationCtx, "db">,
	args: {
		borrowerId: Id<"borrowers">;
		customer: NormalizedRotessaCustomerSnapshot;
		now: number;
	}
) {
	const ownerId = String(args.borrowerId);
	const existingAccounts = await ctx.db
		.query("bankAccounts")
		.withIndex("by_owner", (query) =>
			query.eq("ownerType", "borrower").eq("ownerId", ownerId)
		)
		.collect();

	const accountLast4 =
		args.customer.accountLast4 ??
		accountLast4FromNumber(args.customer.accountNumber);
	const matchingAccount =
		existingAccounts.find(
			(account) =>
				account.accountNumber &&
				args.customer.accountNumber &&
				account.accountNumber === args.customer.accountNumber
		) ??
		existingAccounts.find(
			(account) =>
				account.accountLast4 === accountLast4 &&
				account.institutionNumber === args.customer.institutionNumber &&
				account.transitNumber === args.customer.transitNumber
		);

	const nextMetadata = buildBankAccountMetadata({
		existingMetadata: matchingAccount?.metadata as
			| Record<string, unknown>
			| undefined,
		externalCustomerCustomIdentifier:
			args.customer.externalCustomerCustomIdentifier,
		externalCustomerRef: args.customer.externalCustomerRef,
	});

	if (matchingAccount) {
		await ctx.db.patch(matchingAccount._id, {
			accountLast4: accountLast4 ?? matchingAccount.accountLast4 ?? undefined,
			accountNumber:
				args.customer.accountNumber ??
				matchingAccount.accountNumber ??
				undefined,
			institutionNumber:
				args.customer.institutionNumber ??
				matchingAccount.institutionNumber ??
				undefined,
			isDefaultInbound:
				matchingAccount.isDefaultInbound ??
				!existingAccounts.some((account) => account.isDefaultInbound),
			mandateStatus: "active",
			metadata: nextMetadata,
			status: "validated",
			transitNumber:
				args.customer.transitNumber ??
				matchingAccount.transitNumber ??
				undefined,
			updatedAt: args.now,
			validationMethod: "provider_verified",
		});
		return matchingAccount._id;
	}

	if (
		!(
			args.customer.accountNumber &&
			args.customer.institutionNumber &&
			args.customer.transitNumber
		)
	) {
		return undefined;
	}

	return ctx.db.insert("bankAccounts", {
		accountLast4,
		accountNumber: args.customer.accountNumber,
		country: "CA",
		createdAt: args.now,
		currency: "CAD",
		institutionNumber: args.customer.institutionNumber,
		isDefaultInbound: !existingAccounts.some(
			(account) => account.isDefaultInbound
		),
		mandateStatus: "active",
		metadata: nextMetadata,
		ownerId,
		ownerType: "borrower",
		status: "validated",
		transitNumber: args.customer.transitNumber,
		updatedAt: args.now,
		validationMethod: "provider_verified",
	});
}

export async function upsertExternalCustomerProfile(
	ctx: Pick<MutationCtx, "db">,
	args: {
		customer: NormalizedRotessaCustomerSnapshot;
		match: BorrowerMatch;
		now: number;
		source: Doc<"externalCustomerProfiles">["source"];
	}
) {
	const existingByProviderRef = await ctx.db
		.query("externalCustomerProfiles")
		.withIndex("by_provider_ref", (query) =>
			query
				.eq("providerCode", "pad_rotessa")
				.eq("externalCustomerRef", args.customer.externalCustomerRef)
		)
		.first();

	const bankAccountId =
		args.match.borrowerId === undefined
			? undefined
			: await ensureBorrowerBankAccountForRotessaCustomer(ctx, {
					borrowerId: args.match.borrowerId,
					customer: args.customer,
					now: args.now,
				});

	const patch = {
		accountNumber: args.customer.accountNumber,
		accountLast4:
			args.customer.accountLast4 ??
			accountLast4FromNumber(args.customer.accountNumber),
		authorizationType: args.customer.authorizationType,
		bankAccountId,
		bankAccountType: args.customer.bankAccountType,
		bankName: args.customer.bankName,
		borrowerId: args.match.borrowerId,
		customerType: args.customer.customerType,
		email: args.customer.email
			? normalizeEmail(args.customer.email)
			: undefined,
		externalCustomerCustomIdentifier:
			args.customer.externalCustomerCustomIdentifier,
		fullName: args.customer.fullName,
		institutionNumber: args.customer.institutionNumber,
		matchStatus:
			existingByProviderRef?.matchStatus === "suppressed"
				? existingByProviderRef.matchStatus
				: args.match.matchStatus,
		orgId: args.match.orgId,
		phone: args.customer.phone,
		providerData: args.customer.providerData,
		source: args.source,
		suppressionReason:
			existingByProviderRef?.matchStatus === "suppressed"
				? existingByProviderRef.suppressionReason
				: undefined,
		transitNumber: args.customer.transitNumber,
		updatedAt: args.now,
		lastSyncedAt: args.now,
	};

	if (existingByProviderRef) {
		await ctx.db.patch(existingByProviderRef._id, patch);
		return {
			bankAccountId,
			customerProfileId: existingByProviderRef._id,
			matchStatus: patch.matchStatus,
		};
	}

	const customerProfileId = await ctx.db.insert("externalCustomerProfiles", {
		...patch,
		createdAt: args.now,
		externalCustomerRef: args.customer.externalCustomerRef,
		providerCode: "pad_rotessa",
	});

	return {
		bankAccountId,
		customerProfileId,
		matchStatus: patch.matchStatus,
	};
}

export async function upsertExternalProviderSchedulesForCustomer(
	ctx: Pick<MutationCtx, "db">,
	args: {
		bankAccountId?: Id<"bankAccounts">;
		borrowerId?: Id<"borrowers">;
		customerProfileId: Id<"externalCustomerProfiles">;
		linkedExternalCollectionScheduleId?: Id<"externalCollectionSchedules">;
		linkedMortgageId?: Id<"mortgages">;
		now: number;
		reservedForCaseId?: Id<"adminOriginationCases">;
		schedules: readonly NormalizedRotessaScheduleSnapshot[];
		source: Doc<"externalProviderSchedules">["source"];
	}
) {
	const scheduleIds: Id<"externalProviderSchedules">[] = [];

	for (const schedule of args.schedules) {
		const existing = await ctx.db
			.query("externalProviderSchedules")
			.withIndex("by_provider_ref", (query) =>
				query
					.eq("providerCode", "pad_rotessa")
					.eq("externalScheduleRef", schedule.externalScheduleRef)
			)
			.first();

		const patch = {
			amountCents: schedule.amountCents,
			bankAccountId: args.bankAccountId ?? existing?.bankAccountId,
			borrowerId: args.borrowerId ?? existing?.borrowerId,
			comment: schedule.comment,
			externalCustomerProfileId: args.customerProfileId,
			frequency: schedule.frequency,
			installments: schedule.installments,
			linkedExternalCollectionScheduleId:
				args.linkedExternalCollectionScheduleId ??
				existing?.linkedExternalCollectionScheduleId,
			linkedMortgageId: args.linkedMortgageId ?? existing?.linkedMortgageId,
			linkStatus: scheduleLinkStatusForUpsert({
				current: existing,
				linkedMortgageId: args.linkedMortgageId ?? existing?.linkedMortgageId,
				reservedForCaseId:
					args.reservedForCaseId ?? existing?.reservedForCaseId,
			}),
			nextProcessDate: schedule.nextProcessDate,
			originationPaymentFrequency:
				schedule.originationPaymentFrequency ??
				existing?.originationPaymentFrequency,
			processDate: schedule.processDate,
			providerData: schedule.providerData,
			providerScheduleStatus:
				schedule.providerScheduleStatus ?? existing?.providerScheduleStatus,
			reservedForCaseId:
				args.linkedMortgageId === undefined
					? (args.reservedForCaseId ?? existing?.reservedForCaseId)
					: undefined,
			source: args.source,
			suppressionReason:
				existing?.linkStatus === "suppressed"
					? existing.suppressionReason
					: undefined,
			updatedAt: args.now,
			lastSyncedAt: args.now,
		};

		if (existing) {
			await ctx.db.patch(existing._id, patch);
			scheduleIds.push(existing._id);
			continue;
		}

		const scheduleId = await ctx.db.insert("externalProviderSchedules", {
			...patch,
			createdAt: args.now,
			externalScheduleRef: schedule.externalScheduleRef,
			providerCode: "pad_rotessa",
		});
		scheduleIds.push(scheduleId);
	}

	return scheduleIds;
}

export async function logRotessaReconciliationAction(
	ctx: Pick<MutationCtx, "db">,
	args: {
		actionType: string;
		actorUserId?: Id<"users">;
		entityId: string;
		entityType: Doc<"rotessaReconciliationActions">["entityType"];
		metadata?: Record<string, unknown>;
		note?: string;
		now: number;
	}
) {
	return ctx.db.insert("rotessaReconciliationActions", {
		actionType: args.actionType,
		actorUserId: args.actorUserId,
		createdAt: args.now,
		entityId: args.entityId,
		entityType: args.entityType,
		metadata: args.metadata,
		note: args.note,
	});
}
