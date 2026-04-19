import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type {
	OriginationHeroImageDraft,
	OriginationHeroImageDraftInput,
} from "#/lib/admin-origination";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	defaultHeroImageCaption,
	moveHeroImage,
	normalizeHeroImageDrafts,
} from "./listing-hero-images-model";

interface ListingHeroImagesFieldProps {
	disabled?: boolean;
	onChange: (nextImages: OriginationHeroImageDraft[]) => void;
	value?: OriginationHeroImageDraftInput[];
}

export function ListingHeroImagesField({
	disabled = false,
	onChange,
	value,
}: ListingHeroImagesFieldProps) {
	const generateUploadUrl = useMutation(api.documents.assets.generateUploadUrl);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);
	const images = useMemo(() => normalizeHeroImageDrafts(value), [value]);
	const storageUrls = useQuery(api.admin.origination.media.getStorageUrls, {
		storageIds: images.map((image) => image.storageId as Id<"_storage">),
	});
	const imageUrls = useMemo(
		() =>
			new Map(
				(storageUrls ?? []).map((item) => [
					String(item.storageId),
					item.url ?? null,
				])
			),
		[storageUrls]
	);

	async function handleUpload(files: FileList | null) {
		if (!(files && files.length > 0)) {
			return;
		}

		setIsUploading(true);
		try {
			const uploadedImages: OriginationHeroImageDraft[] = [];
			for (const file of Array.from(files)) {
				const { uploadUrl } = await generateUploadUrl({});
				const uploadResponse = await fetch(uploadUrl, {
					body: file,
					headers: { "Content-Type": file.type || "application/octet-stream" },
					method: "POST",
				});
				if (!uploadResponse.ok) {
					throw new Error(`Upload failed for ${file.name}`);
				}

				const { storageId } = (await uploadResponse.json()) as {
					storageId: string;
				};
				uploadedImages.push({
					caption: defaultHeroImageCaption(file),
					storageId,
				});
			}

			onChange([...images, ...uploadedImages]);
			toast.success(
				uploadedImages.length === 1
					? "Hero image uploaded."
					: `${uploadedImages.length} hero images uploaded.`
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Image upload failed."
			);
		} finally {
			setIsUploading(false);
		}
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<Label htmlFor="listing-hero-images-upload">Hero images</Label>
					<p className="text-muted-foreground text-xs leading-5">
						Upload images here, rename them for the listing, and reorder them to
						control the gallery sequence.
					</p>
				</div>
				<Button
					disabled={disabled || isUploading}
					onClick={() => fileInputRef.current?.click()}
					type="button"
					variant="outline"
				>
					{isUploading ? (
						<LoaderCircle className="mr-2 size-4 animate-spin" />
					) : (
						<Upload className="mr-2 size-4" />
					)}
					Upload images
				</Button>
				<input
					accept="image/*"
					className="sr-only"
					disabled={disabled || isUploading}
					id="listing-hero-images-upload"
					multiple
					onChange={(event) => {
						void handleUpload(event.target.files);
						event.target.value = "";
					}}
					ref={fileInputRef}
					type="file"
				/>
			</div>

			{images.length > 0 ? (
				<div className="space-y-3">
					{images.map((image, index) => (
						<div
							className="flex flex-col gap-4 rounded-2xl border border-border/70 p-4 md:flex-row md:items-start"
							key={image.storageId}
						>
							<div className="h-28 w-full overflow-hidden rounded-xl border border-border/70 bg-muted/20 md:w-40">
								{imageUrls.get(image.storageId) ? (
									<img
										alt={image.caption ?? `Hero image ${index + 1}`}
										className="h-full w-full object-cover"
										height={112}
										src={imageUrls.get(image.storageId) ?? undefined}
										width={160}
									/>
								) : (
									<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
										Preview loading
									</div>
								)}
							</div>
							<div className="min-w-0 flex-1 space-y-3">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="outline">Image {index + 1}</Badge>
									{index === 0 ? (
										<Badge variant="secondary">Primary</Badge>
									) : null}
								</div>
								<div className="space-y-2">
									<Label htmlFor={`listing-hero-image-caption-${index}`}>
										Name
									</Label>
									<Input
										disabled={disabled}
										id={`listing-hero-image-caption-${index}`}
										onChange={(event) =>
											onChange(
												images.map((existingImage, imageIndex) =>
													imageIndex === index
														? {
																...existingImage,
																caption: event.target.value || undefined,
															}
														: existingImage
												)
											)
										}
										placeholder={`Hero image ${index + 1}`}
										value={image.caption ?? ""}
									/>
								</div>
							</div>
							<div className="flex items-center gap-2 self-end md:self-start">
								<Button
									disabled={disabled || index === 0}
									onClick={() =>
										onChange(moveHeroImage(images, index, index - 1))
									}
									size="icon"
									type="button"
									variant="outline"
								>
									<ArrowUp className="size-4" />
									<span className="sr-only">Move image up</span>
								</Button>
								<Button
									disabled={disabled || index === images.length - 1}
									onClick={() =>
										onChange(moveHeroImage(images, index, index + 1))
									}
									size="icon"
									type="button"
									variant="outline"
								>
									<ArrowDown className="size-4" />
									<span className="sr-only">Move image down</span>
								</Button>
								<Button
									disabled={disabled}
									onClick={() =>
										onChange(
											images.filter((_, imageIndex) => imageIndex !== index)
										)
									}
									size="icon"
									type="button"
									variant="outline"
								>
									<Trash2 className="size-4" />
									<span className="sr-only">Remove image</span>
								</Button>
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-border/70 border-dashed px-4 py-6 text-muted-foreground text-sm">
					No hero images uploaded yet.
				</div>
			)}
		</div>
	);
}
