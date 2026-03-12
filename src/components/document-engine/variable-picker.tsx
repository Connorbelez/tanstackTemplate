import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import type { VariableType } from "#/lib/document-engine/types";
import { api } from "../../../convex/_generated/api";

interface VariablePickerProps {
	onValueChange: (key: string) => void;
	value?: string;
}

const VARIABLE_TYPES: { value: VariableType; label: string }[] = [
	{ value: "string", label: "String" },
	{ value: "currency", label: "Currency" },
	{ value: "date", label: "Date" },
	{ value: "percentage", label: "Percentage" },
	{ value: "integer", label: "Integer" },
	{ value: "boolean", label: "Boolean" },
];

export function VariablePicker({ value, onValueChange }: VariablePickerProps) {
	const variables = useQuery(api.documentEngine.systemVariables.list);
	const createVariable = useMutation(api.documentEngine.systemVariables.create);

	const [createOpen, setCreateOpen] = useState(false);
	const [newKey, setNewKey] = useState("");
	const [newLabel, setNewLabel] = useState("");
	const [newType, setNewType] = useState<VariableType>("string");
	const [creating, setCreating] = useState(false);

	const handleCreate = useCallback(async () => {
		if (!(newKey.trim() && newLabel.trim())) {
			return;
		}
		setCreating(true);
		try {
			await createVariable({
				key: newKey.trim(),
				label: newLabel.trim(),
				type: newType,
			});
			onValueChange(newKey.trim());
			setCreateOpen(false);
			setNewKey("");
			setNewLabel("");
			setNewType("string");
		} catch {
			// Variable creation failed (e.g. duplicate key)
		} finally {
			setCreating(false);
		}
	}, [createVariable, newKey, newLabel, newType, onValueChange]);

	return (
		<div className="flex gap-1">
			<Select onValueChange={onValueChange} value={value ?? ""}>
				<SelectTrigger className="flex-1">
					<SelectValue placeholder="Select variable..." />
				</SelectTrigger>
				<SelectContent>
					{variables?.map((v) => (
						<SelectItem key={v._id} value={v.key}>
							<span className="font-mono text-xs">{v.key}</span>
							<span className="ml-2 text-muted-foreground text-xs">
								({v.type})
							</span>
						</SelectItem>
					))}
					{variables?.length === 0 && (
						<div className="px-2 py-1.5 text-muted-foreground text-sm">
							No variables defined yet
						</div>
					)}
				</SelectContent>
			</Select>
			<Popover onOpenChange={setCreateOpen} open={createOpen}>
				<PopoverTrigger asChild>
					<Button className="shrink-0" size="icon" variant="outline">
						<Plus className="size-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-64 space-y-3">
					<p className="font-medium text-sm">New Variable</p>
					<Input
						onChange={(e) => setNewKey(e.target.value)}
						placeholder="key (snake_case)"
						value={newKey}
					/>
					<Input
						onChange={(e) => setNewLabel(e.target.value)}
						placeholder="Label"
						value={newLabel}
					/>
					<Select
						onValueChange={(v) => setNewType(v as VariableType)}
						value={newType}
					>
						<SelectTrigger className="text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{VARIABLE_TYPES.map((t) => (
								<SelectItem key={t.value} value={t.value}>
									{t.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						className="w-full"
						disabled={creating || !newKey.trim() || !newLabel.trim()}
						onClick={handleCreate}
						size="sm"
					>
						Create & Select
					</Button>
				</PopoverContent>
			</Popover>
		</div>
	);
}
