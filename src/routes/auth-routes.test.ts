import { describe, expect, it, vi } from "vitest";
import {
	buildSignInRedirect,
	buildSignUpRedirect,
	getReturnPathname,
} from "./-auth-redirect";

describe("shared auth routes", () => {
	it("keeps only safe in-app return paths", () => {
		expect(getReturnPathname("/demo/workos")).toBe("/demo/workos");
		expect(getReturnPathname("https://evil.example.com")).toBeUndefined();
		expect(getReturnPathname(undefined)).toBeUndefined();
	});

	it("builds a sign-in redirect that preserves the current pathname", async () => {
		const getSignInUrl = vi
			.fn()
			.mockResolvedValueOnce("https://auth.example.com/sign-in");

		await expect(
			buildSignInRedirect(getSignInUrl, "/demo/workos"),
		).resolves.toMatchObject({
			options: {
				href: "https://auth.example.com/sign-in",
			},
		});

		expect(getSignInUrl).toHaveBeenCalledWith({
			data: { returnPathname: "/demo/workos" },
		});
	});

	it("builds a sign-up redirect that preserves the current pathname", async () => {
		const getSignUpUrl = vi
			.fn()
			.mockResolvedValueOnce("https://auth.example.com/sign-up");

		await expect(
			buildSignUpRedirect(getSignUpUrl, "/demo/workos"),
		).resolves.toMatchObject({
			options: {
				href: "https://auth.example.com/sign-up",
			},
		});

		expect(getSignUpUrl).toHaveBeenCalledWith({
			data: { returnPathname: "/demo/workos" },
		});
	});
});
