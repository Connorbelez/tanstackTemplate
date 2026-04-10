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
		| { kind: "balance_pre_check"; mode: "placeholder" }
		| { kind: "reschedule_policy"; mode: "placeholder" }
		| { kind: "workout_policy"; mode: "placeholder" };
	effectiveFrom?: number;
	effectiveTo?: number;
	includeLegacyEnabled?: boolean;
	kind:
		| "schedule"
		| "retry"
		| "late_fee"
		| "balance_pre_check"
		| "reschedule_policy"
		| "workout_policy";
	name?: string;
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
			name: options.name ?? options.code,
			action: "test_action",
			parameters: {},
			priority: options.priority,
			enabled:
				options.includeLegacyEnabled === false
					? undefined
					: (options.status ?? "active") === "active",
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
			includeLegacyEnabled: false,
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
			config: { kind: "balance_pre_check", mode: "placeholder" },
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

		expect(rules.map((rule) => rule.code ?? rule.name)).toEqual([
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
			name: "legacy_name_not_used_for_dispatch",
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
		expect(entries[0]?.ruleId).toBe(ruleId);
		expect(entries[0]?.source).toBe("default_schedule");
	});

	it("seedCollectionRules backfills typed metadata on a legacy default rule without changing its behavior", async () => {
		const t = createGovernedTestConvex();

		const legacyRetryRuleId = await t.run(async (ctx) =>
			ctx.db.insert("collectionRules", {
				name: "retry_rule",
				trigger: "event",
				action: "create_retry_entry",
				parameters: { maxRetries: 7, backoffBaseDays: 2 },
				priority: 20,
				enabled: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		);

		await t.mutation(
			internal.payments.collectionPlan.seed.seedCollectionRules,
			{}
		);

		const retryRule = await t.run(async (ctx) => ctx.db.get(legacyRetryRuleId));

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
});
