import type {
	GenericDatabaseReader,
	GenericDatabaseWriter,
} from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Doc, Id } from "../_generated/dataModel";

export const DEFAULT_FEE_SET_NAME = "Standard Mortgage Fees";
export const MIN_EFFECTIVE_FROM = "0000-01-01";
export const FEE_POLICY_VERSION = 1;

export type FeeCode = Doc<"feeTemplates">["code"];
export type FeeSurface = Doc<"feeTemplates">["surface"];

export interface FeeParameters {
	annualRate?: number;
	dueDays?: number;
	fixedAmountCents?: number;
	graceDays?: number;
}

export interface FeeDefinitionInput {
	calculationType: Doc<"feeTemplates">["calculationType"];
	code: FeeCode;
	parameters: FeeParameters;
	revenueDestination: Doc<"feeTemplates">["revenueDestination"];
	surface: FeeSurface;
}

export interface ResolvedServicingFeeConfig {
	annualRate: number;
	code: "servicing";
	mortgageFeeId?: Id<"mortgageFees">;
	policyVersion: number;
	revenueDestination: Doc<"mortgageFees">["revenueDestination"];
}

export interface ResolvedBorrowerChargeFeeConfig {
	code: Exclude<FeeCode, "servicing">;
	dueDays: number;
	fixedAmountCents: number;
	graceDays: number;
	mortgageFeeId: Id<"mortgageFees">;
	policyVersion: number;
	revenueDestination: Doc<"mortgageFees">["revenueDestination"];
}

export function normalizeEffectiveFrom(value?: string) {
	return value ?? MIN_EFFECTIVE_FROM;
}

function dateInRange(date: string, from: string, to?: string) {
	if (date < from) {
		return false;
	}
	if (to !== undefined && date > to) {
		return false;
	}
	return true;
}

function rangesOverlap(
	left: { effectiveFrom: string; effectiveTo?: string },
	right: { effectiveFrom: string; effectiveTo?: string }
) {
	const leftEnd = left.effectiveTo ?? "9999-12-31";
	const rightEnd = right.effectiveTo ?? "9999-12-31";
	return left.effectiveFrom <= rightEnd && right.effectiveFrom <= leftEnd;
}

function compareMortgageFees(
	left: Pick<Doc<"mortgageFees">, "effectiveFrom" | "createdAt" | "_id">,
	right: Pick<Doc<"mortgageFees">, "effectiveFrom" | "createdAt" | "_id">
) {
	if (left.effectiveFrom !== right.effectiveFrom) {
		return left.effectiveFrom.localeCompare(right.effectiveFrom);
	}
	if (left.createdAt !== right.createdAt) {
		return left.createdAt - right.createdAt;
	}
	return left._id.localeCompare(right._id);
}

export function assertValidFeeDefinition(input: FeeDefinitionInput) {
	if (input.surface === "waterfall_deduction" && input.code !== "servicing") {
		throw new ConvexError(
			`Unsupported waterfall fee code "${input.code}" in v1; only servicing is allowed in the settlement waterfall`
		);
	}

	if (
		input.surface === "borrower_charge" &&
		input.code !== "late_fee" &&
		input.code !== "nsf"
	) {
		throw new ConvexError(
			`Unsupported borrower charge fee code "${input.code}" in v1`
		);
	}

	if (input.revenueDestination !== "platform_revenue") {
		throw new ConvexError(
			`Unsupported revenueDestination "${input.revenueDestination}" in v1; only platform_revenue is supported`
		);
	}

	if (input.calculationType === "annual_rate_principal") {
		if (
			typeof input.parameters.annualRate !== "number" ||
			!Number.isFinite(input.parameters.annualRate) ||
			input.parameters.annualRate < 0
		) {
			throw new ConvexError(
				"annual_rate_principal fees require a non-negative annualRate"
			);
		}
		return;
	}

	const fixedAmountCents = input.parameters.fixedAmountCents;
	if (
		fixedAmountCents === undefined ||
		!Number.isSafeInteger(fixedAmountCents) ||
		fixedAmountCents < 0
	) {
		throw new ConvexError(
			"fixed_amount_cents fees require a non-negative integer fixedAmountCents"
		);
	}

	if (input.code === "late_fee") {
		const dueDays = input.parameters.dueDays;
		if (
			dueDays === undefined ||
			!Number.isSafeInteger(dueDays) ||
			dueDays <= 0
		) {
			throw new ConvexError("late_fee fees require a positive integer dueDays");
		}
		const graceDays = input.parameters.graceDays;
		if (
			graceDays === undefined ||
			!Number.isSafeInteger(graceDays) ||
			graceDays <= 0
		) {
			throw new ConvexError(
				"late_fee fees require a positive integer graceDays"
			);
		}
	}
}

