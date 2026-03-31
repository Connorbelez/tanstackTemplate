/**
 * Link Types & Record Linking tests — scaffolded and skipped.
 *
 * ENG-257 (Link Types & Record Linking) has not been implemented yet.
 * These tests are scaffolded and skipped until the backend exists.
 * Un-skip when linkTypes.ts, recordLinks.ts, and linkQueries.ts are created.
 */
import { describe, it } from "vitest";

describe.skip("Link Types CRUD", () => {
	it("creates link type with one_to_one cardinality", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("creates link type with one_to_many cardinality", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("creates link type with many_to_many cardinality", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("deactivation blocked when active links exist", () => {
		// Placeholder test kept while the suite remains skipped.
	});
});

describe.skip("createLink validation (fail-fast order)", () => {
	it("rejects wrong source/target objectDefId (type match)", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("rejects cross-org link (different org sources)", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("rejects duplicate link (same source+target+type)", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("rejects one_to_one when existing link exists (cardinality)", () => {
		// Placeholder test kept while the suite remains skipped.
	});
});

describe.skip("Bidirectional queries", () => {
	it("outbound links returned correctly", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("inbound links returned correctly", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("direction=both returns both", () => {
		// Placeholder test kept while the suite remains skipped.
	});
});

describe.skip("Polymorphic links", () => {
	it("links EAV record to EAV record", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("links EAV record to native entity (UC-95)", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("bidirectional query from native entity returns EAV record", () => {
		// Placeholder test kept while the suite remains skipped.
	});
});

describe.skip("Soft-delete", () => {
	it("deleted link not returned in queries", () => {
		// Placeholder test kept while the suite remains skipped.
	});
	it("deleted link does not block duplicate detection", () => {
		// Placeholder test kept while the suite remains skipped.
	});
});
