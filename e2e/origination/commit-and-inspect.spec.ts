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

test.describe("Admin origination commit flow", () => {
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

	test("completes a draft case, commits it, inspects the real admin records, and leaves an active mortgage", async ({
		page,
	}) => {
		accessToken = await readE2eAccessToken(page);
		const client = createOriginationE2eClient(accessToken);
		const { borrowerId, brokerOfRecordId } =
			await client.ensureOriginationE2eContext();
		const uniqueSuffix = uniqueOriginationValue("origination");
		const streetAddress = `500 ${uniqueSuffix} Street`;

		await page.goto("/admin/originations");
		await page.evaluate(() => {
			window.localStorage.removeItem("admin-origination-bootstrap");
		});
		await Promise.all([
			page.waitForURL(
				/\/admin\/originations\/(?:new|[^/?#]+)(?:\?.*)?$/,
				{
					timeout: UI_TIMEOUT,
				}
			),
			page
				.getByRole("link", { name: "New origination" })
				.first()
				.click(),
		]);
		if (page.url().includes("/admin/originations/new")) {
			await expect(page.getByText("Allocating draft case")).toBeVisible({
				timeout: UI_TIMEOUT,
			});
			await page.waitForURL(
				/\/admin\/originations\/(?!new(?:\?|$))[^/?#]+(?:\?.*)?$/,
				{
					timeout: UI_TIMEOUT,
				}
			);
		}
		caseId = extractRouteId(page, "/admin/originations");

		await test.step("complete the staged origination case", async () => {
			await page
				.getByLabel("Existing borrower ID")
				.first()
				.fill(String(borrowerId));
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
			await openOriginationStep(page, "Review + commit");
			await expect(
				page.getByRole("button", { name: "Commit origination" })
			).toBeEnabled();
		});

		let mortgageId = "";
		await test.step("commit the case and land on the real mortgage detail page", async () => {
			await Promise.all([
				page.waitForURL(/\/admin\/mortgages\/[^/?#]+(?:\?.*)?$/, {
					timeout: UI_TIMEOUT,
				}),
				page.getByRole("button", { name: "Commit origination" }).click(),
			]);

			mortgageId = extractRouteId(page, "/admin/mortgages");

			for (const sectionTitle of [
				"Summary",
				"Borrowers",
				"Payment Setup",
				"Listing Projection",
				"Documents",
				"Audit",
			]) {
				await expect(
					page.getByRole("heading", { exact: true, name: sectionTitle })
				).toBeVisible({ timeout: UI_TIMEOUT });
			}
			await expect(page.getByText(mortgageId).first()).toBeVisible();
			await expect(detailSection(page, "Summary")).toContainText(/active/i);
			await expect(
				detailSection(page, "Borrowers").locator(
					`a[href^="/admin/borrowers/${String(borrowerId)}"]`
				)
			).toBeVisible({ timeout: UI_TIMEOUT });
			await expect(
				detailSection(page, "Payment Setup").locator(
					'a[href^="/admin/properties/"]'
				)
			).toBeVisible({ timeout: UI_TIMEOUT });
			await expect(detailSection(page, "Payment Setup")).toContainText(
				streetAddress
			);
		});

		await test.step("inspect the borrower, property, and mortgage admin records", async () => {
			const borrowerLink = page
				.locator(`a[href^="/admin/borrowers/${String(borrowerId)}"]`)
				.first();
			await expect(borrowerLink).toBeVisible({ timeout: UI_TIMEOUT });
			await borrowerLink.click();

			await expect(page).toHaveURL(
				new RegExp(`/admin/borrowers/${String(borrowerId)}(?:\\?.*)?$`)
			);
			await expect(page.getByText(String(borrowerId)).first()).toBeVisible({
				timeout: UI_TIMEOUT,
			});

			await page.goBack();
			await expect(page).toHaveURL(
				new RegExp(`/admin/mortgages/${mortgageId}(?:\\?.*)?$`)
			);

			const propertyLink = page.locator('a[href^="/admin/properties/"]').first();
			await expect(propertyLink).toBeVisible({ timeout: UI_TIMEOUT });
			const propertyHref = await propertyLink.getAttribute("href");
			if (!propertyHref) {
				throw new Error("Property detail link was missing from mortgage detail");
			}
			const propertyId = propertyHref.split("/").pop()?.split("?")[0];
			if (!propertyId) {
				throw new Error(`Unable to resolve property id from ${propertyHref}`);
			}

			await propertyLink.click();
			await expect(page).toHaveURL(
				new RegExp(`/admin/properties/${propertyId}(?:\\?.*)?$`)
			);
			await expect(page.getByText(propertyId).first()).toBeVisible({
				timeout: UI_TIMEOUT,
			});

			await page.goBack();
			await expect(page).toHaveURL(
				new RegExp(`/admin/mortgages/${mortgageId}(?:\\?.*)?$`)
			);
			await expect(page.getByText(mortgageId).first()).toBeVisible({
				timeout: UI_TIMEOUT,
			});
			await expect(detailSection(page, "Summary")).toContainText(/active/i);
		});
	});
});
