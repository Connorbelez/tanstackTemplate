import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	ChevronRight,
	Database,
	MessageSquare,
	Trash2,
	User,
} from "lucide-react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-cascading-delete")({
	ssr: false,
	component: CascadingDeleteDemo,
});

function CascadingDeleteDemo() {
	const tree = useQuery(api.demo.cascadingDelete.getTree);
	const counts = useQuery(api.demo.cascadingDelete.getCounts);
	const seedData = useMutation(api.demo.cascadingDelete.seedData);
	const deleteAuthor = useMutation(api.demo.cascadingDelete.deleteAuthor);

	return (
		<DemoLayout
			description="Configure safe cascading deletes across related documents. Delete an author and watch their posts and comments cascade away."
			docsHref="https://www.convex.dev/components/00akshatsinha00/convex-cascading-delete"
			title="Cascading Delete"
		>
			<div className="space-y-6">
				{/* Stats + controls */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Database className="size-4" />
							Data Overview
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{counts && (
							<div className="flex gap-4">
								<Badge variant="outline">Authors: {counts.authors}</Badge>
								<Badge variant="outline">Posts: {counts.posts}</Badge>
								<Badge variant="outline">Comments: {counts.comments}</Badge>
							</div>
						)}
						<Button
							disabled={!counts || counts.authors > 0}
							onClick={() => seedData()}
							variant="outline"
						>
							<Database className="mr-2 size-4" />
							Seed Data (3 authors × 2 posts × 3 comments)
						</Button>
						<p className="text-muted-foreground text-sm">
							Cascade rules: Authors → Posts (via by_author) → Comments (via
							by_post)
						</p>
					</CardContent>
				</Card>

				{/* Tree view */}
				{tree && tree.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Document Tree</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{tree.map((author) => (
									<div className="rounded-md border p-3" key={author._id}>
										<div className="flex items-center gap-2">
											<User className="size-4 text-blue-500" />
											<span className="flex-1 font-medium">{author.name}</span>
											<Button
												onClick={() => deleteAuthor({ id: author._id })}
												size="sm"
												variant="destructive"
											>
												<Trash2 className="mr-1 size-3.5" />
												Delete (cascade)
											</Button>
										</div>
										{author.posts.map((post) => (
											<div className="mt-2 ml-6" key={post._id}>
												<div className="flex items-center gap-1 text-sm">
													<ChevronRight className="size-3 text-muted-foreground" />
													<span className="font-medium">{post.title}</span>
												</div>
												{post.comments.map((comment) => (
													<div
														className="ml-6 flex items-center gap-1 text-sm"
														key={comment._id}
													>
														<MessageSquare className="size-3 text-muted-foreground" />
														<span className="text-muted-foreground">
															{comment.text}
														</span>
													</div>
												))}
											</div>
										))}
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
