"use client";

import { useMutation, useQuery } from "convex/react";
import { FileText, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { RecordNoteView } from "../../../../convex/crm/recordNotes";

interface RecordNotesPanelProps {
	readonly objectDefId: Id<"objectDefs">;
	readonly recordId: string;
	readonly recordKind: "record" | "native";
}

const SKELETON_IDS = ["note-skel-1", "note-skel-2", "note-skel-3"] as const;

export function RecordNotesPanel({
	objectDefId,
	recordId,
	recordKind,
}: RecordNotesPanelProps) {
	const notes = useQuery(api.crm.recordNotes.listForRecord, {
		objectDefId,
		recordId,
		recordKind,
	});
	const createNote = useMutation(api.crm.recordNotes.createNote);

	const [draft, setDraft] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const trimmedDraft = draft.trim();
	const canSubmit = trimmedDraft.length > 0 && !isSubmitting;

	async function handleSubmit() {
		if (!canSubmit) {
			return;
		}
		setIsSubmitting(true);
		try {
			await createNote({
				body: trimmedDraft,
				objectDefId,
				recordId,
				recordKind,
			});
			setDraft("");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create note"
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="space-y-4">
			<div className="rounded-xl border bg-card p-3">
				<Textarea
					className="min-h-24 resize-none"
					disabled={isSubmitting}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="Write a note about this record…"
					value={draft}
				/>
				<div className="mt-2 flex items-center justify-end gap-2">
					<Button
						disabled={!canSubmit}
						onClick={handleSubmit}
						size="sm"
						type="button"
					>
						{isSubmitting ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								Saving…
							</>
						) : (
							"Add note"
						)}
					</Button>
				</div>
			</div>

			<NotesList notes={notes} />
		</div>
	);
}

function NotesList({
	notes,
}: {
	readonly notes: RecordNoteView[] | undefined;
}) {
	if (notes === undefined) {
		return (
			<div className="space-y-3">
				{SKELETON_IDS.map((id) => (
					<Skeleton className="h-24 w-full rounded-lg" key={id} />
				))}
			</div>
		);
	}

	if (notes.length === 0) {
		return <EmptyNotesState />;
	}

	return (
		<ul className="space-y-3">
			{notes.map((note) => (
				<NoteItem key={note._id} note={note} />
			))}
		</ul>
	);
}

function NoteItem({ note }: { readonly note: RecordNoteView }) {
	const updateNote = useMutation(api.crm.recordNotes.updateNote);
	const deleteNote = useMutation(api.crm.recordNotes.deleteNote);

	const [isEditing, setIsEditing] = useState(false);
	const [editDraft, setEditDraft] = useState(note.body);
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	function beginEdit() {
		setEditDraft(note.body);
		setIsEditing(true);
	}

	function cancelEdit() {
		setIsEditing(false);
		setEditDraft(note.body);
	}

	async function handleSave() {
		const trimmed = editDraft.trim();
		if (trimmed.length === 0) {
			return;
		}
		setIsSaving(true);
		try {
			await updateNote({ body: trimmed, noteId: note._id });
			setIsEditing(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update note"
			);
		} finally {
			setIsSaving(false);
		}
	}

	async function handleDelete() {
		setIsDeleting(true);
		try {
			await deleteNote({ noteId: note._id });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete note"
			);
			setIsDeleting(false);
		}
	}

	return (
		<li className="rounded-lg border bg-card p-3 text-sm">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<p className="font-medium">{note.author.displayName}</p>
					<p className="text-muted-foreground text-xs">
						{formatTimestamp(note.createdAt)}
						{note.updatedAt !== note.createdAt ? (
							<>
								{" "}
								<Badge className="ml-1 px-1.5" variant="outline">
									edited
								</Badge>
							</>
						) : null}
					</p>
				</div>
				{note.canEdit && !isEditing ? (
					<div className="flex items-center gap-1">
						<Button
							onClick={beginEdit}
							size="icon"
							type="button"
							variant="ghost"
						>
							<Pencil className="h-4 w-4" />
							<span className="sr-only">Edit note</span>
						</Button>
						<Button
							disabled={isDeleting}
							onClick={handleDelete}
							size="icon"
							type="button"
							variant="ghost"
						>
							{isDeleting ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Trash2 className="h-4 w-4" />
							)}
							<span className="sr-only">Delete note</span>
						</Button>
					</div>
				) : null}
			</div>
			{isEditing ? (
				<NoteEditor
					draft={editDraft}
					isSaving={isSaving}
					onCancel={cancelEdit}
					onChange={setEditDraft}
					onSave={handleSave}
				/>
			) : (
				<p className="mt-3 whitespace-pre-wrap break-words text-sm">
					{note.body}
				</p>
			)}
		</li>
	);
}

function NoteEditor({
	draft,
	isSaving,
	onCancel,
	onChange,
	onSave,
}: {
	readonly draft: string;
	readonly isSaving: boolean;
	readonly onCancel: () => void;
	readonly onChange: (value: string) => void;
	readonly onSave: () => void;
}) {
	return (
		<div className="mt-3 space-y-2">
			<Textarea
				className="min-h-24 resize-none"
				disabled={isSaving}
				onChange={(event) => onChange(event.target.value)}
				value={draft}
			/>
			<div className="flex items-center justify-end gap-2">
				<Button onClick={onCancel} size="sm" type="button" variant="ghost">
					<X className="h-4 w-4" />
					Cancel
				</Button>
				<Button
					disabled={isSaving || draft.trim().length === 0}
					onClick={onSave}
					size="sm"
					type="button"
				>
					{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
					Save
				</Button>
			</div>
		</div>
	);
}

function EmptyNotesState() {
	return (
		<div className="rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center">
			<div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-background text-muted-foreground">
				<FileText className="h-5 w-5" />
			</div>
			<p className="mt-4 font-medium text-sm">No notes yet</p>
			<p className="mt-2 text-muted-foreground text-sm">
				Jot down context, follow-ups, or decisions that shouldn't live as a
				structured field.
			</p>
		</div>
	);
}

function formatTimestamp(timestamp: number) {
	return new Date(timestamp).toLocaleString();
}
