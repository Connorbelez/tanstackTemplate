import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowRightLeft,
	CheckCircle,
	Circle,
	Database,
	Play,
	Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-migrations")({
	ssr: false,
	component: MigrationsDemo,
});

function MigrationsDemo() {
	const data = useQuery(api.demo.migrations.listItems);
	const seedItems = useMutation(api.demo.migrations.seedItems);
	const clearItems = useMutation(api.demo.migrations.clearItems);
	const runMigration = useMutation(api.demo.migrations.runMigration);

	const [seedMsg, setSeedMsg] = useState("");
	const [migrating, setMigrating] = useState(false);

	const handleSeed = useCallback(async () => {
		const result = await seedItems({ count: 50 });
		setSeedMsg(result.message);
	}, [seedItems]);

	const handleMigrate = useCallback(async () => {
		setMigrating(true);
		await runMigration({});
		setMigrating(false);
	}, [runMigration]);

	const total = data?.total ?? 0;
	const migrated = data?.migrated ?? 0;
	const progress = total > 0 ? Math.round((migrated / total) * 100) : 0;

	return (
		<DemoLayout
			description="Define, run, and track database migrations with batched processing and resumable state."
			docsHref="https://www.convex.dev/components/migrations"
			title="Migrations"
		>
			<div className="space-y-6">
				{/* Controls */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Database className="size-5" />
							Migration Demo
						</CardTitle>
						<p className="text-muted-foreground text-sm">
							Seed items, then run a migration that adds a{" "}
							<code className="rounded bg-muted px-1 text-xs">migrated</code>{" "}
							flag to each document.
						</p>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex flex-wrap gap-3">
							<Button
								disabled={total > 0}
								onClick={handleSeed}
								variant="outline"
							>
								<Database className="mr-2 size-4" />
								Seed 50 Items
							</Button>
							<Button
								disabled={total === 0 || migrated === total || migrating}
								onClick={handleMigrate}
							>
								<ArrowRightLeft className="mr-2 size-4" />
								{migrating ? "Migrating…" : "Run Migration"}
							</Button>
							<Button
								disabled={total === 0}
								onClick={() => {
									clearItems();
									setSeedMsg("");
								}}
								variant="destructive"
							>
								<Trash2 className="mr-2 size-4" />
								Clear All
							</Button>
						</div>
						{seedMsg && (
							<p className="text-muted-foreground text-sm">{seedMsg}</p>
						)}
					</CardContent>
				</Card>

				{/* Progress */}
				{total > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<Play className="size-4" />
								Migration Progress
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="flex items-center justify-between text-sm">
								<span>
									{migrated} / {total} migrated
								</span>
								<Badge variant={progress === 100 ? "default" : "secondary"}>
									{progress}%
								</Badge>
							</div>
							<Progress value={progress} />

							{/* Item list preview */}
							<div className="mt-4 max-h-48 overflow-y-auto">
								<div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">
									{data?.items.slice(0, 20).map((item) => (
										<div
											className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
											key={item._id}
										>
											{item.migrated ? (
												<CheckCircle className="size-3 shrink-0 text-green-500" />
											) : (
												<Circle className="size-3 shrink-0 text-muted-foreground" />
											)}
											<span className="truncate">{item.value}</span>
										</div>
									))}
								</div>
								{total > 20 && (
									<p className="mt-2 text-muted-foreground text-xs">
										…and {total - 20} more items
									</p>
								)}
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</DemoLayout>
	);
}
