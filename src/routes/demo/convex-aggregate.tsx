import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { BarChart3, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-aggregate")({
	ssr: false,
	component: AggregateDemo,
});

function AggregateDemo() {
	const [player, setPlayer] = useState("");
	const [score, setScore] = useState("");

	const stats = useQuery(api.demo.aggregate.getStats);
	const scores = useQuery(api.demo.aggregate.listScores);
	const addScore = useMutation(api.demo.aggregate.addScore);
	const removeScore = useMutation(api.demo.aggregate.removeScore);

	const handleAdd = useCallback(async () => {
		const numScore = Number(score);
		if (!(player.trim() && score && !Number.isNaN(numScore))) {
			return;
		}
		await addScore({ player: player.trim(), score: numScore });
		setPlayer("");
		setScore("");
	}, [addScore, player, score]);

	return (
		<DemoLayout
			description="Efficient counts, sums, rankings, and percentile lookups over large datasets — all in logarithmic time."
			docsHref="https://www.convex.dev/components/aggregate"
			title="Aggregate"
		>
			<div className="space-y-6">
				{/* Stats */}
				{stats && (
					<div className="grid grid-cols-3 gap-4">
						<Card>
							<CardContent className="pt-6 text-center">
								<p className="font-bold text-3xl">{stats.count}</p>
								<p className="text-muted-foreground text-sm">Total Entries</p>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="pt-6 text-center">
								<p className="font-bold text-3xl">{stats.sum}</p>
								<p className="text-muted-foreground text-sm">Sum of Scores</p>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="pt-6 text-center">
								<p className="font-bold text-3xl">{stats.average}</p>
								<p className="text-muted-foreground text-sm">Average Score</p>
							</CardContent>
						</Card>
					</div>
				)}

				{/* Add form */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<BarChart3 className="size-4" />
							Add Score
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex gap-3">
							<Input
								className="max-w-xs"
								onChange={(e) => setPlayer(e.target.value)}
								placeholder="Player name"
								value={player}
							/>
							<Input
								className="w-24"
								onChange={(e) => setScore(e.target.value)}
								placeholder="Score"
								type="number"
								value={score}
							/>
							<Button disabled={!(player.trim() && score)} onClick={handleAdd}>
								<Plus className="mr-2 size-4" />
								Add
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Leaderboard */}
				{scores && scores.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Leaderboard</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{scores.map((s, i) => (
									<div
										className="flex items-center gap-3 rounded-md border p-3"
										key={s._id}
									>
										<Badge variant={i < 3 ? "default" : "outline"}>
											#{i + 1}
										</Badge>
										<span className="flex-1 font-medium">{s.player}</span>
										<span className="font-mono text-sm">{s.score}</span>
										<Button
											onClick={() => removeScore({ id: s._id })}
											size="icon"
											variant="ghost"
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</DemoLayout>
	);
}
