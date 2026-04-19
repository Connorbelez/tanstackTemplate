import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getRotessaClient,
	resetRotessaClient,
	RotessaConfigError,
} from "../../../../convex/payments/rotessa/client";

afterEach(() => {
	resetRotessaClient();
	vi.unstubAllEnvs();
});

describe("getRotessaClient", () => {
	it("reuses the singleton when no overrides are provided", () => {
		vi.stubEnv("ROTESSA_API_KEY", "test-rotessa-key");

		const client = getRotessaClient();

		expect(getRotessaClient()).toBe(client);
	});

	it("rejects late singleton reconfiguration", () => {
		vi.stubEnv("ROTESSA_API_KEY", "test-rotessa-key");
		const firstFetch = vi.fn();

		getRotessaClient({
			fetchFn: firstFetch as unknown as typeof fetch,
		});

		expect(() =>
			getRotessaClient({
				baseUrl: "https://sandbox.rotessa.test",
			})
		).toThrow(RotessaConfigError);
	});
});
