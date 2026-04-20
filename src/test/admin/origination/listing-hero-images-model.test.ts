import { describe, expect, it } from "vitest";
import {
	moveHeroImage,
	normalizeHeroImageDrafts,
} from "#/components/admin/origination/listing-hero-images-model";

describe("listing hero images model", () => {
	it("normalizes structured hero image drafts and trims captions", () => {
		expect(
			normalizeHeroImageDrafts([
				{
					caption: " Front elevation ",
					storageId: " storage_front ",
				},
				" ",
			])
		).toEqual([
			{
				caption: "Front elevation",
				storageId: "storage_front",
			},
		]);
	});

	it("reorders hero images without mutating unrelated entries", () => {
		const images = [
			{ caption: "First", storageId: "storage_1" },
			{ caption: "Second", storageId: "storage_2" },
			{ caption: "Third", storageId: "storage_3" },
		];

		expect(moveHeroImage(images, 2, 0)).toEqual([
			{ caption: "Third", storageId: "storage_3" },
			{ caption: "First", storageId: "storage_1" },
			{ caption: "Second", storageId: "storage_2" },
		]);
	});
});
