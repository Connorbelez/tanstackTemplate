"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2, Variable } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { SystemPathBrowser } from "#/components/document-engine/system-path-browser";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { formatValue } from "#/lib/document-engine/formatting";
import type { VariableType } from "#/lib/document-engine/types";
import { api } from "../../../convex/_generated/api";

const VARIABLE_TYPES: { label: string; value: VariableType }[] = [
	{ label: "String", value: "string" },
	{ label: "Currency", value: "currency" },
	{ label: "Date", value: "date" },
	{ label: "Percentage", value: "percentage" },
	{ label: "Integer", value: "integer" },
	{ label: "Boolean", value: "boolean" },
];

const SAMPLE_VALUES: Record<VariableType, string> = {
	boolean: "true",
	currency: "250000",
	date: "2026-03-11",
	integer: "360",
	percentage: "5.75",
	string: "John Doe",
};

export function DocumentEngineVariablesPage() {
	const variables = useQuery(api.documentEngine.systemVariables.list);
	const createVariable = useMutation(api.documentEngine.systemVariables.create);
	const removeVariable = useMutation(api.documentEngine.systemVariables.remove);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [key, setKey] = useState("");
	const [label, setLabel] = useState("");
	const [type, setType] = useState<VariableType>("string");
	const [description, setDescription] = useState("");
	const [systemPath, setSystemPath] = useState("");

	const handleCreate = useCallback(async () => {
		try {
			await createVariable({
				description: description.trim() || undefined,
				key: key.trim(),
				label: label.trim(),
				systemPath: systemPath.trim() || undefined,
				type,
			});
			setDialogOpen(false);
			setKey("");
			setLabel("");
			setType("string");
			setDescription("");
			setSystemPath("");
			toast.success("Variable created");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create variable"
			);
		}
	}, [createVariable, description, key, label, systemPath, type]);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-semibold text-lg">System Variables</h2>
					<p className="text-muted-foreground text-sm">
						Define variables that can be interpolated into document templates.
					</p>
				</div>
				<Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="mr-2 size-4" />
							Add Variable
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create System Variable</DialogTitle>
						</DialogHeader>
						<div className="space-y-4">
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="var-key"
								>
									Key (snake_case)
								</label>
								<Input
									id="var-key"
									onChange={(event) => setKey(event.target.value)}
									placeholder="e.g. loan_amount"
									value={key}
								/>
							</div>
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="var-label"
								>
									Label
								</label>
								<Input
									id="var-label"
									onChange={(event) => setLabel(event.target.value)}
									placeholder="e.g. Loan Amount"
									value={label}
								/>
							</div>
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="var-type"
								>
									Type
								</label>
								<Select
									onValueChange={(value) => setType(value as VariableType)}
									value={type}
								>
									<SelectTrigger id="var-type">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{VARIABLE_TYPES.map((variableType) => (
											<SelectItem
												key={variableType.value}
												value={variableType.value}
											>
												{variableType.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<label
									className="mb-1 block font-medium text-sm"
									htmlFor="var-desc"
								>
									Description (optional)
								</label>
								<Textarea
									id="var-desc"
									onChange={(event) => setDescription(event.target.value)}
									placeholder="What this variable represents..."
									value={description}
								/>
							</div>
							<SystemPathBrowser
								onValueChange={setSystemPath}
								value={systemPath}
							/>
							<div className="rounded-md border bg-muted/50 p-3">
								<p className="mb-1 font-medium text-muted-foreground text-xs">
									Preview
								</p>
								<p className="font-mono text-sm">
									{formatValue(SAMPLE_VALUES[type], type)}
								</p>
							</div>
							<Button
								className="w-full"
								disabled={!(key.trim() && label.trim())}
								onClick={handleCreate}
							>
								Create Variable
							</Button>
						</div>
					</DialogContent>
				</Dialog>
			</div>

			{variables && variables.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12">
						<Variable className="mb-4 size-12 text-muted-foreground" />
						<p className="text-muted-foreground">
							No variables defined yet. Add one to get started.
						</p>
					</CardContent>
				</Card>
			) : null}

			{variables && variables.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							All Variables ({variables.length})
						</CardTitle>
						<CardDescription>
							Variables are referenced in templates using {"{{variable_key}}"}{" "}
							syntax.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="divide-y">
							{variables.map((variable) => (
								<div
									className="flex items-center gap-4 py-3"
									key={variable._id}
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<code className="font-mono text-sm">{variable.key}</code>
											<Badge variant="secondary">{variable.type}</Badge>
										</div>
										<p className="font-medium text-sm">{variable.label}</p>
										{variable.description ? (
											<p className="text-muted-foreground text-xs">
												{variable.description}
											</p>
										) : null}
										{variable.systemPath ? (
											<p className="font-mono text-muted-foreground text-xs">
												{variable.systemPath}
											</p>
										) : null}
									</div>
									<div className="text-right">
										<p className="mb-1 font-mono text-muted-foreground text-xs">
											{formatValue(
												SAMPLE_VALUES[variable.type as VariableType],
												variable.type as VariableType,
												variable.formatOptions ?? undefined
											)}
										</p>
										<Button
											onClick={() => removeVariable({ id: variable._id })}
											size="icon"
											variant="ghost"
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
