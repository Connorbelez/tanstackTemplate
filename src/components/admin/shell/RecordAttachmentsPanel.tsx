"use client";

import { useMutation, useQuery } from "convex/react";
import {
	Download,
	File as FileIcon,
	Loader2,
	Trash2,
	Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { RecordAttachmentView } from "../../../../convex/crm/recordAttachments";

interface RecordAttachmentsPanelProps {
	readonly objectDefId: Id<"objectDefs">;
	readonly recordId: string;
	readonly recordKind: "record" | "native";
}

const SKELETON_IDS = [
	"attachment-skel-1",
	"attachment-skel-2",
	"attachment-skel-3",
] as const;

export function RecordAttachmentsPanel({
	objectDefId,
	recordId,
	recordKind,
}: RecordAttachmentsPanelProps) {
	const attachments = useQuery(api.crm.recordAttachments.listForRecord, {
		objectDefId,
		recordId,
		recordKind,
	});
	const generateUploadUrl = useMutation(
		api.crm.recordAttachments.generateUploadUrl
	);
	const attachFile = useMutation(api.crm.recordAttachments.attachFile);
	const deleteAttachment = useMutation(
		api.crm.recordAttachments.deleteAttachment
	);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [pendingDeleteId, setPendingDeleteId] =
		useState<Id<"recordAttachments"> | null>(null);

	async function handleFilesSelected(files: FileList | null) {
		if (!files || files.length === 0) {
			return;
		}

		setIsUploading(true);
		try {
			for (const file of Array.from(files)) {
				const { uploadUrl } = await generateUploadUrl({
					objectDefId,
					recordId,
					recordKind,
				});

				const response = await fetch(uploadUrl, {
					method: "POST",
					headers: file.type ? { "Content-Type": file.type } : undefined,
					body: file,
				});
				if (!response.ok) {
					throw new Error(`Upload failed (${response.status})`);
				}
				const { storageId } = (await response.json()) as {
					storageId: Id<"_storage">;
				};

				await attachFile({
					contentType: file.type || undefined,
					fileName: file.name,
					objectDefId,
					recordId,
					recordKind,
					sizeBytes: file.size,
					storageId,
				});
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "File upload failed"
			);
		} finally {
			setIsUploading(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	}

	async function handleDelete(attachmentId: Id<"recordAttachments">) {
		setPendingDeleteId(attachmentId);
		try {
			await deleteAttachment({ attachmentId });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete attachment"
			);
		} finally {
			setPendingDeleteId(null);
		}
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between rounded-xl border bg-card p-3">
				<div className="text-sm">
					<p className="font-medium">Attachments</p>
					<p className="text-muted-foreground text-xs">
						Drop receipts, scans, or supporting docs — stored in Convex storage.
					</p>
				</div>
				<div>
					<input
						className="hidden"
						multiple
						onChange={(event) => handleFilesSelected(event.target.files)}
						ref={fileInputRef}
						type="file"
					/>
					<Button
						disabled={isUploading}
						onClick={() => fileInputRef.current?.click()}
						size="sm"
						type="button"
					>
						{isUploading ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								Uploading…
							</>
						) : (
							<>
								<Upload className="h-4 w-4" />
								Upload
							</>
						)}
					</Button>
				</div>
			</div>

			<AttachmentsList
				attachments={attachments}
				onDelete={handleDelete}
				pendingDeleteId={pendingDeleteId}
			/>
		</div>
	);
}

function AttachmentsList({
	attachments,
	onDelete,
	pendingDeleteId,
}: {
	readonly attachments: RecordAttachmentView[] | undefined;
	readonly onDelete: (id: Id<"recordAttachments">) => void;
	readonly pendingDeleteId: Id<"recordAttachments"> | null;
}) {
	if (attachments === undefined) {
		return (
			<div className="space-y-3">
				{SKELETON_IDS.map((id) => (
					<Skeleton className="h-14 w-full rounded-lg" key={id} />
				))}
			</div>
		);
	}

	if (attachments.length === 0) {
		return <EmptyAttachmentsState />;
	}

	return (
		<ul className="space-y-2">
			{attachments.map((attachment) => (
				<AttachmentItem
					attachment={attachment}
					isDeleting={pendingDeleteId === attachment._id}
					key={attachment._id}
					onDelete={onDelete}
				/>
			))}
		</ul>
	);
}

function AttachmentItem({
	attachment,
	isDeleting,
	onDelete,
}: {
	readonly attachment: RecordAttachmentView;
	readonly isDeleting: boolean;
	readonly onDelete: (id: Id<"recordAttachments">) => void;
}) {
	return (
		<li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
			<div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<FileIcon className="h-4 w-4" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium">{attachment.fileName}</p>
				<p className="text-muted-foreground text-xs">
					{formatFileMetadata(attachment)}
				</p>
			</div>
			{attachment.url ? (
				<Button asChild size="icon" type="button" variant="ghost">
					<a
						download={attachment.fileName}
						href={attachment.url}
						rel="noreferrer"
						target="_blank"
					>
						<Download className="h-4 w-4" />
						<span className="sr-only">Download</span>
					</a>
				</Button>
			) : null}
			{attachment.canDelete ? (
				<Button
					disabled={isDeleting}
					onClick={() => onDelete(attachment._id)}
					size="icon"
					type="button"
					variant="ghost"
				>
					{isDeleting ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Trash2 className="h-4 w-4" />
					)}
					<span className="sr-only">Delete attachment</span>
				</Button>
			) : null}
		</li>
	);
}

function EmptyAttachmentsState() {
	return (
		<div className="rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center">
			<div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-background text-muted-foreground">
				<Upload className="h-5 w-5" />
			</div>
			<p className="mt-4 font-medium text-sm">No attachments yet</p>
			<p className="mt-2 text-muted-foreground text-sm">
				Use the upload button above to attach PDFs, images, or any supporting
				documents for this record.
			</p>
		</div>
	);
}

function formatFileMetadata(attachment: {
	contentType: string | undefined;
	createdAt: number;
	sizeBytes: number | undefined;
	uploader: { displayName: string };
}): string {
	const parts: string[] = [];
	parts.push(attachment.uploader.displayName);
	parts.push(new Date(attachment.createdAt).toLocaleString());
	if (attachment.sizeBytes !== undefined) {
		parts.push(formatBytes(attachment.sizeBytes));
	}
	if (attachment.contentType) {
		parts.push(attachment.contentType);
	}
	return parts.join(" • ");
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
