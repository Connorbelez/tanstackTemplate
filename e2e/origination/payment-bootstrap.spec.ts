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

test.describe("Origination payment bootstrap", () => {
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

	test("commits a case into real obligations and planned app-owned collection entries", async ({
		page,
	}) => {
		accessToken = await readE2eAccessToken(page);
		const client = createOriginationE2eClient(accessToken);
		const { borrowerId, brokerOfRecordId } =
			await client.ensureOriginationE2eContext();
		const uniqueSuffix = uniqueOriginationValue("payment-bootstrap");
		const streetAddress = `900 ${uniqueSuffix} Street`;

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
		await openOriginationStep(page, "Review + commit");

		await Promise.all([
			page.waitForURL(/\/admin\/mortgages\/[^/?#]+(?:\?.*)?$/, {
				timeout: UI_TIMEOUT,
			}),
			page.getByRole("button", { name: "Commit origination" }).click(),
		]);

		const mortgageId = extractRouteId(page, "/admin/mortgages");
		await expect
			.poll(() => client.getMortgageDetailContext(mortgageId), {
				timeout: UI_TIMEOUT,
			})
			.toMatchObject({
				paymentSetup: {
					collectionAttemptCount: 0,
					collectionPlanEntryCount: 12,
					obligationCount: 12,
					transferRequestCount: 0,
				},
			});
		const detailContext = await client.getMortgageDetailContext(mortgageId);
		await page.reload();
		await expect(page).toHaveURL(
			new RegExp(`/admin/mortgages/${mortgageId}(?:\\?.*)?$`)
		);

		const paymentSetupSection = detailSection(page, "Payment Setup");
		await expect(paymentSetupSection).toContainText("Execution Mode");
		await expect(paymentSetupSection).toContainText("App Owned");
		await expect(paymentSetupSection).toContainText("Collection Plan Entries");
		await expect(paymentSetupSection).toContainText(streetAddress);
		await expect(paymentSetupSection).toContainText("Open obligation");
		await expect(paymentSetupSection).toContainText("Open property record");
		await expect(detailSection(page, "Summary")).toContainText(/active/i);

		expect(detailContext.borrowers.map((borrower) => String(borrower.borrowerId))).toContain(
			String(borrowerId)
		);
		expect(detailContext.paymentSetup.collectionAttemptCount).toBe(0);
		expect(detailContext.paymentSetup.transferRequestCount).toBe(0);
		expect(detailContext.paymentSetup.obligations).toHaveLength(12);
		expect(detailContext.paymentSetup.collectionPlanEntries).toHaveLength(12);
		expect(
			detailContext.paymentSetup.collectionPlanEntries.every(
				(entry) =>
					entry.executionMode === "app_owned" && entry.status === "planned"
			)
		).toBe(true);
		expect(
			detailContext.paymentSetup.obligations.some(
				(obligation) => obligation.type === "principal_repayment"
			)
		).toBe(true);

		if (detailContext.paymentSetup.scheduleRuleMissing) {
			await expect(paymentSetupSection).toContainText(
				"Schedule rule fallback applied"
			);
		}

		const borrowerLink = page
			.locator(`a[href^="/admin/borrowers/${String(borrowerId)}"]`)
			.first();
		await borrowerLink.click();
		await expect(page).toHaveURL(
			new RegExp(`/admin/borrowers/${String(borrowerId)}(?:\\?.*)?$`)
		);

		await page.goBack();
		await expect(page).toHaveURL(
			new RegExp(`/admin/mortgages/${mortgageId}(?:\\?.*)?$`)
		);

		const propertyLink = paymentSetupSection
			.locator('a[href^="/admin/properties/"]')
			.first();
		await expect(propertyLink).toBeVisible({ timeout: UI_TIMEOUT });
		const propertyHref = await propertyLink.getAttribute("href");
		if (!propertyHref) {
			throw new Error("Property detail link was missing from payment setup");
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
