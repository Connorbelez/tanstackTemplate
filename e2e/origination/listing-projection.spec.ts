import { expect, test, type Page } from "@playwright/test";
import {
	createOriginationE2eClient,
	readE2eAccessToken,
	uniqueOriginationValue,
} from "../helpers/origination";

const UI_TIMEOUT = 30_000;

function escapeForRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractRouteId(page: Page, routePrefix: string) {
	const match = page.url().match(new RegExp(`${routePrefix}/([^/?#]+)`));
	if (!match?.[1]) {
		throw new Error(`Unable to resolve route id from ${page.url()}`);
	}
	return match[1];
}

function detailSection(page: Page, title: string) {
	return page
		.locator("section")
		.filter({
			has: page.getByRole("heading", { exact: true, name: title }),
		})
		.first();
}

function originationStepTitle(page: Page, title: string) {
	return page
		.locator('[data-slot="card-title"]')
		.filter({ hasText: new RegExp(`^${escapeForRegex(title)}$`) })
		.first();
}

async function openOriginationStep(page: Page, title: string) {
	await page
		.getByRole("button", { name: new RegExp(escapeForRegex(title), "i") })
		.click();
	await expect(originationStepTitle(page, title)).toBeVisible({
		timeout: UI_TIMEOUT,
	});
}

