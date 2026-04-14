function centsToAmount(cents: number) {
	return cents / 100;
}

const currencyFormatter = new Intl.NumberFormat("en-CA", {
	style: "currency",
	currency: "CAD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-CA");

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
	dateStyle: "medium",
	timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
	dateStyle: "medium",
});

export function formatCurrencyCents(cents: number) {
	return currencyFormatter.format(centsToAmount(cents));
}

export function formatDecimalCurrencyCents(cents: number) {
	return centsToAmount(cents).toFixed(2);
}

export function formatInteger(value: number) {
	return numberFormatter.format(value);
}

export function formatDateTime(value: number | string | null | undefined) {
	if (value === null || value === undefined) {
		return "—";
	}

	const date = typeof value === "string" ? new Date(value) : new Date(value);
	return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

export function formatDateOnly(value: number | string | null | undefined) {
	if (value === null || value === undefined) {
		return "—";
	}

	const date = typeof value === "string" ? new Date(value) : new Date(value);
	return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export function formatCompactDate(value: string) {
	return value;
}

export function humanizeLabel(value: string) {
	return value
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replaceAll("_", " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}
