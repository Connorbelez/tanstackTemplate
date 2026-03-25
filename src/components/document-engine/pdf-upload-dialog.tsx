import { useAction, useMutation } from "convex/react";
import { Loader2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { api } from "../../../convex/_generated/api";

export function PdfUploadDialog({
	onUploadComplete,
}: {
	onUploadComplete?: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const fileRef = useRef<HTMLInputElement>(null);

	const generateUploadUrl = useMutation(
		api.documentEngine.basePdfs.generateUploadUrl
	);
	const extractMetadata = useAction(
		api.documentEngine.basePdfs.extractPdfMetadata
	);
	const createPdf = useMutation(api.documentEngine.basePdfs.create);

	const handleUpload = useCallback(async () => {
		const file = fileRef.current?.files?.[0];
		if (!(file && name.trim())) {
			return;
		}

		setUploading(true);
		setError(null);
		setInfo(null);

		try {
			// 1. Get upload URL + upload file
			const { uploadUrl } = await generateUploadUrl();
			const uploadResult = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type || "application/pdf" },
				body: file,
			});
			if (!uploadResult.ok) {
				throw new Error("Upload failed");
			}
			const { storageId } = (await uploadResult.json()) as {
				storageId: string;
			};

			// 2. Extract metadata + hash server-side
			const metadata = await extractMetadata({
				fileRef: storageId as never,
			});

			// 3. Create record (dedup check happens server-side in the mutation)
			const result = await createPdf({
				name: name.trim(),
				description: description.trim() || undefined,
				fileRef: storageId as never,
				fileHash: metadata.fileHash,
				fileSize: metadata.fileSize,
				pageCount: metadata.pageCount,
				pageDimensions: metadata.pageDimensions,
			});

			if (result.duplicate) {
				setInfo(
					"This PDF already exists in the library. Using the existing copy."
				);
				setTimeout(() => {
					setOpen(false);
					setInfo(null);
				}, 2000);
			} else {
				setOpen(false);
			}
			setName("");
			setDescription("");
			if (fileRef.current) {
				fileRef.current.value = "";
			}
			onUploadComplete?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Upload failed");
		} finally {
			setUploading(false);
		}
	}, [
		name,
		description,
		generateUploadUrl,
		extractMetadata,
		createPdf,
		onUploadComplete,
	]);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button>
					<Upload className="mr-2 size-4" />
					Upload PDF
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Upload Base PDF</DialogTitle>
					<DialogDescription>
						Upload a PDF to use as a template base. Duplicate files are
						automatically detected.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="pdf-name"
						>
							Name
						</label>
						<Input
							id="pdf-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Loan Agreement v2"
							value={name}
						/>
					</div>
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="pdf-desc"
						>
							Description (optional)
						</label>
						<Textarea
							id="pdf-desc"
							onChange={(e) => setDescription(e.target.value)}
							placeholder="What this PDF is used for..."
							value={description}
						/>
					</div>
					<div>
						<label
							className="mb-1 block font-medium text-sm"
							htmlFor="pdf-file"
						>
							PDF File
						</label>
						<Input
							accept="application/pdf"
							id="pdf-file"
							ref={fileRef}
							type="file"
						/>
					</div>
					{info && <p className="text-blue-600 text-sm">{info}</p>}
					{error && <p className="text-destructive text-sm">{error}</p>}
					<Button
						className="w-full"
						disabled={uploading || !name.trim()}
						onClick={handleUpload}
					>
						{uploading ? (
							<>
								<Loader2 className="mr-2 size-4 animate-spin" />
								Uploading...
							</>
						) : (
							"Upload"
						)}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
