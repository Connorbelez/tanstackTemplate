import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileText, History, PenLine, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { DemoLayout } from "#/components/demo-layout";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/demo/convex-audit-log")({
	ssr: false,
	component: AuditLogDemo,
});

function AuditLogDemo() {
	const documents = useQuery(api.demo.auditLog.listDocuments);
	const auditTrail = useQuery(api.demo.auditLog.getAuditTrail, {});
	const createDoc = useMutation(api.demo.auditLog.createDocument);
	const updateDoc = useMutation(api.demo.auditLog.updateDocument);
	const deleteDoc = useMutation(api.demo.auditLog.deleteDocument);

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [editingId, setEditingId] = useState<Id<"demo_audit_documents"> | null>(
		null
	);
	const [editTitle, setEditTitle] = useState("");
	const [editBody, setEditBody] = useState("");
	const [editStatus, setEditStatus] = useState("draft");

	const handleCreate = useCallback(async () => {
		if (!title.trim()) {
			return;
		}
		await createDoc({ title: title.trim(), body: body.trim() });
		setTitle("");
		setBody("");
	}, [createDoc, title, body]);

	const handleUpdate = useCallback(async () => {
		if (!editingId) {
			return;
		}
		await updateDoc({
			id: editingId,
			title: editTitle,
			body: editBody,
			status: editStatus,
		});
		setEditingId(null);
	}, [updateDoc, editingId, editTitle, editBody, editStatus]);

	return (
		<DemoLayout
			description="Structured audit logging with change diffs, severity levels, and resource/actor queries. Track who did what, when."
			docsHref="https://www.convex.dev/components/convex-audit-log"
			title="Audit Log"
		>
			<div className="grid gap-6 md:grid-cols-2">
				{/* Documents panel */}
				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<FileText className="size-4" />
								Documents
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Input
									onChange={(e) => setTitle(e.target.value)}
									placeholder="Document title"
									value={title}
								/>
								<Textarea
									onChange={(e) => setBody(e.target.value)}
									placeholder="Body text"
									value={body}
								/>
								<Button
									disabled={!title.trim()}
									onClick={handleCreate}
									size="sm"
								>
									<Plus className="mr-1 size-3.5" />
									Create
								</Button>
							</div>

							{documents?.map((doc) => (
								<div className="rounded-md border p-3" key={doc._id}>
									{editingId === doc._id ? (
										<div className="space-y-2">
											<Input
												onChange={(e) => setEditTitle(e.target.value)}
												value={editTitle}
											/>
											<Textarea
												onChange={(e) => setEditBody(e.target.value)}
												value={editBody}
											/>
											<select
												className="rounded border px-2 py-1 text-sm"
												onChange={(e) => setEditStatus(e.target.value)}
												value={editStatus}
											>
												<option value="draft">Draft</option>
												<option value="published">Published</option>
												<option value="archived">Archived</option>
											</select>
											<div className="flex gap-2">
												<Button onClick={handleUpdate} size="sm">
													Save
												</Button>
												<Button
													onClick={() => setEditingId(null)}
													size="sm"
													variant="outline"
												>
													Cancel
												</Button>
											</div>
										</div>
									) : (
										<div className="flex items-start gap-2">
											<div className="min-w-0 flex-1">
												<p className="font-medium">{doc.title}</p>
												<p className="text-muted-foreground text-sm">
													{doc.body || "(empty)"}
												</p>
												<Badge className="mt-1" variant="outline">
													{doc.status}
												</Badge>
											</div>
											<Button
												onClick={() => {
													setEditingId(doc._id);
													setEditTitle(doc.title);
													setEditBody(doc.body);
													setEditStatus(doc.status);
												}}
												size="icon"
												variant="ghost"
											>
												<PenLine className="size-4" />
											</Button>
											<Button
												onClick={() => deleteDoc({ id: doc._id })}
												size="icon"
												variant="ghost"
											>
												<Trash2 className="size-4" />
											</Button>
										</div>
									)}
								</div>
							))}
						</CardContent>
					</Card>
				</div>

				{/* Audit trail */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<History className="size-4" />
							Audit Trail
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{auditTrail && auditTrail.length > 0 ? (
								auditTrail.map((event: Record<string, unknown>) => (
									<div
										className="rounded-md border p-2 text-sm"
										key={event._id as string}
									>
										<div className="flex items-center gap-2">
											<Badge
												variant={
													event.severity === "warning"
														? "destructive"
														: "secondary"
												}
											>
												{event.severity as string}
											</Badge>
											<span className="font-mono text-xs">
												{event.action as string}
											</span>
										</div>
										<p className="mt-1 text-muted-foreground text-xs">
											{new Date(event._creationTime as number).toLocaleString()}
										</p>
									</div>
								))
							) : (
								<p className="text-muted-foreground text-sm">
									Create, edit, or delete a document to see audit events appear
									here.
								</p>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</DemoLayout>
	);
}
