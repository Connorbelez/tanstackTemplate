/**
 * Link Types & Record Linking tests — scaffolded and skipped.
 *
 * ENG-257 (Link Types & Record Linking) has not been implemented yet.
 * These tests are scaffolded and skipped until the backend exists.
 * Un-skip when linkTypes.ts, recordLinks.ts, and linkQueries.ts are created.
 */
import { describe, it } from "vitest";

describe.skip("Link Types CRUD", () => {
	it("creates link type with one_to_one cardinality", () => {});
	it("creates link type with one_to_many cardinality", () => {});
	it("creates link type with many_to_many cardinality", () => {});
	it("deactivation blocked when active links exist", () => {});
});

describe.skip("createLink validation (fail-fast order)", () => {
	it("rejects wrong source/target objectDefId (type match)", () => {});
	it("rejects cross-org link (different org sources)", () => {});
	it("rejects duplicate link (same source+target+type)", () => {});
	it("rejects one_to_one when existing link exists (cardinality)", () => {});
});

describe.skip("Bidirectional queries", () => {
	it("outbound links returned correctly", () => {});
	it("inbound links returned correctly", () => {});
	it("direction=both returns both", () => {});
});

describe.skip("Polymorphic links", () => {
	it("links EAV record to EAV record", () => {});
	it("links EAV record to native entity (UC-95)", () => {});
	it("bidirectional query from native entity returns EAV record", () => {});
});

describe.skip("Soft-delete", () => {
	it("deleted link not returned in queries", () => {});
	it("deleted link does not block duplicate detection", () => {});
});
