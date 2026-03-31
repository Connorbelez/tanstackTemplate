import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { fromDateInputValue, toDateInputValue } from "./utils";

interface FieldInputProps {
	field: Doc<"fieldDefs">;
	onChange: (value: unknown) => void;
	value: unknown;
}

export function FieldInput({ field, value, onChange }: FieldInputProps) {
	switch (field.fieldType) {
		case "text":
		case "email":
		case "phone":
		case "url":
		case "user_ref":
			return (
				<Input
					onChange={(event) => onChange(event.target.value || undefined)}
					placeholder={field.description ?? field.label}
					type={field.fieldType === "user_ref" ? "text" : field.fieldType}
					value={typeof value === "string" ? value : ""}
				/>
			);

		case "rich_text":
			return (
				<Textarea
					onChange={(event) => onChange(event.target.value || undefined)}
					placeholder={field.description ?? field.label}
					value={typeof value === "string" ? value : ""}
				/>
			);

		case "number":
		case "currency":
		case "percentage":
			return (
				<Input
					onChange={(event) => {
						const nextValue = event.target.value;
						onChange(nextValue === "" ? undefined : Number(nextValue));
					}}
					placeholder={field.description ?? field.label}
					step="0.01"
					type="number"
					value={typeof value === "number" ? value : ""}
				/>
			);

		case "boolean":
			return (
				<div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
					<div>
						<p className="font-medium text-sm">{field.label}</p>
						<p className="text-muted-foreground text-xs">
							Unchecked values remain omitted until you change them.
						</p>
					</div>
					<Switch
						checked={value === true}
						onCheckedChange={(checked) => onChange(checked)}
					/>
				</div>
			);

		case "date":
		case "datetime":
			return (
				<Input
					onChange={(event) =>
						onChange(fromDateInputValue(field.fieldType, event.target.value))
					}
					type={field.fieldType === "datetime" ? "datetime-local" : "date"}
					value={toDateInputValue(field.fieldType, value)}
				/>
			);

		case "select":
			return (
				<Select
					onValueChange={(nextValue) => onChange(nextValue || undefined)}
					value={typeof value === "string" ? value : ""}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
					</SelectTrigger>
					<SelectContent>
						{field.options?.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			);

		case "multi_select": {
			const currentValues = Array.isArray(value)
				? value.filter((item): item is string => typeof item === "string")
				: [];

			return (
				<div className="grid gap-2 rounded-xl border border-border/70 bg-muted/20 p-3">
					{field.options?.map((option) => {
						const checked = currentValues.includes(option.value);
						return (
							<div
								className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/70 px-3 py-2"
								key={option.value}
							>
								<Checkbox
									checked={checked}
									id={`${field._id}-${option.value}`}
									onCheckedChange={(nextChecked) => {
										if (nextChecked) {
											onChange([...currentValues, option.value]);
											return;
										}

										onChange(
											currentValues.filter((item) => item !== option.value)
										);
									}}
								/>
								<div>
									<Label
										className="font-medium text-sm"
										htmlFor={`${field._id}-${option.value}`}
									>
										{option.label}
									</Label>
									<p className="text-muted-foreground text-xs">
										{option.value}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			);
		}

		default: {
			const exhaustiveCheck: never = field.fieldType;
			return (
				<p className="text-sm">Unsupported field type: {exhaustiveCheck}</p>
			);
		}
	}
}

export function FieldInputBlock({ field, onChange, value }: FieldInputProps) {
	return (
		<div className="space-y-2 rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
			<div className="space-y-1">
				<div className="flex items-center gap-2">
					<Label>{field.label}</Label>
					{field.isRequired ? (
						<span className="text-destructive text-xs">*</span>
					) : null}
				</div>
				<p className="text-muted-foreground text-xs">
					{field.description || `${field.fieldType} field`}
				</p>
			</div>
			<FieldInput field={field} onChange={onChange} value={value} />
		</div>
	);
}
