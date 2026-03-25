import { describe, expect, it } from "vitest";
import type { GovernedEntityType } from "../../types";
import { getMachineVersion, machineRegistry } from "../registry";

// Derive governed entity types from the registry — single source of truth
const GOVERNED_ENTITY_TYPES = Object.keys(
	machineRegistry
) as GovernedEntityType[];
const VERSION_FORMAT = /^.+@.+$/;

describe("machineRegistry", () => {
	it("has a machine for every GovernedEntityType", () => {
		for (const entityType of GOVERNED_ENTITY_TYPES) {
			expect(machineRegistry[entityType]).toBeDefined();
		}
	});

	it("contains exactly the governed entity types as keys", () => {
		const registryKeys = Object.keys(machineRegistry).sort();
		const expectedKeys = [...GOVERNED_ENTITY_TYPES].sort();
		expect(registryKeys).toEqual(expectedKeys);
	});

	it("every registered machine has a non-empty id", () => {
		for (const entityType of GOVERNED_ENTITY_TYPES) {
			const machine = machineRegistry[entityType];
			expect(machine.id).toBeTruthy();
			expect(typeof machine.id).toBe("string");
		}
	});

	it("machine ids match their entity type keys", () => {
		for (const entityType of GOVERNED_ENTITY_TYPES) {
			const machine = machineRegistry[entityType];
			expect(machine.id).toBe(entityType);
		}
	});
});

describe("getMachineVersion", () => {
	it('returns "{machineId}@{version}" format', () => {
		for (const entityType of GOVERNED_ENTITY_TYPES) {
			const version = getMachineVersion(entityType);
			expect(version).toMatch(VERSION_FORMAT);
		}
	});

	it("defaults to 1.0.0 when machine has no version", () => {
		let unversionedCount = 0;

		for (const entityType of GOVERNED_ENTITY_TYPES) {
			const machine = machineRegistry[entityType];
			if (!machine.version) {
				unversionedCount += 1;
				expect(getMachineVersion(entityType)).toBe(`${machine.id}@1.0.0`);
			}
		}

		expect(unversionedCount).toBeGreaterThan(0);
	});

	it("returns consistent format for all registered machines", () => {
		expect(getMachineVersion("deal")).toBe("deal@1.0.0");
		expect(getMachineVersion("onboardingRequest")).toBe(
			"onboardingRequest@1.0.0"
		);
		expect(getMachineVersion("mortgage")).toBe("mortgage@1.0.0");
		expect(getMachineVersion("obligation")).toBe("obligation@1.0.0");
	});
});
