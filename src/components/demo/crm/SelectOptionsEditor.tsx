import { Plus, Trash2 } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { CRM_OPTION_COLORS, type CrmSelectOptionDraft } from "./schema";
import { slugifyCrmName } from "./utils";

interface SelectOptionsEditorProps {
	onChange: (options: CrmSelectOptionDraft[]) => void;
	options: CrmSelectOptionDraft[];
}

export function SelectOptionsEditor({
	options,
	onChange,
}: SelectOptionsEditorProps) {
	return (
		<div className="space-y-3 rounded-2xl border border-border/70 border-dashed bg-muted/25 p-4">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="font-medium text-sm">Select options</p>
					<p className="text-muted-foreground text-xs">
						Required for select and multi-select fields.
					</p>
				</div>
				<Button
					onClick={() =>
						onChange([
							...options,
							{
								color:
									CRM_OPTION_COLORS[options.length % CRM_OPTION_COLORS.length],
								id: crypto.randomUUID(),
								label: "",
								value: "",
							},
						])
					}
					size="sm"
					type="button"
					variant="outline"
				>
					<Plus className="size-4" />
					Add option
				</Button>
			</div>

			<div className="space-y-3">
				{options.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Add at least one option before saving this field.
					</p>
				) : null}

				{options.map((option, index) => (
					<div
						className="grid gap-3 rounded-xl border border-border/70 bg-background/80 p-3 md:grid-cols-[1.2fr_1.2fr_0.9fr_auto]"
						key={option.id}
					>
						<div className="space-y-2">
							<Label htmlFor={`${option.id}-label`}>Label</Label>
							<Input
								id={`${option.id}-label`}
								onChange={(event) => {
									const label = event.target.value;
									onChange(
										options.map((item) =>
											item.id === option.id
												? {
														...item,
														label,
														value: item.value || slugifyCrmName(label),
													}
												: item
										)
									);
								}}
								placeholder={`Option ${index + 1}`}
								value={option.label}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor={`${option.id}-value`}>Value</Label>
							<Input
								id={`${option.id}-value`}
								onChange={(event) => {
									const value = slugifyCrmName(event.target.value);
									onChange(
										options.map((item) =>
											item.id === option.id ? { ...item, value } : item
										)
									);
								}}
								placeholder="machine_value"
								value={option.value}
							/>
						</div>

						<div className="space-y-2">
							<Label>Color</Label>
							<Select
								onValueChange={(color) =>
									onChange(
										options.map((item) =>
											item.id === option.id ? { ...item, color } : item
										)
									)
								}
								value={option.color}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Color" />
								</SelectTrigger>
								<SelectContent>
									{CRM_OPTION_COLORS.map((color) => (
										<SelectItem key={color} value={color}>
											{color}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex items-end">
							<Button
								onClick={() =>
									onChange(options.filter((item) => item.id !== option.id))
								}
								size="icon"
								type="button"
								variant="ghost"
							>
								<Trash2 className="size-4" />
							</Button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