export async function listActiveMortgageFeesForSurface(
	db: GenericDatabaseReader<DataModel>,
	mortgageId: Id<"mortgages">,
	surface: FeeSurface,
	asOfDate: string
) {
	const rows = await db
		.query("mortgageFees")
		.withIndex("by_mortgage_surface_status", (q) =>
			q
				.eq("mortgageId", mortgageId)
				.eq("surface", surface)
				.eq("status", "active")
		)
		.collect();

	return rows
		.filter((row) => dateInRange(asOfDate, row.effectiveFrom, row.effectiveTo))
		.sort(compareMortgageFees);
}

export async function resolveServicingFeeConfig(
	db: GenericDatabaseReader<DataModel>,
	mortgage: Pick<Doc<"mortgages">, "_id" | "annualServicingRate">,
	asOfDate: string
): Promise<ResolvedServicingFeeConfig> {
	const activeRows = await listActiveMortgageFeesForSurface(
		db,
		mortgage._id,
		"waterfall_deduction",
		asOfDate
	);
	const servicingRows = activeRows.filter((row) => row.code === "servicing");

	if (servicingRows.length > 1) {
		throw new ConvexError(
			`Multiple active servicing fee configs found for mortgage ${mortgage._id} on ${asOfDate}`
		);
	}

	if (servicingRows.length === 1) {
		const row = servicingRows[0];
		if (row.calculationType !== "annual_rate_principal") {
			throw new ConvexError(
				`Servicing fee config ${row._id} must use annual_rate_principal`
			);
		}
		const annualRate = row.parameters.annualRate;
		if (annualRate === undefined) {
			throw new ConvexError(
				`Servicing fee config ${row._id} is missing annualRate`
			);
		}
		return {
			code: "servicing",
			mortgageFeeId: row._id,
			annualRate,
			policyVersion: FEE_POLICY_VERSION,
			revenueDestination: row.revenueDestination,
		};
	}

	return {
		code: "servicing",
		annualRate: mortgage.annualServicingRate ?? 0.01,
		policyVersion: FEE_POLICY_VERSION,
		revenueDestination: "platform_revenue",
	};
}

export async function resolveBorrowerChargeFeeConfig(
	db: GenericDatabaseReader<DataModel>,
	mortgageId: Id<"mortgages">,
	code: "late_fee" | "nsf",
	asOfDate: string
): Promise<ResolvedBorrowerChargeFeeConfig | null> {
	const activeRows = await listActiveMortgageFeesForSurface(
		db,
		mortgageId,
		"borrower_charge",
		asOfDate
	);
	const matchingRows = activeRows.filter((row) => row.code === code);

	if (matchingRows.length > 1) {
		throw new ConvexError(
			`Multiple active ${code} fee configs found for mortgage ${mortgageId} on ${asOfDate}`
		);
	}

	if (matchingRows.length === 0) {
		return null;
	}

	const row = matchingRows[0];
	if (row.calculationType !== "fixed_amount_cents") {
		throw new ConvexError(
			`${code} fee config ${row._id} must use fixed_amount_cents`
		);
	}
	if (row.parameters.fixedAmountCents === undefined) {
		throw new ConvexError(
			`${code} fee config ${row._id} is missing fixedAmountCents`
		);
	}

	return {
		code,
		dueDays: row.parameters.dueDays ?? 30,
		fixedAmountCents: row.parameters.fixedAmountCents,
		graceDays: row.parameters.graceDays ?? 45,
		mortgageFeeId: row._id,
		policyVersion: FEE_POLICY_VERSION,
		revenueDestination: row.revenueDestination,
	};
}

