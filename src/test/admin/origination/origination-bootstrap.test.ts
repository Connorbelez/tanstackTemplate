/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
	peekOriginationBootstrapState,
	registerOriginationBootstrapCase,
	releaseOriginationBootstrapForCase,
	reserveOriginationBootstrapState,
} from "#/lib/admin-origination-bootstrap";

function createMemoryStorage() {
	const entries = new Map<string, string>();
	return {
		getItem: (key: string) => entries.get(key) ?? null,
		removeItem: (key: string) => {
			entries.delete(key);
		},
		setItem: (key: string, value: string) => {
			entries.set(key, value);
		},
	};
}

describe("origination bootstrap storage", () => {
	let storage: ReturnType<typeof createMemoryStorage>;

	beforeEach(() => {
		storage = createMemoryStorage();
	});

	it("reuses the same bootstrap token until the created case is released", () => {
		const first = reserveOriginationBootstrapState(storage);
		const second = reserveOriginationBootstrapState(storage);

		expect(second).toEqual(first);

		registerOriginationBootstrapCase(first.token, "case_123", storage);
		expect(peekOriginationBootstrapState(storage)).toEqual({
			caseId: "case_123",
			token: first.token,
		});

		releaseOriginationBootstrapForCase("case_123", storage);
		expect(peekOriginationBootstrapState(storage)).toBeUndefined();
	});

	it("drops malformed persisted state and allocates a fresh bootstrap token", () => {
		storage.setItem("admin-origination-bootstrap", "{bad json");

		const bootstrap = reserveOriginationBootstrapState(storage);

		expect(bootstrap.token).toMatch(/^origination-bootstrap-/);
		expect(peekOriginationBootstrapState(storage)).toEqual(bootstrap);
	});
});
