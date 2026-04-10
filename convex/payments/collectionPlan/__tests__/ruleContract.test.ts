import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../../_generated/dataModel";
import {
	getCollectionRuleKind,
	getRetryRuleConfig,
	getScheduleRuleConfig,
} from "../ruleContract";

const COLLECTION_RULE_KIND_MISMATCH = /Collection rule kind mismatch/;

function makeRule(
	overrides: Partial<Doc<"collectionRules">> = {}
): Doc<"collectionRules"> {
	return {
		_id: "collectionRules_test_rule" as Id<"collectionRules">,
		action: "test_action",
		code: "test_rule",
		createdAt: 0,
		createdByActorId: "test",
		description: "test rule",
		enabled: true,
		priority: 1,
		status: "active",
		trigger: "schedule",
		updatedAt: 0,
		updatedByActorId: "test",
		version: 1,
		...overrides,
	} as Doc<"collectionRules">;
}

describe("collection rule contract", () => {
	it("falls back to defaults when legacy schedule parameters are invalid", () => {
		const rule = makeRule({
			kind: "schedule",
			parameters: {
				delayDays: 7.5,
			},
		});

		expect(getScheduleRuleConfig(rule)).toEqual({
			kind: "schedule",
			delayDays: 5,
		});
	});

	it("falls back to defaults when legacy retry parameters are invalid", () => {
		const rule = makeRule({
			kind: "retry",
			parameters: {
				backoffBaseDays: -1,
				maxRetries: 2.25,
			},
		});

		expect(getRetryRuleConfig(rule)).toEqual({
			kind: "retry",
			backoffBaseDays: 3,
			maxRetries: 3,
		});
	});

	it("rejects mismatched rule and config kinds", () => {
		const rule = makeRule({
			kind: "schedule",
			config: { kind: "retry", backoffBaseDays: 3, maxRetries: 3 },
		});

		expect(() => getCollectionRuleKind(rule)).toThrow(
			COLLECTION_RULE_KIND_MISMATCH
		);
	});
});