export async function assertNoOverlappingMortgageFee(
	db: GenericDatabaseReader<DataModel>,
	args: {
		mortgageId: Id<"mortgages">;
		code: FeeCode;
		surface: FeeSurface;
		effectiveFrom: string;
		effectiveTo?: string;
	},
	excludeId?: Id<"mortgageFees">
) {
	const existingRows = await db
		.query("mortgageFees")
		.withIndex("by_mortgage_code_surface_status", (q) =>
			q
				.eq("mortgageId", args.mortgageId)
				.eq("code", args.code)
				.eq("surface", args.surface)
				.eq("status", "active")
		)
		.collect();

	for (const row of existingRows) {
		if (excludeId !== undefined && row._id === excludeId) {
			continue;
		}
		if (
			rangesOverlap(
				{ effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo },
				{ effectiveFrom: args.effectiveFrom, effectiveTo: args.effectiveTo }
			)
		) {
			throw new ConvexError(
				`Overlapping active mortgage fee exists for mortgage ${args.mortgageId}, code ${args.code}, surface ${args.surface}`
			);
		}
	}
}

async function getFeeTemplateByCode(
	db: GenericDatabaseReader<DataModel>,
	code: FeeCode
) {
	const rows = await db
		.query("feeTemplates")
		.withIndex("by_code_and_surface", (q) => q.eq("code", code))
		.collect();
	return rows[0] ?? null;
}

async function getDefaultFeeSet(db: GenericDatabaseReader<DataModel>) {
	const rows = await db
		.query("feeSetTemplates")
		.withIndex("by_status", (q) => q.eq("status", "active"))
		.collect();
	return rows.find((row) => row.name === DEFAULT_FEE_SET_NAME) ?? null;
}

