import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Id } from "../../convex/_generated/dataModel";
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

async function expectPdfLinkReadable(link: Locator) {
	await expect(link).toBeVisible({ timeout: UI_TIMEOUT });
	const href = await link.getAttribute("href");
	if (!href) {
		throw new Error("Missing href for PDF link");
	}

	const response = await link.page().request.get(href);
	expect(response.ok()).toBe(true);
	expect(response.headers()["content-type"] ?? "").toContain("application/pdf");
}

test.describe("Deal package materialization", () => {
	test.setTimeout(180_000);

	let accessToken: string | undefined;
	let caseId: string | undefined;
	let dealCleanup:
		| {
				assetIds: Id<"documentAssets">[];
				basePdfIds: Id<"documentBasePdfs">[];
				dealId: string;
				mortgageId: string;
				templateIds: Id<"documentTemplates">[];
		  }
		| undefined;

	test.afterEach(async () => {
		if (accessToken && dealCleanup) {
			const client = createOriginationE2eClient(accessToken);
			await client.cleanupDealPackageScenario(dealCleanup);
		}

		if (accessToken && caseId) {
			const client = createOriginationE2eClient(accessToken);
			await client.cleanupCommittedOrigination(caseId);
		}

		accessToken = undefined;
		caseId = undefined;
		dealCleanup = undefined;
	});

	test("creates immutable deal-time docs from private blueprints and keeps listing docs public-only", async ({
		page,
	}) => {
		accessToken = await readE2eAccessToken(page);
		const client = createOriginationE2eClient(accessToken);
		const { borrowerId, brokerOfRecordId } =
			await client.ensureOriginationE2eContext();
		const uniqueSuffix = uniqueOriginationValue("deal-package");
		const streetAddress = `900 ${uniqueSuffix} Street`;
		const packageKey = "closing";
		const packageLabel = "Closing package";

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
			page.getByRole("link", { name: "New origination" }).first().click(),
		]);
		if (page.url().includes("/admin/originations/new")) {
			await page.waitForURL(
				/\/admin\/originations\/(?!new(?:\?|$))[^/?#]+(?:\?.*)?$/,
				{
					timeout: UI_TIMEOUT,
				}
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
			.poll(async () => client.getListingByMortgage(mortgageId), {
				timeout: UI_TIMEOUT,
			})
			.not.toBeNull();
		const listing = await client.getListingByMortgage(mortgageId);
		if (!listing?._id) {
			throw new Error("Committed mortgage did not produce a listing projection");
		}
		const listingId = String(listing._id);

		const seededBlueprints = await client.seedPrivatePackageBlueprints({
			mortgageId,
			packageKey,
			packageLabel,
			variableKey: "borrower_primary_full_name",
		});
		const { dealId } = await client.createDealForMortgage(mortgageId);
		dealCleanup = {
			assetIds: seededBlueprints.assetIds,
			basePdfIds: seededBlueprints.basePdfIds,
			dealId: String(dealId),
			mortgageId,
			templateIds: seededBlueprints.templateIds,
		};

		await client.transitionDealLocked(String(dealId), Date.now());
		await expect
			.poll(async () => client.getDealPackageSurface(String(dealId)), {
				timeout: UI_TIMEOUT,
			})
			.toMatchObject({
				instances: expect.arrayContaining([
					expect.objectContaining({
						displayName: "Private static memo",
						status: "available",
					}),
					expect.objectContaining({
						displayName: "Counsel memo",
						status: "available",
					}),
				]),
				package: expect.objectContaining({
					status: "ready",
				}),
			});
		const initialSurface = await client.getDealPackageSurface(String(dealId));
		const initialPackageId = String(initialSurface.package?.packageId);
		const initialInstanceIds = initialSurface.instances.map(
			(instance: (typeof initialSurface.instances)[number]) =>
				String(instance.instanceId)
		);
		expect(initialSurface.instances).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					class: "private_static",
					displayName: "Private static memo",
					status: "available",
					url: expect.any(String),
				}),
				expect.objectContaining({
					class: "private_templated_non_signable",
					displayName: "Counsel memo",
					status: "available",
					url: expect.any(String),
				}),
			])
		);

		await page.goto(`/admin/deals/${String(dealId)}`);
		await expect(
			page.getByRole("heading", { exact: true, name: "Deal Package" })
		).toBeVisible({ timeout: UI_TIMEOUT });
		await expect(
			page.getByRole("heading", { exact: true, name: "Private Static Documents" })
		).toBeVisible({ timeout: UI_TIMEOUT });
		await expect(
			page.getByRole("heading", {
				exact: true,
				name: "Generated Read-only Documents",
			})
		).toBeVisible({ timeout: UI_TIMEOUT });
		await expect(detailSection(page, "Private Static Documents")).toContainText(
			"Private static memo"
		);
		await expect(
			detailSection(page, "Generated Read-only Documents")
		).toContainText("Counsel memo");
		await expectPdfLinkReadable(
			detailSection(page, "Private Static Documents")
				.getByRole("link", { name: "Open PDF" })
				.first()
		);
		await expectPdfLinkReadable(
			detailSection(page, "Generated Read-only Documents")
				.getByRole("link", { name: "Open PDF" })
				.first()
		);

		await client.rerunDealPackage(String(dealId), false);
		const rerunSurface = await client.getDealPackageSurface(String(dealId));
		expect(String(rerunSurface.package?.packageId)).toBe(initialPackageId);
		expect(
			rerunSurface.instances.map(
				(instance: (typeof rerunSurface.instances)[number]) =>
					String(instance.instanceId)
			)
		).toEqual(initialInstanceIds);

		const lateBlueprint = await client.seedLateStaticBlueprint({
			displayName: "Late addendum",
			mortgageId,
			packageKey,
			packageLabel,
		});
		dealCleanup.assetIds.push(lateBlueprint.assetId as Id<"documentAssets">);
		await client.rerunDealPackage(String(dealId), false);

		const frozenSurface = await client.getDealPackageSurface(String(dealId));
		expect(
			frozenSurface.instances.some(
				(instance: (typeof frozenSurface.instances)[number]) =>
					instance.displayName === "Late addendum"
			)
		).toBe(false);

		await page.reload();
		await expect(page.getByText("Late addendum")).toHaveCount(0);

		expect(await client.getPublicListingDocuments(listingId)).toEqual([]);
	});
});
