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
		_creationTime: 0,
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
		config: { kind: "schedule", delayDays: 5 },
		...overrides,
	} as Doc<"collectionRules">;
}

describe("collection rule contract", () => {
	it("returns the typed schedule config as-is", () => {
		const rule = makeRule({
			kind: "schedule",
			config: { kind: "schedule", delayDays: 9 },
		});

		expect(getScheduleRuleConfig(rule)).toEqual({
			kind: "schedule",
			delayDays: 9,
		});
	});

	it("returns the typed retry config as-is", () => {
		const rule = makeRule({
			kind: "retry",
			config: { kind: "retry", backoffBaseDays: 2, maxRetries: 4 },
		});

		expect(getRetryRuleConfig(rule)).toEqual({
			kind: "retry",
			backoffBaseDays: 2,
			maxRetries: 4,
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
