import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { cn } from "#/lib/utils";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

type ObjectDef = Doc<"objectDefs">;

interface ObjectInventoryCardProps {
	description: string;
	emptyMessage: string;
	objects: ObjectDef[];
	onSelect: (objectDefId: Id<"objectDefs">) => void;
	selectedObjectId?: Id<"objectDefs">;
	title: string;
}

export function ObjectInventoryCard({
	description,
	emptyMessage,
	objects,
	onSelect,
	selectedObjectId,
	title,
}: ObjectInventoryCardProps) {
	return (
		<Card className="border-border/70 shadow-sm">
			<CardHeader>
				<CardTitle className="text-lg">{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{objects.length === 0 ? (
					<p className="text-muted-foreground text-sm">{emptyMessage}</p>
				) : null}

				{objects.map((objectDef) => {
					const isActive = objectDef._id === selectedObjectId;
					return (
						<button
							className={cn(
								"w-full rounded-2xl border px-4 py-3 text-left transition-colors",
								isActive
									? "border-primary/40 bg-primary/10"
									: "border-border/70 bg-background hover:bg-muted/30"
							)}
							key={objectDef._id}
							onClick={() => onSelect(objectDef._id)}
							type="button"
						>
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="font-medium text-sm">
										{objectDef.singularLabel}
									</p>
									<p className="text-muted-foreground text-xs">
										{objectDef.pluralLabel}
									</p>
								</div>
								<Badge variant={isActive ? "default" : "outline"}>
									{objectDef.name}
								</Badge>
							</div>
							{objectDef.description ? (
								<p className="mt-2 text-muted-foreground text-xs leading-5">
									{objectDef.description}
								</p>
							) : null}
						</button>
					);
				})}
			</CardContent>
		</Card>
	);
}