export async function ensureDefaultFeeTemplatesAndSet(
	db: GenericDatabaseWriter<DataModel>
) {
	const now = Date.now();

	let servicingTemplate = await getFeeTemplateByCode(db, "servicing");
	if (!servicingTemplate) {
		const id = await db.insert("feeTemplates", {
			name: "Standard Servicing Fee",
			description:
				"Standard servicing fee deducted from regular interest settlements",
			code: "servicing",
			surface: "waterfall_deduction",
			revenueDestination: "platform_revenue",
			calculationType: "annual_rate_principal",
			parameters: { annualRate: 0.01 },
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const createdTemplate = await db.get(id);
		if (!createdTemplate) {
			throw new ConvexError(`Failed to load inserted fee template ${id}`);
		}
		servicingTemplate = createdTemplate;
	}

	let lateFeeTemplate = await getFeeTemplateByCode(db, "late_fee");
	if (!lateFeeTemplate) {
		const id = await db.insert("feeTemplates", {
			name: "Standard Late Fee",
			description: "Borrower late fee assessed after grace expiry",
			code: "late_fee",
			surface: "borrower_charge",
			revenueDestination: "platform_revenue",
			calculationType: "fixed_amount_cents",
			parameters: { fixedAmountCents: 5000, dueDays: 30, graceDays: 45 },
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const createdTemplate = await db.get(id);
		if (!createdTemplate) {
			throw new ConvexError(`Failed to load inserted fee template ${id}`);
		}
		lateFeeTemplate = createdTemplate;
	}

	let nsfTemplate = await getFeeTemplateByCode(db, "nsf");
	if (!nsfTemplate) {
		const id = await db.insert("feeTemplates", {
			name: "Standard NSF Fee",
			description:
				"Config-ready NSF fee definition; auto-generation is deferred in v1",
			code: "nsf",
			surface: "borrower_charge",
			revenueDestination: "platform_revenue",
			calculationType: "fixed_amount_cents",
			parameters: { fixedAmountCents: 5000, dueDays: 30, graceDays: 45 },
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const createdTemplate = await db.get(id);
		if (!createdTemplate) {
			throw new ConvexError(`Failed to load inserted fee template ${id}`);
		}
		nsfTemplate = createdTemplate;
	}

	let feeSet = await getDefaultFeeSet(db);
	if (!feeSet) {
		const id = await db.insert("feeSetTemplates", {
			name: DEFAULT_FEE_SET_NAME,
			description:
				"Default servicing and late-fee configuration for active mortgages",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const createdFeeSet = await db.get(id);
		if (!createdFeeSet) {
			throw new ConvexError(`Failed to load inserted fee set ${id}`);
		}
		feeSet = createdFeeSet;
	}

	if (!(servicingTemplate && lateFeeTemplate && feeSet && nsfTemplate)) {
		throw new ConvexError("Failed to create default fee templates or set");
	}

	const guaranteedServicingTemplate = servicingTemplate;
	const guaranteedLateFeeTemplate = lateFeeTemplate;
	const guaranteedNsfTemplate = nsfTemplate;
	const guaranteedFeeSet = feeSet;

	const existingItems = await db
		.query("feeSetTemplateItems")
		.withIndex("by_fee_set_template", (q) =>
			q.eq("feeSetTemplateId", guaranteedFeeSet._id)
		)
		.collect();

	const existingTemplateIds = new Set(
		existingItems.map((item) => item.feeTemplateId)
	);
	if (!existingTemplateIds.has(guaranteedServicingTemplate._id)) {
		await db.insert("feeSetTemplateItems", {
			feeSetTemplateId: guaranteedFeeSet._id,
			feeTemplateId: guaranteedServicingTemplate._id,
			sortOrder: 10,
			createdAt: now,
		});
	}
	if (!existingTemplateIds.has(guaranteedLateFeeTemplate._id)) {
		await db.insert("feeSetTemplateItems", {
			feeSetTemplateId: guaranteedFeeSet._id,
			feeTemplateId: guaranteedLateFeeTemplate._id,
			sortOrder: 20,
			createdAt: now,
		});
	}

	return {
		feeSetId: guaranteedFeeSet._id,
		lateFeeTemplateId: guaranteedLateFeeTemplate._id,
		nsfTemplateId: guaranteedNsfTemplate._id,
		servicingTemplateId: guaranteedServicingTemplate._id,
	};
}

export async function attachFeeTemplateToMortgageSnapshot(
	db: GenericDatabaseWriter<DataModel>,
	args: {
		mortgageId: Id<"mortgages">;
		feeTemplate: Doc<"feeTemplates">;
		effectiveFrom?: string;
		effectiveTo?: string;
		feeSetTemplateId?: Id<"feeSetTemplates">;
		feeSetTemplateItemId?: Id<"feeSetTemplateItems">;
		parameterOverrides?: FeeParameters;
	}
) {
	const effectiveFrom = normalizeEffectiveFrom(args.effectiveFrom);
	const parameters: FeeParameters = {
		...args.feeTemplate.parameters,
		...args.parameterOverrides,
	};

	assertValidFeeDefinition({
		calculationType: args.feeTemplate.calculationType,
		code: args.feeTemplate.code,
		parameters,
		revenueDestination: args.feeTemplate.revenueDestination,
		surface: args.feeTemplate.surface,
	});

	await assertNoOverlappingMortgageFee(db, {
		mortgageId: args.mortgageId,
		code: args.feeTemplate.code,
		surface: args.feeTemplate.surface,
		effectiveFrom,
		effectiveTo: args.effectiveTo,
	});

	return db.insert("mortgageFees", {
		mortgageId: args.mortgageId,
		code: args.feeTemplate.code,
		surface: args.feeTemplate.surface,
		revenueDestination: args.feeTemplate.revenueDestination,
		calculationType: args.feeTemplate.calculationType,
		parameters,
		effectiveFrom,
		effectiveTo: args.effectiveTo,
		status: "active",
		feeTemplateId: args.feeTemplate._id,
		feeSetTemplateId: args.feeSetTemplateId,
		feeSetTemplateItemId: args.feeSetTemplateItemId,
		createdAt: Date.now(),
	});
}

export async function attachDefaultFeeSetToMortgage(
	db: GenericDatabaseWriter<DataModel>,
	mortgageId: Id<"mortgages">,
	annualServicingRate?: number
) {
	const defaults = await ensureDefaultFeeTemplatesAndSet(db);
	const items = await db
		.query("feeSetTemplateItems")
		.withIndex("by_fee_set_template", (q) =>
			q.eq("feeSetTemplateId", defaults.feeSetId)
		)
		.collect();

	for (const item of items.sort(
		(left, right) => left.sortOrder - right.sortOrder
	)) {
		const template = await db.get(item.feeTemplateId);
		if (!template) {
			continue;
		}
		const existingRows = await db
			.query("mortgageFees")
			.withIndex("by_mortgage_code_surface_status", (q) =>
				q
					.eq("mortgageId", mortgageId)
					.eq("code", template.code)
					.eq("surface", template.surface)
					.eq("status", "active")
			)
			.collect();
		if (existingRows.length > 0) {
			continue;
		}

		await attachFeeTemplateToMortgageSnapshot(db, {
			mortgageId,
			feeTemplate: template,
			feeSetTemplateId: defaults.feeSetId,
			feeSetTemplateItemId: item._id,
			parameterOverrides:
				template.code === "servicing" && annualServicingRate !== undefined
					? { annualRate: annualServicingRate }
					: undefined,
		});
	}
}
