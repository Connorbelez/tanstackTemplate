/**
 * URL search state for the admin detail sheet.
 * Declared on `/admin` so all child routes inherit typed `detailOpen` + `recordId`.
 */
export interface AdminDetailSearch {
	readonly detailOpen: boolean;
	readonly entityType: string | undefined;
	readonly recordId: string | undefined;
}

/**
 * TanStack Router may serialize string search values as JSON (e.g. `0` → `"0"` in the query),
 * which decodes to a string that includes literal quote characters. Normalize back to the plain value.
 */
function parseRecordIdParam(value: unknown): string | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return undefined;
	}

	if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (typeof parsed === "string") {
				return parsed.length > 0 ? parsed : undefined;
			}
			if (typeof parsed === "number" && Number.isFinite(parsed)) {
				return String(parsed);
			}
		} catch {
			return trimmed.slice(1, -1);
		}
	}

	return trimmed;
}

function parseBooleanParam(value: unknown): boolean {
	if (value === true) {
		return true;
	}
	if (value === false || value === null || value === undefined) {
		return false;
	}
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		return normalized === "true" || normalized === "1" || normalized === "yes";
	}
	if (typeof value === "number") {
		return value === 1;
	}
	return false;
}

/**
 * Validates raw search params into {@link AdminDetailSearch}.
 * Safe for malformed URLs: never throws.
 */
export function parseAdminDetailSearch(
	raw: Record<string, unknown>
): AdminDetailSearch {
	const recordId = parseRecordIdParam(raw.recordId);

	return {
		detailOpen: parseBooleanParam(raw.detailOpen),
		entityType: raw.entityType as string | undefined,
		recordId,
	};
}