test.describe("Mortgage-backed listing projection", () => {
	test.setTimeout(120_000);

	let accessToken: string | undefined;
	let caseId: string | undefined;

	test.afterEach(async () => {
		if (!(accessToken && caseId)) {
			return;
		}

		const client = createOriginationE2eClient(accessToken);
		await client.cleanupCommittedOrigination(caseId);
		accessToken = undefined;
		caseId = undefined;
	});

	test("creates one linked listing, renders projection-owned fields, and preserves curation after refresh", async ({
		page,
	}) => {
		accessToken = await readE2eAccessToken(page);
		const client = createOriginationE2eClient(accessToken);
		const { borrowerId, brokerOfRecordId } =
			await client.ensureOriginationE2eContext();
		const uniqueSuffix = uniqueOriginationValue("listing-projection");
		const streetAddress = `700 ${uniqueSuffix} Street`;
		const curatedTitle = `${uniqueSuffix} opportunity`;

		await page.goto("/admin/originations");
		await page.evaluate(() => {
			window.localStorage.removeItem("admin-origination-bootstrap");
		});
		await Promise.all([
			page.waitForURL(
				/\/admin\/originations\/(?:new|[^/?#]+)(?:\?.*)?$/,
				{ timeout: UI_TIMEOUT }
			),
			page.getByRole("link", { name: "New origination" }).first().click(),
		]);
		if (page.url().includes("/admin/originations/new")) {
			await page.waitForURL(
				/\/admin\/originations\/(?!new(?:\?|$))[^/?#]+(?:\?.*)?$/,
				{ timeout: UI_TIMEOUT }
			);
		}
		caseId = extractRouteId(page, "/admin/originations");

		await page.getByLabel("Existing borrower ID").first().fill(String(borrowerId));
		await page.getByLabel("Broker of record ID").fill(String(brokerOfRecordId));
		await openOriginationStep(page, "Property + valuation");
		await page.getByLabel("Street address").fill(streetAddress);
		await page.getByLabel("City").fill("Toronto");
		await page.getByLabel("Province").fill("ON");
		await page.getByLabel("Postal code").fill("M5H 1J9");
		await page.getByLabel("Property type").selectOption("residential");
		await page.getByLabel("Value as-is").fill("425000");
		await page.getByLabel("Valuation date").fill("2026-05-01");
		await openOriginationStep(page, "Mortgage terms");
		await page.getByLabel("Principal").fill("250000");
		await page.getByLabel("Interest rate (%)").fill("9.5");
		await page.getByLabel("Rate type").selectOption("fixed");
		await page.getByLabel("Loan type").selectOption("conventional");
		await page.getByLabel("Term (months)").fill("12");
		await page.getByLabel("Amortization (months)").fill("300");
		await page.getByLabel("Payment amount").fill("2450");
		await page.getByLabel("Payment frequency").selectOption("monthly");
		await page.getByLabel("Lien position").fill("1");
		await page.getByLabel("Term start date").fill("2026-05-01");
		await page.getByLabel("First payment date").fill("2026-06-01");
		await page.getByLabel("Maturity date").fill("2027-04-30");
		await page.getByLabel("Interest adjustment date").fill("2026-05-01");
		await openOriginationStep(page, "Listing curation");
		await page.getByLabel("Listing title").fill(curatedTitle);
		await page.getByLabel("Description").fill("Curated description from origination");
		await openOriginationStep(page, "Review + commit");

		await Promise.all([
			page.waitForURL(/\/admin\/mortgages\/[^/?#]+(?:\?.*)?$/, {
				timeout: UI_TIMEOUT,
			}),
			page.getByRole("button", { name: "Commit origination" }).click(),
		]);

		const mortgageId = extractRouteId(page, "/admin/mortgages");
		let listingBeforeRefresh:
			| {
					_id: string;
					title?: string | null;
			  }
			| null = null;
		await expect
			.poll(async () => {
				listingBeforeRefresh = await client.getListingByMortgage(mortgageId);
				return listingBeforeRefresh ? String(listingBeforeRefresh._id) : null;
			}, {
				timeout: UI_TIMEOUT,
			})
			.not.toBeNull();
		if (!listingBeforeRefresh) {
			throw new Error("Listing projection did not materialize for the committed mortgage");
		}
		const committedListing = listingBeforeRefresh as {
			_id: string;
			title?: string | null;
		};

		await expect(detailSection(page, "Listing Projection")).toContainText(
			"Mortgage-backed projection"
		);
		await page.getByRole("link", { name: /Open listing/i }).click();

		await expect(page).toHaveURL(/\/admin\/listings\/[^/?#]+(?:\?.*)?$/);
		const listingId = extractRouteId(page, "/admin/listings");
		expect(listingId).toBe(String(committedListing._id));

		for (const title of [
			"Projection Source",
			"Economics",
			"Property Facts",
			"Appraisal Summary",
			"Public Documents",
			"Curated Fields",
		]) {
			await expect(
				page.getByRole("heading", { exact: true, name: title })
			).toBeVisible({ timeout: UI_TIMEOUT });
		}

		await expect(page.getByText("Mortgage-backed projection")).toBeVisible({
			timeout: UI_TIMEOUT,
		});
		await expect(detailSection(page, "Economics")).toContainText("$250,000");
		await expect(detailSection(page, "Economics")).toContainText("$2,450");
		await expect(detailSection(page, "Economics")).toContainText("Monthly");
		await expect(detailSection(page, "Property Facts")).toContainText(
			streetAddress
		);
		await expect(detailSection(page, "Appraisal Summary")).toContainText(
			"$425,000"
		);

		await page
			.getByLabel("Title")
			.fill(`${curatedTitle} refreshed`);
		await page.getByRole("button", { name: "Save curated fields" }).click();

		await expect
			.poll(async () => {
				const listing = await client.getListingByMortgage(mortgageId);
				return listing?.title ?? null;
			}, {
				timeout: UI_TIMEOUT,
			})
			.toBe(`${curatedTitle} refreshed`);

		await page.getByRole("button", { name: "Refresh projection" }).click();

		await expect
			.poll(async () => {
				const listing = await client.getListingByMortgage(mortgageId);
				return {
					listingId: listing?._id ? String(listing._id) : null,
					title: listing?.title ?? null,
				};
			}, {
				timeout: UI_TIMEOUT,
			})
			.toEqual({
				listingId,
				title: `${curatedTitle} refreshed`,
			});

		await expect(page.getByLabel("Title")).toHaveValue(
			`${curatedTitle} refreshed`
		);
	});
});
