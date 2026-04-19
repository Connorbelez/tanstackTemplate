import { createOriginationDraftId } from "#/lib/admin-origination";

const ORIGINATION_BOOTSTRAP_STORAGE_KEY = "admin-origination-bootstrap";

interface OriginationBootstrapState {
	caseId?: string;
	token: string;
}

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function resolveStorage(storage?: StorageLike) {
	if (storage) {
		return storage;
	}

	if (typeof window === "undefined") {
		return null;
	}

	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function parseOriginationBootstrapState(
	value: string | null
): OriginationBootstrapState | undefined {
	if (!value) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(value) as Partial<OriginationBootstrapState>;
		if (typeof parsed?.token !== "string" || parsed.token.length === 0) {
			return undefined;
		}

		if (
			parsed.caseId !== undefined &&
			(typeof parsed.caseId !== "string" || parsed.caseId.length === 0)
		) {
			return undefined;
		}

		return {
			caseId: parsed.caseId,
			token: parsed.token,
		};
	} catch {
		return undefined;
	}
}

function writeOriginationBootstrapState(
	state: OriginationBootstrapState | undefined,
	storage?: StorageLike
) {
	const resolvedStorage = resolveStorage(storage);
	if (!resolvedStorage) {
		return;
	}

	if (!state) {
		resolvedStorage.removeItem(ORIGINATION_BOOTSTRAP_STORAGE_KEY);
		return;
	}

	resolvedStorage.setItem(
		ORIGINATION_BOOTSTRAP_STORAGE_KEY,
		JSON.stringify(state)
	);
}

export function peekOriginationBootstrapState(storage?: StorageLike) {
	const resolvedStorage = resolveStorage(storage);
	if (!resolvedStorage) {
		return undefined;
	}

	const parsed = parseOriginationBootstrapState(
		resolvedStorage.getItem(ORIGINATION_BOOTSTRAP_STORAGE_KEY)
	);
	if (!parsed) {
		resolvedStorage.removeItem(ORIGINATION_BOOTSTRAP_STORAGE_KEY);
	}

	return parsed;
}

export function reserveOriginationBootstrapState(storage?: StorageLike) {
	const existing = peekOriginationBootstrapState(storage);
	if (existing) {
		return existing;
	}

	const next = {
		token: createOriginationDraftId("origination-bootstrap"),
	};
	writeOriginationBootstrapState(next, storage);
	return next;
}

export function registerOriginationBootstrapCase(
	token: string,
	caseId: string,
	storage?: StorageLike
) {
	const current = peekOriginationBootstrapState(storage);
	if (!current || current.token !== token) {
		return;
	}

	writeOriginationBootstrapState(
		{
			...current,
			caseId,
		},
		storage
	);
}

export function releaseOriginationBootstrapForCase(
	caseId: string,
	storage?: StorageLike
) {
	const current = peekOriginationBootstrapState(storage);
	if (!current || current.caseId !== caseId) {
		return;
	}

	writeOriginationBootstrapState(undefined, storage);
}
