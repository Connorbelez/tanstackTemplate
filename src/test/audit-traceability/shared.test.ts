import { describe, expect, it } from "vitest";
import { statusVariant } from "#/components/audit-traceability/shared";

describe("statusVariant", () => {
	it("returns 'default' for PASS", () => {
		expect(statusVariant("PASS")).toBe("default");
	});

	it("returns 'secondary' for WARN", () => {
		expect(statusVariant("WARN")).toBe("secondary");
	});

	it("returns 'destructive' for FAIL", () => {
		expect(statusVariant("FAIL")).toBe("destructive");
	});

	it("returns 'outline' for INFO", () => {
		expect(statusVariant("INFO")).toBe("outline");
	});
});

describe("PageBadge action parsing", () => {
	// Test the logic that PageBadge uses: action.replace("audit.viewed.", "")
	const parseAction = (action: string) => action.replace("audit.viewed.", "");

	it("extracts page name from audit.viewed prefix", () => {
		expect(parseAction("audit.viewed.hash-chain")).toBe("hash-chain");
		expect(parseAction("audit.viewed.pipeline")).toBe("pipeline");
		expect(parseAction("audit.viewed.audit-trail")).toBe("audit-trail");
		expect(parseAction("audit.viewed.export")).toBe("export");
	});

	it("returns full string when prefix is absent", () => {
		expect(parseAction("some.other.action")).toBe("some.other.action");
	});
});
