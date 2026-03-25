import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Bookmark, Redo2, Save, Undo2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-timeline")({
	ssr: false,
	component: TimelineDemo,
});

function TimelineDemo() {
	const scope = useMemo(
		() => `demo-note-${Math.random().toString(36).substring(2, 8)}`,
		[]
	);

	const [title, setTitle] = useState("My Note");
	const [content, setContent] = useState("Start editing this note…");
	const [checkpointName, setCheckpointName] = useState("");
	const [saveCount, setSaveCount] = useState(0);

	const currentState = useQuery(api.demo.timeline.getCurrentState, { scope });
	const pushState = useMutation(api.demo.timeline.pushState);
	const undo = useMutation(api.demo.timeline.undo);
	const redo = useMutation(api.demo.timeline.redo);
	const createCheckpoint = useMutation(api.demo.timeline.createCheckpoint);

	const handleSave = useCallback(async () => {
		await pushState({ scope, title, content });
		setSaveCount((c) => c + 1);
	}, [pushState, scope, title, content]);

	const handleUndo = useCallback(async () => {
		const result = await undo({ scope });
		if (result) {
			const state = result as { title: string; content: string };
			setTitle(state.title);
			setContent(state.content);
		}
	}, [undo, scope]);

	const handleRedo = useCallback(async () => {
		const result = await redo({ scope });
		if (result) {
			const state = result as { title: string; content: string };
			setTitle(state.title);
			setContent(state.content);
		}
	}, [redo, scope]);

	const handleCheckpoint = useCallback(async () => {
		if (!checkpointName.trim()) {
			return;
		}
		await createCheckpoint({ scope, name: checkpointName.trim() });
		setCheckpointName("");
	}, [createCheckpoint, scope, checkpointName]);

	return (
		<DemoLayout
			description="Undo/redo state management with scoped history and named checkpoints — perfect for editors, forms, and builders."
			docsHref="https://www.convex.dev/components/convex-timeline"
			title="Timeline / Undo-Redo"
		>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Note Editor</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<Input
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Note title"
							value={title}
						/>
						<Textarea
							className="min-h-32"
							onChange={(e) => setContent(e.target.value)}
							placeholder="Note content…"
							value={content}
						/>
						<div className="flex flex-wrap gap-2">
							<Button onClick={handleSave}>
								<Save className="mr-2 size-4" />
								Save
							</Button>
							<Button onClick={handleUndo} variant="outline">
								<Undo2 className="mr-2 size-4" />
								Undo
							</Button>
							<Button onClick={handleRedo} variant="outline">
								<Redo2 className="mr-2 size-4" />
								Redo
							</Button>
							<Badge variant="secondary">
								{saveCount} save{saveCount !== 1 ? "s" : ""}
							</Badge>
						</div>
					</CardContent>
				</Card>

				{/* Checkpoints */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Bookmark className="size-4" />
							Named Checkpoints
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex gap-2">
							<Input
								className="max-w-xs"
								onChange={(e) => setCheckpointName(e.target.value)}
								placeholder="Checkpoint name (e.g. v1-draft)"
								value={checkpointName}
							/>
							<Button
								disabled={!checkpointName.trim() || saveCount === 0}
								onClick={handleCheckpoint}
								variant="outline"
							>
								Create
							</Button>
						</div>
						<p className="text-muted-foreground text-sm">
							Save the note first, then create a checkpoint to restore later.
							Checkpoints survive normal history pruning.
						</p>
					</CardContent>
				</Card>

				{/* Current stored state */}
				{currentState && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Stored State (server)</CardTitle>
						</CardHeader>
						<CardContent className="space-y-1 text-sm">
							<p>
								<span className="text-muted-foreground">Title:</span>{" "}
								{currentState.title}
							</p>
							<p>
								<span className="text-muted-foreground">Content:</span>{" "}
								{currentState.content}
							</p>
						</CardContent>
					</Card>
				)}
			</div>
		</DemoLayout>
	);
}
