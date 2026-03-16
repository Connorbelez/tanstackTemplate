const ROUTER_TEARDOWN_ERROR_PATTERN =
	/router|navigate|context|unmount|destroy/i;

export function isRouterTeardownSignOutError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);

	return ROUTER_TEARDOWN_ERROR_PATTERN.test(message);
}
