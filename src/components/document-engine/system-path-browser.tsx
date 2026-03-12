import { useMutation, useQuery } from "convex/react";
import { Database, Plus, Search, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { ScrollArea } from "#/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { api } from "../../../convex/_generated/api";

interface SystemPathBrowserProps {
	onValueChange: (path: string) => void;
	value: string;
}

const FIELD_TYPES = ["string", "number", "boolean", "id", "object"] as const;
const WORD_BOUNDARY = /[_\s]+/;

export function SystemPathBrowser({
	value,
	onValueChange,
}: SystemPathBrowserProps) {
	const entities = useQuery(api.documentEngine.dataModelEntities.list);
	const seedEntities = useMutation(api.documentEngine.dataModelEntities.seed);
	const createCustomEntity = useMutation(
		api.documentEngine.dataModelEntities.createCustomEntity
	);

	const [open, setOpen] = useState(false);
	const [selectedEntityName, setSelectedEntityName] = useState<string | null>(
		null
	);
	const [search, setSearch] = useState("");
	const [showCustomForm, setShowCustomForm] = useState(false);

	// Custom entity form state
	const [customName, setCustomName] = useState("");
	const [customFields, setCustomFields] = useState<
		Array<{ name: string; type: string }>
	>([{ name: "", type: "string" }]);

	const selectedEntity = entities?.find((e) => e.name === selectedEntityName);

	const filteredEntities = entities?.filter((e) =>
		e.name.toLowerCase().includes(search.toLowerCase())
	);

	const handleFieldClick = useCallback(
		(entityName: string, fieldName: string) => {
			onValueChange(`${entityName}.${fieldName}`);
			setOpen(false);
		},
		[onValueChange]
	);

	const handleSeed = useCallback(async () => {
		await seedEntities();
	}, [seedEntities]);

	const handleCreateCustom = useCallback(async () => {
		const name = customName.trim();
		if (!name) {
			return;
		}

		const validFields = customFields
			.filter((f) => f.name.trim())
			.map((f) => ({
				name: f.name.trim(),
				label: f.name
					.trim()
					.split(WORD_BOUNDARY)
					.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
					.join(" "),
				type: f.type,
				optional: false,
			}));

		await createCustomEntity({
			name,
			label: name
				.split(WORD_BOUNDARY)
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(" "),
			fields: validFields,
		});

		setCustomName("");
		setCustomFields([{ name: "", type: "string" }]);
		setShowCustomForm(false);
		setSelectedEntityName(name);
	}, [createCustomEntity, customName, customFields]);

	const addCustomFieldRow = () => {
		setCustomFields((prev) => [...prev, { name: "", type: "string" }]);
	};

	const updateCustomField = (
		index: number,
		key: "name" | "type",
		val: string
	) => {
		setCustomFields((prev) =>
			prev.map((f, i) => (i === index ? { ...f, [key]: val } : f))
		);
	};

	const removeCustomFieldRow = (index: number) => {
		setCustomFields((prev) => prev.filter((_, i) => i !== index));
	};

	return (
		<div>
			<label className="mb-1 block font-medium text-sm" htmlFor="var-path">
				System Path (optional)
			</label>
			<div className="flex gap-2">
				<Input
					className="flex-1"
					id="var-path"
					onChange={(e) => onValueChange(e.target.value)}
					placeholder="e.g. loan.principal_amount"
					value={value}
				/>
				<Popover onOpenChange={setOpen} open={open}>
					<PopoverTrigger asChild>
						<Button size="icon" title="Browse data model" variant="outline">
							<Database className="size-4" />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-[520px] p-0">
						<div className="border-b px-3 py-2">
							<h4 className="font-medium text-sm">Browse Data Model</h4>
						</div>

						{/* Empty state */}
						{entities && entities.length === 0 && !showCustomForm && (
							<div className="flex flex-col items-center gap-3 p-8">
								<Database className="size-8 text-muted-foreground" />
								<p className="text-muted-foreground text-sm">
									No entities loaded yet.
								</p>
								<Button onClick={handleSeed} size="sm">
									Seed from Schema
								</Button>
							</div>
						)}

						{/* Two-panel browser */}
						{entities && entities.length > 0 && (
							<div className="flex" style={{ height: 320 }}>
								{/* Left panel — entity list */}
								<div className="flex w-[180px] flex-col border-r">
									<div className="border-b p-2">
										<div className="relative">
											<Search className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
											<Input
												className="h-7 pl-7 text-xs"
												onChange={(e) => setSearch(e.target.value)}
												placeholder="Filter..."
												value={search}
											/>
										</div>
									</div>
									<ScrollArea className="flex-1">
										<div className="p-1">
											{filteredEntities?.map((entity) => (
												<button
													className={`flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${
														selectedEntityName === entity.name
															? "bg-accent"
															: ""
													}`}
													key={entity.name}
													onClick={() => setSelectedEntityName(entity.name)}
													type="button"
												>
													<span className="min-w-0 flex-1 truncate">
														{entity.name}
													</span>
													<Badge
														className="shrink-0 text-[10px]"
														variant={
															entity.source === "schema"
																? "secondary"
																: "outline"
														}
													>
														{entity.source}
													</Badge>
												</button>
											))}
										</div>
									</ScrollArea>
								</div>

								{/* Right panel — fields */}
								<div className="flex flex-1 flex-col">
									{!selectedEntity && (
										<div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
											Select an entity
										</div>
									)}
									{selectedEntity && (
										<>
											<div className="border-b px-3 py-2">
												<p className="font-medium text-sm">
													{selectedEntity.label}
												</p>
												<p className="text-muted-foreground text-xs">
													{selectedEntity.fields.length} fields
												</p>
											</div>
											<ScrollArea className="flex-1">
												<div className="p-1">
													{selectedEntity.fields.map((field) => (
														<button
															className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm hover:bg-accent"
															key={field.name}
															onClick={() =>
																handleFieldClick(
																	selectedEntity.name,
																	field.name
																)
															}
															type="button"
														>
															<code className="min-w-0 flex-1 truncate font-mono text-xs">
																{field.name}
															</code>
															<Badge
																className="shrink-0 text-[10px]"
																variant="secondary"
															>
																{field.type}
															</Badge>
															{field.optional && (
																<span className="text-[10px] text-muted-foreground">
																	opt
																</span>
															)}
														</button>
													))}
												</div>
											</ScrollArea>
										</>
									)}
								</div>
							</div>
						)}

						{/* Footer */}
						<Separator />
						<div className="p-2">
							{showCustomForm ? (
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<p className="font-medium text-xs">New Custom Entity</p>
										<Button
											className="size-6"
											onClick={() => setShowCustomForm(false)}
											size="icon"
											variant="ghost"
										>
											<X className="size-3" />
										</Button>
									</div>
									<Input
										className="h-7 text-xs"
										onChange={(e) => setCustomName(e.target.value)}
										placeholder="Entity name (e.g. loan)"
										value={customName}
									/>
									<div className="space-y-1">
										{customFields.map((cf, i) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: ephemeral form rows without stable IDs
											<div className="flex gap-1" key={i}>
												<Input
													className="h-7 flex-1 text-xs"
													onChange={(e) =>
														updateCustomField(i, "name", e.target.value)
													}
													placeholder="field name"
													value={cf.name}
												/>
												<Select
													onValueChange={(val) =>
														updateCustomField(i, "type", val)
													}
													value={cf.type}
												>
													<SelectTrigger className="h-7 w-24 text-xs">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{FIELD_TYPES.map((t) => (
															<SelectItem key={t} value={t}>
																{t}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												{customFields.length > 1 && (
													<Button
														className="size-7"
														onClick={() => removeCustomFieldRow(i)}
														size="icon"
														variant="ghost"
													>
														<X className="size-3" />
													</Button>
												)}
											</div>
										))}
										<Button
											className="h-6 text-xs"
											onClick={addCustomFieldRow}
											size="sm"
											variant="ghost"
										>
											<Plus className="mr-1 size-3" />
											Field
										</Button>
									</div>
									<Button
										className="w-full"
										disabled={!customName.trim()}
										onClick={handleCreateCustom}
										size="sm"
									>
										Create Entity
									</Button>
								</div>
							) : (
								<Button
									className="w-full"
									onClick={() => setShowCustomForm(true)}
									size="sm"
									variant="ghost"
								>
									<Plus className="mr-1 size-3" />
									Custom Entity
								</Button>
							)}
						</div>
					</PopoverContent>
				</Popover>
			</div>
		</div>
	);
}
