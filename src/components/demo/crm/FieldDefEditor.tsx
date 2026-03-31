import { Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "#/components/ui/badge";
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
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";
import { SelectOptionsEditor } from "./SelectOptionsEditor";
import {
	CRM_FIELD_TYPE_OPTIONS,
	type CrmFieldDraft,
	type CrmFieldType,
} from "./schema";
import { createFieldDraft, slugifyCrmName, supportsOptions } from "./utils";

interface FieldDefEditorProps {
	fields: CrmFieldDraft[];
	onChange: (fields: CrmFieldDraft[]) => void;
}

const FIELD_TYPE_DESCRIPTIONS = new Map<CrmFieldType, string>(
	CRM_FIELD_TYPE_OPTIONS.map((item) => [item.value, item.description])
);

export function FieldDefEditor({ fields, onChange }: FieldDefEditorProps) {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="font-medium text-sm">Field builder</p>
					<p className="text-muted-foreground text-xs">
						Draft the object schema before creating the sandbox object.
					</p>
				</div>
				<Button
					onClick={() => onChange([...fields, createFieldDraft()])}
					size="sm"
					type="button"
					variant="outline"
				>
					<Plus className="size-4" />
					Add field
				</Button>
			</div>

			<div className="space-y-4">
				{fields.map((field, index) => {
					const description = FIELD_TYPE_DESCRIPTIONS.get(field.fieldType);
					const showOptions = supportsOptions(field.fieldType);

					return (
						<div
							className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm"
							key={field.id}
						>
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<Badge variant="outline">Field {index + 1}</Badge>
										<Badge variant="secondary">{field.fieldType}</Badge>
									</div>
									<p className="text-muted-foreground text-xs">{description}</p>
								</div>
								<Button
									className={cn(fields.length === 1 && "opacity-50")}
									disabled={fields.length === 1}
									onClick={() =>
										onChange(fields.filter((item) => item.id !== field.id))
									}
									size="icon"
									type="button"
									variant="ghost"
								>
									<Trash2 className="size-4" />
								</Button>
							</div>

							<div className="mt-4 grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor={`${field.id}-label`}>Field label</Label>
									<Input
										id={`${field.id}-label`}
										onChange={(event) => {
											const label = event.target.value;
											onChange(
												fields.map((item) =>
													item.id === field.id
														? {
																...item,
																label,
																name: item.name || slugifyCrmName(label),
															}
														: item
												)
											);
										}}
										placeholder="Status"
										value={field.label}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor={`${field.id}-name`}>Field API name</Label>
									<Input
										id={`${field.id}-name`}
										onChange={(event) =>
											onChange(
												fields.map((item) =>
													item.id === field.id
														? {
																...item,
																name: slugifyCrmName(event.target.value),
															}
														: item
												)
											)
										}
										placeholder="status"
										value={field.name}
									/>
								</div>

								<div className="space-y-2">
									<Label>Field type</Label>
									<Select
										onValueChange={(fieldType) =>
											onChange(
												fields.map((item) =>
													item.id === field.id
														? {
																...item,
																fieldType: fieldType as CrmFieldType,
																options: supportsOptions(
																	fieldType as CrmFieldType
																)
																	? item.options
																	: [],
															}
														: item
												)
											)
										}
										value={field.fieldType}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Choose a type" />
										</SelectTrigger>
										<SelectContent>
											{CRM_FIELD_TYPE_OPTIONS.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor={`${field.id}-description`}>Description</Label>
									<Input
										id={`${field.id}-description`}
										onChange={(event) =>
											onChange(
												fields.map((item) =>
													item.id === field.id
														? { ...item, description: event.target.value }
														: item
												)
											)
										}
										placeholder="How this field is used"
										value={field.description}
									/>
								</div>
							</div>

							<div className="mt-4 grid gap-4 rounded-2xl border border-border/60 bg-muted/20 p-4 md:grid-cols-2">
								<div className="flex items-center justify-between gap-3">
									<div>
										<Label
											className="font-medium text-sm"
											htmlFor={`${field.id}-required`}
										>
											Required
										</Label>
										<p className="text-muted-foreground text-xs">
											Records must provide a value for this field.
										</p>
									</div>
									<Switch
										checked={field.isRequired}
										id={`${field.id}-required`}
										onCheckedChange={(checked) =>
											onChange(
												fields.map((item) =>
													item.id === field.id
														? { ...item, isRequired: checked }
														: item
												)
											)
										}
									/>
								</div>

								<div className="flex items-center justify-between gap-3">
									<div>
										<Label
											className="font-medium text-sm"
											htmlFor={`${field.id}-unique`}
										>
											Unique
										</Label>
										<p className="text-muted-foreground text-xs">
											Reserved for uniqueness semantics in the schema.
										</p>
									</div>
									<Switch
										checked={field.isUnique}
										id={`${field.id}-unique`}
										onCheckedChange={(checked) =>
											onChange(
												fields.map((item) =>
													item.id === field.id
														? { ...item, isUnique: checked }
														: item
												)
											)
										}
									/>
								</div>
							</div>

							{showOptions ? (
								<div className="mt-4">
									<SelectOptionsEditor
										onChange={(options) =>
											onChange(
												fields.map((item) =>
													item.id === field.id ? { ...item, options } : item
												)
											)
										}
										options={field.options}
									/>
								</div>
							) : null}

							{field.fieldType === "rich_text" ? (
								<div className="mt-4 space-y-2">
									<Label>Preview</Label>
									<Textarea
										disabled
										placeholder="Rich text fields render as a multi-line input in the record composer."
										value=""
									/>
								</div>
							) : null}
						</div>
					);
				})}
			</div>

			<div className="flex items-center gap-2 rounded-2xl border border-primary/30 border-dashed bg-primary/5 px-4 py-3 text-muted-foreground text-sm">
				<Sparkles className="size-4 text-primary" />
				Default table views are auto-created by the CRM object API, so the
				playground only needs schema metadata here.
			</div>
		</div>
	);
}
