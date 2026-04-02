import { useMutation } from "convex/react";
import { Check, LoaderCircle, PencilLine, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { renderFieldValue } from "./cell-renderers";
import { FieldInput } from "./FieldInput";
import { extractCrmErrorMessage } from "./utils";

interface RecordFieldDisplayProps {
	field: Doc<"fieldDefs">;
	isReadOnly?: boolean;
	onUpdated?: () => void;
	recordId: string;
	value: unknown;
}

function sanitizeValue(field: Doc<"fieldDefs">, value: unknown) {
	if (value === undefined) {
		return undefined;
	}

	if (field.fieldType === "multi_select") {
		return Array.isArray(value)
			? value.filter((item): item is string => typeof item === "string")
			: [];
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	return value;
}

export function RecordFieldDisplay({
	field,
	isReadOnly = false,
	onUpdated,
	recordId,
	value,
}: RecordFieldDisplayProps) {
	const updateRecord = useMutation(api.crm.records.updateRecord);
	const [isEditing, setIsEditing] = useState(false);
	const [draftValue, setDraftValue] = useState<unknown>(value);
	const [isSaving, setIsSaving] = useState(false);

	const renderedValue = useMemo(
		() => renderFieldValue(field, value),
		[field, value]
	);

	async function handleSave() {
		setIsSaving(true);
		try {
			await updateRecord({
				recordId: recordId as Id<"records">,
				values: {
					[field.name]: sanitizeValue(field, draftValue),
				},
			});
			toast.success(`Updated ${field.label}.`);
			setIsEditing(false);
			onUpdated?.();
		} catch (error) {
			toast.error(extractCrmErrorMessage(error));
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<Label>{field.label}</Label>
						{field.isRequired ? (
							<span className="text-destructive text-xs">*</span>
						) : null}
					</div>
					<p className="text-muted-foreground text-xs">
						{field.description || field.name}
					</p>
				</div>

				{isReadOnly ? null : (
					<div className="flex items-center gap-1">
						{isEditing ? (
							<>
								<Button
									aria-label={
										isSaving ? `Saving ${field.label}` : `Save ${field.label}`
									}
									disabled={isSaving}
									onClick={handleSave}
									size="icon-xs"
									title={
										isSaving ? `Saving ${field.label}` : `Save ${field.label}`
									}
									variant="outline"
								>
									{isSaving ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : (
										<Check className="size-3" />
									)}
								</Button>
								<Button
									aria-label={`Cancel editing ${field.label}`}
									disabled={isSaving}
									onClick={() => {
										setDraftValue(value);
										setIsEditing(false);
									}}
									size="icon-xs"
									title={`Cancel editing ${field.label}`}
									variant="ghost"
								>
									<X className="size-3" />
								</Button>
							</>
						) : (
							<Button
								aria-label={`Edit ${field.label}`}
								onClick={() => {
									setDraftValue(value);
									setIsEditing(true);
								}}
								size="icon-xs"
								title={`Edit ${field.label}`}
								variant="ghost"
							>
								<PencilLine className="size-3" />
							</Button>
						)}
					</div>
				)}
			</div>

			<div className="mt-3">
				{isEditing ? (
					<FieldInput
						field={field}
						onChange={setDraftValue}
						value={draftValue}
					/>
				) : (
					<div className="text-sm">{renderedValue}</div>
				)}
			</div>
		</div>
	);
}
