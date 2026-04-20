import type {
	OriginationHeroImageDraft,
	OriginationHeroImageDraftInput,
} from "#/lib/admin-origination";

const FILE_EXTENSION_PATTERN = /\.[^.]+$/;

export function defaultHeroImageCaption(file: File) {
	return file.name.replace(FILE_EXTENSION_PATTERN, "").trim();
}

export function normalizeHeroImageDrafts(
	images: OriginationHeroImageDraftInput[] | undefined
): OriginationHeroImageDraft[] {
	return (images ?? [])
		.map((image) =>
			typeof image === "string"
				? image.trim()
					? { storageId: image.trim() }
					: null
				: image.storageId.trim()
					? {
							caption: image.caption?.trim() || undefined,
							storageId: image.storageId.trim(),
						}
					: null
		)
		.filter(Boolean) as OriginationHeroImageDraft[];
}

export function moveHeroImage(
	images: OriginationHeroImageDraft[],
	fromIndex: number,
	toIndex: number
) {
	if (
		fromIndex < 0 ||
		toIndex < 0 ||
		fromIndex >= images.length ||
		toIndex >= images.length ||
		fromIndex === toIndex
	) {
		return images;
	}

	const next = [...images];
	const [item] = next.splice(fromIndex, 1);
	if (!item) {
		return images;
	}
	next.splice(toIndex, 0, item);
	return next;
}
