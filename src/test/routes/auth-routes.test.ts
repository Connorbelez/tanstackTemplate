import { describe, expect, it } from "vitest";
import {
	buildSignInRedirect,
	buildSignUpRedirect,
	getReturnPathname,
	sanitizeRedirectPath,
} from "#/lib/auth-redirect";

describe("auth redirect helpers", () => {
	describe("sanitizeRedirectPath", () => {
		it("keeps safe internal redirects including search and hash", () => {
			expect(sanitizeRedirectPath("/admin?tab=users#members")).toBe(
				"/admin?tab=users#members"
			);
		});

		it("rejects absolute URLs", () => {
			expect(
				sanitizeRedirectPath("https://evil.example/phish")
			).toBeUndefined();
		});

		it("rejects scheme-relative redirects", () => {
			expect(sanitizeRedirectPath("//evil.example/phish")).toBeUndefined();
		});
	});

	describe("getReturnPathname", () => {
		it("falls back to the homepage when the redirect is invalid", () => {
			expect(getReturnPathname("https://evil.example/phish")).toBe("/");
		});
	});

	describe("buildSignInRedirect", () => {
		it("builds a sign-in redirect using the redirect search key", () => {
			expect(buildSignInRedirect("/broker?view=pipeline")).toEqual({
				to: "/sign-in",
				search: { redirect: "/broker?view=pipeline" },
			});
		});
	});

	describe("buildSignUpRedirect", () => {
		it("builds a sign-up redirect using the redirect search key", () => {
			expect(buildSignUpRedirect("/borrower#documents")).toEqual({
				to: "/sign-up",
				search: { redirect: "/borrower#documents" },
			});
		});
	});
});
