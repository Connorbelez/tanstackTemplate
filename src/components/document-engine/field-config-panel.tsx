import { Trash2 } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import type { FieldConfig, SignableType } from "#/lib/document-engine/types";
import { VariablePicker } from "./variable-picker";

interface FieldConfigPanelProps {
	availableRoles: Array<{ value: string; label: string }>;
	field: FieldConfig | null;
	onDelete: (fieldId: string) => void;
	onUpdate: (field: FieldConfig) => void;
}

const SIGNABLE_TYPES: { value: SignableType; label: string }[] = [
	{ value: "SIGNATURE", label: "Signature" },
	{ value: "INITIALS", label: "Initials" },
	{ value: "NAME", label: "Name" },
	{ value: "EMAIL", label: "Email" },
	{ value: "DATE", label: "Date" },
	{ value: "TEXT", label: "Text" },
	{ value: "NUMBER", label: "Number" },
	{ value: "RADIO", label: "Radio" },
	{ value: "CHECKBOX", label: "Checkbox" },
	{ value: "DROPDOWN", label: "Dropdown" },
];

export function FieldConfigPanel({
	field,
	availableRoles,
	onUpdate,
	onDelete,
}: FieldConfigPanelProps) {
	if (!field) {
		return (
			<div className="p-4 text-center text-muted-foreground text-sm">
				<p>Select a field to edit its properties</p>
			</div>
		);
	}

	return (
		<div className="space-y-4 p-4">
			<div className="flex items-center justify-between">
				<h3 className="font-medium text-sm">
					{field.type === "interpolable" ? "Interpolable" : "Signable"} Field
				</h3>
				<Button onClick={() => onDelete(field.id)} size="icon" variant="ghost">
					<Trash2 className="size-4" />
				</Button>
			</div>

			<div>
				<label
					className="mb-1 block text-muted-foreground text-xs"
					htmlFor="field-label"
				>
					Label
				</label>
				<Input
					id="field-label"
					onChange={(e) => onUpdate({ ...field, label: e.target.value })}
					placeholder="Field label"
					value={field.label ?? ""}
				/>
			</div>

			{field.type === "interpolable" && (
				<div>
					<span className="mb-1 block text-muted-foreground text-xs">
						System Variable
					</span>
					<VariablePicker
						onValueChange={(key) => onUpdate({ ...field, variableKey: key })}
						value={field.variableKey}
					/>
				</div>
			)}

			{field.type === "signable" && (
				<>
					<div>
						<span className="mb-1 block text-muted-foreground text-xs">
							Signatory
						</span>
						<Select
							onValueChange={(v) =>
								onUpdate({ ...field, signatoryPlatformRole: v })
							}
							value={field.signatoryPlatformRole ?? ""}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select signatory..." />
							</SelectTrigger>
							<SelectContent>
								{availableRoles.map((role) => (
									<SelectItem key={role.value} value={role.value}>
										{role.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div>
						<span className="mb-1 block text-muted-foreground text-xs">
							Field Type
						</span>
						<Select
							onValueChange={(v) =>
								onUpdate({ ...field, signableType: v as SignableType })
							}
							value={field.signableType ?? "SIGNATURE"}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SIGNABLE_TYPES.map((t) => (
									<SelectItem key={t.value} value={t.value}>
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</>
			)}

			<div className="flex items-center gap-2">
				<Switch
					checked={field.required ?? true}
					id="field-required"
					onCheckedChange={(checked) =>
						onUpdate({ ...field, required: checked })
					}
				/>
				<label className="text-sm" htmlFor="field-required">
					Required
				</label>
			</div>

			{/* Field Meta */}
			<div className="space-y-3 border-t pt-3">
				<h4 className="font-medium text-muted-foreground text-xs">
					Field Metadata
				</h4>
				<div>
					<label
						className="mb-1 block text-muted-foreground text-xs"
						htmlFor="field-placeholder"
					>
						Placeholder
					</label>
					<Input
						id="field-placeholder"
						onChange={(e) =>
							onUpdate({
								...field,
								fieldMeta: {
									...field.fieldMeta,
									placeholder: e.target.value || undefined,
								},
							})
						}
						placeholder="Placeholder text..."
						value={field.fieldMeta?.placeholder ?? ""}
					/>
				</div>
				<div>
					<label
						className="mb-1 block text-muted-foreground text-xs"
						htmlFor="field-helptext"
					>
						Help Text
					</label>
					<Textarea
						id="field-helptext"
						onChange={(e) =>
							onUpdate({
								...field,
								fieldMeta: {
									...field.fieldMeta,
									helpText: e.target.value || undefined,
								},
							})
						}
						placeholder="Help text for signers..."
						rows={2}
						value={field.fieldMeta?.helpText ?? ""}
					/>
				</div>
				<div className="flex items-center gap-2">
					<Switch
						checked={field.fieldMeta?.readOnly ?? false}
						id="field-readonly"
						onCheckedChange={(checked) =>
							onUpdate({
								...field,
								fieldMeta: {
									...field.fieldMeta,
									readOnly: checked,
								},
							})
						}
					/>
					<label className="text-sm" htmlFor="field-readonly">
						Read-only
					</label>
				</div>
			</div>

			<div className="space-y-1 text-muted-foreground text-xs">
				<p>
					Position: ({Math.round(field.position.x)},{" "}
					{Math.round(field.position.y)})
				</p>
				<p>
					Size: {Math.round(field.position.width)} x{" "}
					{Math.round(field.position.height)}
				</p>
				<p>Page: {field.position.page + 1}</p>
			</div>
		</div>
	);
}
