// ---------------------------------------------------------------------------
// Error classification, reference IDs, and diagnostic context.
//
// Shared module — usable from UI components, API handlers, and logging.
// Extend `classifyError` with app-specific error types as the product grows.
// ---------------------------------------------------------------------------

// Top-level regex constants (Biome: useTopLevelRegex)
const RE_FETCH = /fetch|network|failed to fetch/i;
const RE_NETWORK_CODE = /ERR_NETWORK|ERR_INTERNET|ECONNREFUSED|ETIMEDOUT/i;
const RE_AUTH_UNAUTHED =
	/unauthorized|unauthenticated|session expired|not authenticated|sign.?in/i;
const RE_AUTH_FORBIDDEN =
	/forbidden|not allowed|permission denied|access denied|insufficient/i;
const RE_NOT_FOUND = /not found|404|does not exist|no such/i;
const RE_VALIDATION =
	/validation|invalid|malformed|bad request|argument|required field/i;
const RE_RATE_LIMIT = /rate.?limit|too many requests|throttle/i;
const RE_SERVER = /internal server|server error|500|503|unavailable/i;
const RE_STACK_FRAME = /at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?/;

export type ErrorCategory =
	| "network"
	| "auth"
	| "not-found"
	| "validation"
	| "rate-limit"
	| "server"
	| "unknown";

interface ClassifiedError {
	category: ErrorCategory;
	/** User-facing description — empathetic, actionable */
	description: string;
	/** User-facing headline */
	title: string;
}

const CLASSIFICATIONS: {
	test: (error: Error) => boolean;
	category: ErrorCategory;
	title: string;
	description: string;
}[] = [
	// ── Network / connectivity ───────────────────────────────────────────
	{
		test: (e) =>
			(e.name === "TypeError" && RE_FETCH.test(e.message)) ||
			e.message === "Load failed" ||
			RE_NETWORK_CODE.test(e.message) ||
			(typeof navigator !== "undefined" && !navigator.onLine),
		category: "network",
		title: "Connection issue",
		description:
			"We couldn't reach the server. Check your internet connection and try again.",
	},

	// ── Authentication / authorization ───────────────────────────────────
	{
		test: (e) => RE_AUTH_UNAUTHED.test(e.message) || hasStatusCode(e, 401),
		category: "auth",
		title: "Session expired",
		description: "Your session has ended. Please sign in again to continue.",
	},
	{
		test: (e) => RE_AUTH_FORBIDDEN.test(e.message) || hasStatusCode(e, 403),
		category: "auth",
		title: "Access denied",
		description:
			"You don't have permission to access this resource. Contact your administrator if you believe this is a mistake.",
	},

	// ── Not found ────────────────────────────────────────────────────────
	{
		test: (e) => RE_NOT_FOUND.test(e.message) || hasStatusCode(e, 404),
		category: "not-found",
		title: "Not found",
		description:
			"The page or resource you're looking for doesn't exist or has been moved.",
	},

	// ── Validation ───────────────────────────────────────────────────────
	{
		test: (e) =>
			RE_VALIDATION.test(e.message) ||
			hasStatusCode(e, 400) ||
			hasStatusCode(e, 422),
		category: "validation",
		title: "Invalid request",
		description:
			"Something about that request wasn't quite right. Please review your input and try again.",
	},

	// ── Rate limiting ────────────────────────────────────────────────────
	{
		test: (e) => RE_RATE_LIMIT.test(e.message) || hasStatusCode(e, 429),
		category: "rate-limit",
		title: "Slow down",
		description: "You've made too many requests. Wait a moment and try again.",
	},

	// ── Server / internal ────────────────────────────────────────────────
	{
		test: (e) =>
			RE_SERVER.test(e.message) ||
			hasStatusCode(e, 500) ||
			hasStatusCode(e, 502) ||
			hasStatusCode(e, 503),
		category: "server",
		title: "Server error",
		description:
			"Something went wrong on our end. We've been notified and are looking into it.",
	},
];

/**
 * Classify an error into a user-friendly category with appropriate messaging.
 * Returns structured data — the UI component decides how to render it.
 */
export function classifyError(error: Error): ClassifiedError {
	for (const rule of CLASSIFICATIONS) {
		if (rule.test(error)) {
			return {
				category: rule.category,
				title: rule.title,
				description: rule.description,
			};
		}
	}

	return {
		category: "unknown",
		title: "Something went wrong",
		description:
			"We hit an unexpected snag. Our team has been notified and is looking into it.",
	};
}

// ---------------------------------------------------------------------------
// Error reference ID — short, human-readable, unique-enough for support refs
// ---------------------------------------------------------------------------

export function generateErrorId(): string {
	const ts = Date.now().toString(36);
	const rand = Math.random().toString(36).substring(2, 6);
	return `ERR-${ts}-${rand}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Stack trace parsing (dev mode diagnostics)
// ---------------------------------------------------------------------------

export interface StackFrame {
	col: string | null;
	file: string | null;
	fn: string | null;
	line: string | null;
	raw: string;
}

export function parseStack(stack: string | undefined): StackFrame[] {
	if (!stack) {
		return [];
	}

	return stack
		.split("\n")
		.filter((line) => line.trim().startsWith("at "))
		.map((raw) => {
			const match = raw.match(RE_STACK_FRAME);
			if (!match) {
				return { raw: raw.trim(), fn: null, file: null, line: null, col: null };
			}
			return {
				raw: raw.trim(),
				fn: match[1] || "<anonymous>",
				file: match[2] || null,
				line: match[3] || null,
				col: match[4] || null,
			};
		});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if an error carries an HTTP-style status code (common in fetch wrappers, Convex errors). */
function hasStatusCode(error: Error, code: number): boolean {
	const e = error as Error & {
		status?: number;
		statusCode?: number;
		code?: number;
	};
	return e.status === code || e.statusCode === code || e.code === code;
}
