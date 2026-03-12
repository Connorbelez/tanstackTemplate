import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { File, Trash2, Upload } from "lucide-react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/demo/convex-file-management")({
	ssr: false,
	component: FileManagementDemo,
});

function FileManagementDemo() {
	const files = useQuery(api.demo.fileManagement.listFiles);
	const deleteFile = useMutation(api.demo.fileManagement.deleteFile);

	return (
		<DemoLayout
			description="Secure file uploads with access control, download grants, and lifecycle management via convex-files-control."
			title="File Management"
		>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Upload className="size-4" />
							File Uploads
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-muted-foreground text-sm">
							The files-control component provides secure upload URLs,
							finalization with access keys, and download grants with expiration
							and password protection. In a full app, you'd generate upload URLs
							and finalize uploads through wrapped mutations.
						</p>
						<Badge variant="outline">
							Component: @gilhrpenner/convex-files-control
						</Badge>
					</CardContent>
				</Card>

				{files && files.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								Tracked Files ({files.length})
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{files.map((file) => (
									<div
										className="flex items-center gap-3 rounded-md border p-3"
										key={file._id}
									>
										<File className="size-4" />
										<div className="min-w-0 flex-1">
											<p className="font-medium">{file.fileName}</p>
											<p className="font-mono text-muted-foreground text-xs">
												{file.path}
											</p>
										</div>
										<Button
											onClick={() => deleteFile({ id: file._id })}
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
