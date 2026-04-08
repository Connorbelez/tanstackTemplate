/**
 * Contract and integration tests for the typed collection-rule system.
 * Spec: https://www.notion.so/337fc1b440248176af0ec126b8aac764
 *
 * Use Cases covered:
 * - UC-1: Schedule rule creates initial entries through typed configuration
 * - UC-2: Retry rule scheduling remains available through the typed active-rule model
 * - UC-4: Future rule kinds fit into the typed rule envelope without schema churn
 *
 * Requirements covered:
 * - REQ-2: Rule type is explicit and machine-verifiable
 * - REQ-4: Future rule kinds fit into stable extension points
 * - REQ-5: Active rule selection remains deterministic
 * - REQ-6: Seed/default rule migration stays idempotent and preserves behavior
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createGovernedTestConvex,
	seedBorrowerProfile,
	seedMortgage,
	seedObligation,
} from "../../../../src/test/convex/payments/helpers";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";

const DEFAULT_NOW = new Date("2026-02-10T12:00:00.000Z");

type GovernedTestConvex = ReturnType<typeof createGovernedTestConvex>;

interface RuleInsertOptions {
	code: string;
	config:
		| { kind: "schedule"; delayDays: number }
		| { kind: "retry"; maxRetries: number; backoffBaseDays: number }
		| { kind: "late_fee"; feeCode: "late_fee"; feeSurface: "borrower_charge" }
		| {
				kind: "balance_pre_check";
				signalSource: "recent_transfer_failures";
				lookbackDays: number;
				failureCountThreshold: number;
				blockingDecision: "defer";
				deferDays: number;
		  }
		| {
				kind: "balance_pre_check";
				signalSource: "recent_transfer_failures";
				lookbackDays: number;
				failureCountThreshold: number;
				blockingDecision: "suppress" | "require_operator_review";
		  }
		| { kind: "balance_pre_check"; mode: "placeholder" }
		| { kind: "reschedule_policy"; mode: "placeholder" }
		| { kind: "workout_policy"; mode: "placeholder" };
	effectiveFrom?: number;
	effectiveTo?: number;
	kind:
		| "schedule"
		| "retry"
		| "late_fee"
		| "balance_pre_check"
		| "reschedule_policy"
		| "workout_policy";
	priority: number;
	scope?:
		| { scopeType: "global" }
		| { scopeType: "mortgage"; mortgageId: Id<"mortgages"> };
	status?: "active" | "archived" | "disabled" | "draft";
	trigger: "event" | "schedule";
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(DEFAULT_NOW);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

async function insertCollectionRule(
	t: GovernedTestConvex,
	options: RuleInsertOptions
) {
	return t.run(async (ctx) =>
		ctx.db.insert("collectionRules", {
			kind: options.kind,
			code: options.code,
			displayName: options.code,
			description: `${options.code} description`,
			trigger: options.trigger,
			status: options.status ?? "active",
			scope: options.scope ?? { scopeType: "global" },
			config: options.config,
			version: 1,
			effectiveFrom: options.effectiveFrom,
			effectiveTo: options.effectiveTo,
			createdByActorId: "test",
			updatedByActorId: "test",
			priority: options.priority,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		})
	);
}

describe("typed collection-rule engine", () => {
	it("getEnabledRules filters by active status, scope, effective window, and deterministic order", async () => {
		const t = createGovernedTestConvex();
		const mortgageId = await seedMortgage(t);
		const otherMortgageId = await seedMortgage(t);
		const asOfMs = DEFAULT_NOW.getTime();

		await insertCollectionRule(t, {
			code: "retry_beta",
			kind: "retry",
			priority: 20,
			trigger: "event",
			config: { kind: "retry", maxRetries: 3, backoffBaseDays: 3 },
		});
		await insertCollectionRule(t, {
			code: "retry_status_only",
			kind: "retry",
			priority: 19,
			trigger: "event",
			config: { kind: "retry", maxRetries: 3, backoffBaseDays: 2 },
		});
		await insertCollectionRule(t, {
			code: "retry_alpha",
			kind: "retry",
			priority: 20,
			trigger: "event",
			config: { kind: "retry", maxRetries: 4, backoffBaseDays: 2 },
		});
		await insertCollectionRule(t, {
			code: "balance_review",
			kind: "balance_pre_check",
			priority: 15,
			trigger: "event",
			config: {
				kind: "balance_pre_check",
				signalSource: "recent_transfer_failures",
				lookbackDays: 14,
				failureCountThreshold: 1,
				blockingDecision: "require_operator_review",
			},
		});
		await insertCollectionRule(t, {
			code: "retry_scoped",
			kind: "retry",
			priority: 18,
			trigger: "event",
			scope: { scopeType: "mortgage", mortgageId },
			config: { kind: "retry", maxRetries: 2, backoffBaseDays: 1 },
		});
		await insertCollectionRule(t, {
			code: "retry_other_scope",
			kind: "retry",
			priority: 12,
			trigger: "event",
			scope: { scopeType: "mortgage", mortgageId: otherMortgageId },
			config: { kind: "retry", maxRetries: 2, backoffBaseDays: 1 },
		});
		await insertCollectionRule(t, {
			code: "retry_disabled",
			kind: "retry",
			priority: 5,
			trigger: "event",
			status: "disabled",
			config: { kind: "retry", maxRetries: 9, backoffBaseDays: 1 },
		});
		await insertCollectionRule(t, {
			code: "retry_future",
			kind: "retry",
			priority: 6,
			trigger: "event",
			effectiveFrom: asOfMs + 60_000,
			config: { kind: "retry", maxRetries: 9, backoffBaseDays: 1 },
		});
		await insertCollectionRule(t, {
			code: "retry_expired",
			kind: "retry",
			priority: 7,
			trigger: "event",
			effectiveTo: asOfMs - 60_000,
			config: { kind: "retry", maxRetries: 9, backoffBaseDays: 1 },
		});

		const rules = await t.query(
			internal.payments.collectionPlan.queries.getEnabledRules,
			{
				asOfMs,
				mortgageId,
				trigger: "event",
			}
		);

		expect(rules.map((rule) => rule.code)).toEqual([
			"balance_review",
			"retry_scoped",
			"retry_status_only",
			"retry_alpha",
			"retry_beta",
		]);
		expect(rules.map((rule) => rule.kind)).toEqual([
			"balance_pre_check",
			"retry",
			"retry",
			"retry",
			"retry",
		]);
	});

	it("evaluateRules dispatches by explicit rule kind even when name is not the registry key", async () => {
		const t = createGovernedTestConvex();
		const borrowerId = await seedBorrowerProfile(t);
		const mortgageId = await seedMortgage(t);
		await seedObligation(t, mortgageId, borrowerId, {
			status: "upcoming",
		});

		const ruleId = await insertCollectionRule(t, {
			code: "schedule_explicit_kind",
			kind: "schedule",
			priority: 10,
			trigger: "schedule",
			config: { kind: "schedule", delayDays: 5 },
		});

		await t.action(internal.payments.collectionPlan.engine.evaluateRules, {
			trigger: "schedule",
			mortgageId,
		});

		const entries = await t.run(async (ctx) =>
			ctx.db.query("collectionPlanEntries").collect()
		);

		expect(entries).toHaveLength(1);
		expect(entries[0]?.createdByRuleId).toBe(ruleId);
		expect(entries[0]?.source).toBe("default_schedule");
	});

	it("seedCollectionRules is idempotent for existing typed default rules", async () => {
		const t = createGovernedTestConvex();

		const retryRuleId = await insertCollectionRule(t, {
			code: "retry_rule",
			kind: "retry",
			priority: 20,
			trigger: "event",
			config: { kind: "retry", maxRetries: 7, backoffBaseDays: 2 },
		});

		await t.mutation(
			internal.payments.collectionPlan.seed.seedCollectionRules,
			{}
		);

		const retryRule = await t.run(async (ctx) => ctx.db.get(retryRuleId));

		expect(retryRule?.code).toBe("retry_rule");
		expect(retryRule?.kind).toBe("retry");
		expect(retryRule?.status).toBe("active");
		expect(retryRule?.displayName).toBeTruthy();
		expect(retryRule?.scope).toEqual({ scopeType: "global" });
		expect(retryRule?.config).toEqual({
			kind: "retry",
			maxRetries: 7,
			backoffBaseDays: 2,
		});
	});

	it("seedCollectionRules creates the canonical balance pre-check rule with typed config", async () => {
		const t = createGovernedTestConvex();

		await t.mutation(
			internal.payments.collectionPlan.seed.seedCollectionRules,
			{}
		);

		const balanceRule = await t.run(async (ctx) =>
			ctx.db
				.query("collectionRules")
				.collect()
				.then(
					(rules) =>
						rules.find((rule) => rule.code === "balance_pre_check_rule") ?? null
				)
		);

		expect(balanceRule?._id).toBeTruthy();
		expect(balanceRule?.kind).toBe("balance_pre_check");
		expect(balanceRule?.status).toBe("active");
		expect(balanceRule?.config).toEqual({
			kind: "balance_pre_check",
			signalSource: "recent_transfer_failures",
			lookbackDays: 14,
			failureCountThreshold: 1,
			blockingDecision: "defer",
			deferDays: 3,
		});
	});
});
