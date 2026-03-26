/** Shared JSON response helper for webhook httpAction handlers. */
export function jsonResponse(
	data: Record<string, unknown>,
	status = 200
): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
