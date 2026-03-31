import { cn } from "#/lib/utils";

interface FieldDiffDisplayProps {
	diff: {
		before?: Record<string, unknown>;
		after?: Record<string, unknown>;
	};
}

interface ChangedField {
	after: unknown;
	before: unknown;
	key: string;
}

const CAMEL_CASE_BOUNDARY_RE = /([a-z0-9])([A-Z])/g;
const LEADING_WORD_CHARACTER_RE = /^\w/;

export function FieldDiffDisplay({ diff }: FieldDiffDisplayProps) {
	const changedFields = getChangedFields(diff.before ?? {}, diff.after ?? {});

	if (changedFields.length === 0) {
		return null;
	}

	return (
		<div className="rounded-md border bg-muted/30 p-3">
			<div className="space-y-3">
				{changedFields.map((field) => (
					<div className="space-y-1" key={field.key}>
						<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
							{humanizeFieldName(field.key)}
						</p>
						<div className="flex items-center gap-2 text-xs">
							<span
								className={cn(
									"max-w-[45%] truncate rounded px-2 py-1",
									"bg-destructive/10 text-destructive"
								)}
								title={formatFieldValue(field.before)}
							>
								- {formatFieldValue(field.before)}
							</span>
							<span className="text-muted-foreground">→</span>
							<span
								className={cn(
									"max-w-[45%] truncate rounded px-2 py-1",
									"bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
								)}
								title={formatFieldValue(field.after)}
							>
								+ {formatFieldValue(field.after)}
							</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function getChangedFields(
	before: Record<string, unknown>,
	after: Record<string, unknown>
): ChangedField[] {
	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

	return [...keys]
		.filter((key) => !areValuesEqual(before[key], after[key]))
		.sort((left, right) => left.localeCompare(right))
		.map((key) => ({
			after: after[key],
			before: before[key],
			key,
		}));
}

function areValuesEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}

	try {
		return JSON.stringify(left) === JSON.stringify(right);
	} catch {
		return false;
	}
}

function formatFieldValue(value: unknown): string {
	if (value === null || value === undefined || value === "") {
		return "—";
	}

	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function humanizeFieldName(fieldName: string): string {
	return fieldName
		.replaceAll("_", " ")
		.replace(CAMEL_CASE_BOUNDARY_RE, "$1 $2")
		.replace(LEADING_WORD_CHARACTER_RE, (value) => value.toUpperCase());
}
