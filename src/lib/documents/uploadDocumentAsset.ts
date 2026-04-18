import type { Id } from "../../../convex/_generated/dataModel";

const PDF_EXTENSION_PATTERN = /\.pdf$/i;

export function defaultDocumentAssetName(file: File | undefined) {
	const name = file?.name?.replace(PDF_EXTENSION_PATTERN, "");
	return name?.trim() ? name.trim() : "";
}

interface UploadDocumentAssetDeps {
	createAsset: (args: {
		description?: string;
		fileHash: string;
		fileRef: Id<"_storage">;
		fileSize: number;
		name: string;
		originalFilename: string;
		pageCount?: number;
	}) => Promise<{ assetId: Id<"documentAssets">; duplicate: boolean }>;
	extractPdfMetadata: (args: {
		fileRef: Id<"_storage">;
	}) => Promise<{ fileHash: string; fileSize: number; pageCount: number }>;
	generateUploadUrl: (
		args: Record<string, never>
	) => Promise<{ uploadUrl: string }>;
}

export async function uploadDocumentAsset(
	deps: UploadDocumentAssetDeps,
	args: {
		description?: string;
		file: File;
		name: string;
	}
) {
	const { uploadUrl } = await deps.generateUploadUrl({});
	const uploadResponse = await fetch(uploadUrl, {
		body: args.file,
		headers: { "Content-Type": args.file.type || "application/pdf" },
		method: "POST",
	});
	if (!uploadResponse.ok) {
		throw new Error("Upload failed");
	}

	const { storageId } = (await uploadResponse.json()) as {
		storageId: string;
	};
	const fileRef = storageId as Id<"_storage">;
	const metadata = await deps.extractPdfMetadata({ fileRef });

	return deps.createAsset({
		description: args.description,
		fileHash: metadata.fileHash,
		fileRef,
		fileSize: metadata.fileSize,
		name: args.name,
		originalFilename: args.file.name,
		pageCount: metadata.pageCount,
	});
}
