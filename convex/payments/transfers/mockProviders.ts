/**
 * Shared gating for transfer mock providers.
 *
 * Mock providers are disabled by default and only enabled when the caller
 * explicitly opts in via `ENABLE_MOCK_PROVIDERS="true"`.
 */

export function areMockTransferProvidersEnabled(): boolean {
	return process.env.ENABLE_MOCK_PROVIDERS === "true";
}
