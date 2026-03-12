import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Keyboard, Timer } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-debouncer")({
	ssr: false,
	component: DebouncerDemo,
});

function DebouncerDemo() {
	const sessionId = useMemo(
		() => Math.random().toString(36).substring(2, 10),
		[]
	);
	const [text, setText] = useState("");
	const keystrokeCountRef = useRef(0);
	const [keystrokeCount, setKeystrokeCount] = useState(0);

	const recordKeystroke = useMutation(api.demo.debouncer.recordKeystroke);
	const processedResult = useQuery(api.demo.debouncer.getProcessedResult, {
		sessionId,
	});

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newText = e.target.value;
			setText(newText);
			keystrokeCountRef.current += 1;
			setKeystrokeCount(keystrokeCountRef.current);
			recordKeystroke({ text: newText, sessionId });
		},
		[recordKeystroke, sessionId]
	);

	return (
		<DemoLayout
			description="Server-side debouncing with sliding window. Only the latest input is processed after activity settles (1.5s delay)."
			docsHref="https://www.convex.dev/components/ikhrustalev/convex-debouncer"
			title="Debouncer"
		>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Keyboard className="size-5" />
							Type to trigger debounced processing
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<Input
							onChange={handleChange}
							placeholder="Start typing rapidly…"
							value={text}
						/>
						<div className="flex gap-4">
							<div className="flex items-center gap-2">
								<Keyboard className="size-4 text-blue-500" />
								<span className="text-sm">
									Keystrokes: <strong>{keystrokeCount}</strong>
								</span>
							</div>
							<div className="flex items-center gap-2">
								<Timer className="size-4 text-green-500" />
								<span className="text-sm">
									Processed: <strong>{processedResult ? 1 : 0}</strong> time
									{processedResult ? "" : "s"}
								</span>
							</div>
						</div>
					</CardContent>
				</Card>

				{processedResult && (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								Last Processed Result
								<Badge variant="secondary">debounced</Badge>
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2 text-sm">
								<p>
									<span className="text-muted-foreground">Content:</span>{" "}
									<span className="font-mono">{processedResult.content}</span>
								</p>
								<p className="text-muted-foreground">{processedResult.title}</p>
							</div>
						</CardContent>
					</Card>
				)}

				<p className="text-muted-foreground text-sm">
					Notice how rapid typing only triggers one server-side processing call
					after you stop typing for 1.5 seconds. Each keystroke calls the
					mutation, but the debouncer collapses them.
				</p>
			</div>
		</DemoLayout>
	);
}
