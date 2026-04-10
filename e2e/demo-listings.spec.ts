import { expect, test } from "@playwright/test";

const KNOWN_LISTING_URL = "/demo/listings/first-mortgage-north-york";
const UNKNOWN_LISTING_URL = "/demo/listings/unknown-listing";

test.describe("Demo listing detail page", () => {
	test("renders a known listing and supports desktop interactions", async ({
		page,
	}) => {
		await page.goto(KNOWN_LISTING_URL);

		await expect(
			page.getByRole("heading", {
				name: "First Mortgage — Detached Home, North York",
			})
		).toBeVisible();
		await expect(page.getByText("1 of 12 photos")).toBeVisible();

		await page.getByRole("button", { name: "Next photo" }).click();
		await expect(page.getByText("2 of 12 photos")).toBeVisible();

		await page.getByRole("button", { name: "View Kitchen" }).click();
		await expect(page.getByText("Kitchen").first()).toBeVisible();

		await page
			.getByRole("button", { name: /Jones Law Professional Corp\./i })
			.first()
			.click();
		await page.getByLabel("Number of fractions").first().fill("120");
		await page.getByLabel("Number of fractions").first().press("Tab");

		await expect(page.getByText("= $5,400")).toBeVisible();
		await expect(page.getByText("Jones Law Professional Corp.").first()).toBeVisible();

		await page.getByRole("button", { name: /Commitment Letter/i }).first().click();
		await expect(page.getByText("Commitment Letter — Page 1 of 4")).toBeVisible();
	});

	test("renders a not-found state for unknown listings", async ({ page }) => {
		await page.goto(UNKNOWN_LISTING_URL);

		await expect(
			page.getByRole("heading", { name: "Unable to load listing" })
		).toBeVisible();
		await expect(page.getByText("unknown-listing")).toBeVisible();
	});

	test("renders the mobile composition", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(KNOWN_LISTING_URL);

		await expect(page.getByText("Show Map — North York, ON")).toBeVisible();
		await expect(page.getByText("You May Also Like")).toBeVisible();
		await expect(
			page.getByRole("button", {
				name: "Lock 100 Fractions — Pay $250 Fee",
			})
		).toBeVisible();
	});
});
