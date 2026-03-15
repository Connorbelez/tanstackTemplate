import type { LinkProps } from "@tanstack/react-router";

const ABSOLUTE_URL_PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

export function sanitizeRedirectPath(input: unknown): string | undefined {
	if (typeof input !== "string" || input.length === 0) {
		return undefined;
	}

	if (ABSOLUTE_URL_PROTOCOL_PATTERN.test(input) || input.startsWith("//")) {
		return undefined;
	}

	const parsed = new URL(input, "https://fairlend.local");
	const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;

	if (!path.startsWith("/") || path.startsWith("//")) {
		return undefined;
	}

	return path;
}

export function getReturnPathname(input: unknown): string {
	return sanitizeRedirectPath(input) ?? "/";
}

export function buildSignInRedirect(
	redirectTarget: string
): Pick<LinkProps, "search" | "to"> {
	return {
		to: "/sign-in",
		search: { redirect: redirectTarget },
	};
}

export function buildSignUpRedirect(
	redirectTarget: string
): Pick<LinkProps, "search" | "to"> {
	return {
		to: "/sign-up",
		search: { redirect: redirectTarget },
	};
}
