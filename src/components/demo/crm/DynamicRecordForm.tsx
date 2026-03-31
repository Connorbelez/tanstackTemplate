import { useMutation, useQuery } from "convex/react";
import { DatabaseZap, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FieldInputBlock } from "./FieldInput";
import { extractCrmErrorMessage } from "./utils";

interface DynamicRecordFormProps {
	objectDefId?: Id<"objectDefs">;
	objectLabel?: string;
	onRecordCreated?: () => void;
}

function sanitizeRecordValues(
	activeFields: Array<{
		fieldType: string;
		name: string;
	}>,
	values: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		activeFields.flatMap((field) => {
			const rawValue = values[field.name];
			if (rawValue === undefined) {
				return [];
			}

			if (field.fieldType === "multi_select") {
				const nextValue = Array.isArray(rawValue)
					? rawValue.filter((item): item is string => typeof item === "string")
					: [];
				return nextValue.length > 0 ? [[field.name, nextValue]] : [];
			}

			if (typeof rawValue === "string") {
				const trimmed = rawValue.trim();
				return trimmed ? [[field.name, trimmed]] : [];
			}

			// Filter NaN for numeric fields (defensive — backend rejects NaN)
			if (typeof rawValue === "number" && Number.isNaN(rawValue)) {
				return [];
			}

			return [[field.name, rawValue]];
		})
	);
}

export function DynamicRecordForm({
	objectDefId,
	objectLabel,
	onRecordCreated,
}: DynamicRecordFormProps) {
	const fields = useQuery(
		api.crm.fieldDefs.listFields,
		objectDefId ? { objectDefId } : "skip"
	);
	const createRecord = useMutation(api.crm.records.createRecord);
	const [values, setValues] = useState<Record<string, unknown>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);

	const activeFields = useMemo(() => fields ?? [], [fields]);

	async function handleSubmit() {
		if (!objectDefId) {
			return;
		}

		setIsSubmitting(true);
		try {
			const cleanedValues = sanitizeRecordValues(activeFields, values);

			await createRecord({
				objectDefId,
				values: cleanedValues,
			});

			setValues({});
			toast.success(`Added ${objectLabel ?? "record"} to the sandbox.`);
			onRecordCreated?.();
		} catch (error) {
			toast.error(extractCrmErrorMessage(error));
		} finally {
			setIsSubmitting(false);
		}
	}

	if (!objectDefId) {
		return (
			<Card className="border-border/70 shadow-sm">
				<CardHeader>
					<CardTitle className="text-lg">Record composer</CardTitle>
					<CardDescription>
						Choose or create an object to generate a form from live field
						metadata.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card className="border-border/70 shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<DatabaseZap className="size-4" />
					Record composer
				</CardTitle>
				<CardDescription>
					This form is generated from `fieldDefs.listFields` and submits
					directly to `crm.records.createRecord`.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{fields === undefined ? (
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<LoaderCircle className="size-4 animate-spin" />
						Loading field definitions...
					</div>
				) : null}

				{activeFields.length > 0 ? (
					<div className="grid gap-4">
						{activeFields.map((field) => (
							<FieldInputBlock
								field={field}
								key={field._id}
								onChange={(nextValue) =>
									setValues((current) => ({
										...current,
										[field.name]: nextValue,
									}))
								}
								value={values[field.name]}
							/>
						))}
					</div>
				) : null}

				<div className="flex justify-end">
					<Button
						disabled={isSubmitting || activeFields.length === 0}
						onClick={handleSubmit}
					>
						Create record
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
