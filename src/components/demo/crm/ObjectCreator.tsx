import { useAction } from "convex/react";
import { Boxes, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FieldDefEditor } from "./FieldDefEditor";
import { demoCrmCreateSandboxObject } from "./functionRefs";
import {
	createFieldDraft,
	extractCrmErrorMessage,
	slugifyCrmName,
} from "./utils";

interface ObjectCreatorProps {
	onCreated: (payload: {
		objectDefId: Id<"objectDefs">;
		viewDefId?: Id<"viewDefs">;
	}) => void;
}

const DEFAULT_ICON = "database";

export function ObjectCreator({ onCreated }: ObjectCreatorProps) {
	const createSandboxObject = useAction(demoCrmCreateSandboxObject);
	const [singularLabel, setSingularLabel] = useState("");
	const [pluralLabel, setPluralLabel] = useState("");
	const [icon, setIcon] = useState(DEFAULT_ICON);
	const [description, setDescription] = useState("");
	const [fields, setFields] = useState([createFieldDraft()]);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const baseName = useMemo(
		() => slugifyCrmName(singularLabel || pluralLabel),
		[pluralLabel, singularLabel]
	);

	async function handleSubmit() {
		if (!(singularLabel.trim() && pluralLabel.trim())) {
			toast.error("Add singular and plural labels before creating the object.");
			return;
		}

		if (!baseName) {
			toast.error("The generated API name is empty. Adjust the object labels.");
			return;
		}

		if (
			fields.some(
				(field) =>
					!(field.label.trim() && field.name.trim()) ||
					((field.fieldType === "select" ||
						field.fieldType === "multi_select") &&
						field.options.length === 0)
			)
		) {
			toast.error("Complete each field definition before saving the object.");
			return;
		}

		setIsSubmitting(true);
		try {
			const result = await createSandboxObject({
				baseName,
				description: description.trim() || undefined,
				fields: fields.map((field) => ({
					description: field.description.trim() || undefined,
					fieldType: field.fieldType,
					isRequired: field.isRequired,
					isUnique: field.isUnique,
					label: field.label.trim(),
					name: field.name.trim(),
					options:
						field.fieldType === "select" || field.fieldType === "multi_select"
							? field.options.map((option, index) => ({
									color: option.color,
									label: option.label.trim(),
									order: index,
									value: option.value.trim(),
								}))
							: undefined,
				})),
				icon: icon.trim() || DEFAULT_ICON,
				pluralLabel: pluralLabel.trim(),
				singularLabel: singularLabel.trim(),
			});

			toast.success(
				`Created ${singularLabel.trim()} with ${fields.length} fields.`
			);
			setSingularLabel("");
			setPluralLabel("");
			setIcon(DEFAULT_ICON);
			setDescription("");
			setFields([createFieldDraft()]);
			onCreated({
				objectDefId: result.objectDefId,
				viewDefId: result.demoViewId,
			});
		} catch (error) {
			toast.error(extractCrmErrorMessage(error));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Card className="border-border/70 shadow-sm">
			<CardHeader>
				<div className="flex items-center justify-between gap-3">
					<div>
						<CardTitle className="flex items-center gap-2 text-lg">
							<WandSparkles className="size-4" />
							Object studio
						</CardTitle>
						<CardDescription>
							Compose an object schema, then bootstrap it through a single demo
							action that fans into the real CRM APIs.
						</CardDescription>
					</div>
					<Badge variant="secondary">Chunk 02</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="crm-singular-label">Singular label</Label>
						<Input
							id="crm-singular-label"
							onChange={(event) => setSingularLabel(event.target.value)}
							placeholder="Opportunity"
							value={singularLabel}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="crm-plural-label">Plural label</Label>
						<Input
							id="crm-plural-label"
							onChange={(event) => setPluralLabel(event.target.value)}
							placeholder="Opportunities"
							value={pluralLabel}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="crm-icon">Icon name</Label>
						<Input
							id="crm-icon"
							onChange={(event) => setIcon(event.target.value)}
							placeholder="briefcase"
							value={icon}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="crm-base-name">Generated API name</Label>
						<Input
							disabled
							id="crm-base-name"
							value={baseName ? `demo_${baseName}` : ""}
						/>
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="crm-description">Description</Label>
					<Textarea
						id="crm-description"
						onChange={(event) => setDescription(event.target.value)}
						placeholder="Pipeline object used to model the revenue review workflow."
						value={description}
					/>
				</div>

				<FieldDefEditor fields={fields} onChange={setFields} />

				<div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
					<div className="flex items-start gap-3">
						<div className="flex size-10 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
							<Boxes className="size-4" />
						</div>
						<div>
							<p className="font-medium text-sm">Sandbox naming convention</p>
							<p className="text-muted-foreground text-xs leading-5">
								Objects are created with a `demo_` prefix so the reset helper
								can clean the entire playground state later.
							</p>
						</div>
					</div>

					<Button disabled={isSubmitting} onClick={handleSubmit}>
						Create object
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
