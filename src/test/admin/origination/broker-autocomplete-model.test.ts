import { describe, expect, it } from "vitest";
import {
	buildBrokerDisplayLabel,
	buildFallbackBrokerOption,
	listBrokerAutocompleteOptions,
	resolveSelectedBrokerOption,
} from "#/components/admin/origination/broker-autocomplete-model";

describe("broker autocomplete model", () => {
	const brokerOptions = [
		{
			brokerId: "broker_ada",
			brokerageName: "North Star Capital",
			email: "ada@example.com",
			fullName: "Ada Lovelace",
			licenseId: "LIC-001",
		},
		{
			brokerId: "broker_grace",
			brokerageName: "Harbour Street Lending",
			email: "grace@example.com",
			fullName: "Grace Hopper",
			licenseId: null,
		},
	];

	it("builds human display labels and fallbacks without exposing raw ids", () => {
		expect(buildBrokerDisplayLabel(brokerOptions[0])).toBe("Ada Lovelace");
		expect(
			buildFallbackBrokerOption({
				brokerId: "broker_saved",
				label: "Saved Broker",
			})
		).toEqual({
			brokerId: "broker_saved",
			brokerageName: null,
			email: "",
			fullName: "Saved Broker",
			licenseId: null,
		});
	});

	it("resolves and filters broker options for autocomplete selection", () => {
		const selectedBroker = resolveSelectedBrokerOption({
			brokerOptions,
			selectedBrokerId: "broker_ada",
		});

		expect(selectedBroker).toEqual(brokerOptions[0]);
		expect(
			listBrokerAutocompleteOptions({
				brokerOptions,
				search: "harbour",
				selectedBroker,
			})
		).toEqual([brokerOptions[1]]);
	});
});
