import { existsSync } from "node:fs";
import {
	expect,
	type Browser,
	type BrowserContext,
	test,
	type Page,
} from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import {
	TEST_ADMIN_ORG_ID,
	createAuthStorageState,
} from "./auth-storage";

export const BASE_URL = "/demo/document-engine";
export const ADMIN_STORAGE_STATE = ".auth/admin.json";

function getBaseURL(): string {
	const baseURL = test.info().project.use.baseURL;
	if (!baseURL) {
		throw new Error(
			"Playwright baseURL is required for document engine auth setup"
		);
	}

	return baseURL;
}

async function ensureAdminStorageState(browser: Browser): Promise<void> {
	if (existsSync(ADMIN_STORAGE_STATE)) {
		return;
	}

	const bootstrapContext = await browser.newContext({ baseURL: getBaseURL() });
	const bootstrapPage = await bootstrapContext.newPage();

	try {
		await createAuthStorageState({
			orgId: TEST_ADMIN_ORG_ID,
			page: bootstrapPage,
			path: ADMIN_STORAGE_STATE,
		});
	} finally {
		await bootstrapContext.close();
	}
}

/**
 * Generate a unique name for test resources to avoid collisions
 * between parallel test runs.
 */
export function uniqueName(prefix: string): string {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Generate a unique snake_case key for system variables.
 */
export function uniqueKey(prefix: string): string {
	return `${prefix}_${Date.now().toString(36).slice(-4)}_${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * Open a browser context/page pair authenticated as the admin test user.
 * Use this for setup and teardown flows that create their own browser context.
 */
export async function openAdminPage(browser: Browser): Promise<{
	context: BrowserContext;
	page: Page;
}> {
	await ensureAdminStorageState(browser);

	const context = await browser.newContext({
		baseURL: getBaseURL(),
		storageState: ADMIN_STORAGE_STATE,
	});
	const page = await context.newPage();
	return { context, page };
}

/**
 * Create a minimal valid PDF buffer for upload testing.
 * Uses pdf-lib (already a project dependency) to produce a single-page US Letter PDF.
 */
export async function createTestPdfBuffer(): Promise<Buffer> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]); // US Letter dimensions
	page.drawText("E2E Test Document", { x: 50, y: 700, size: 20 });
	const bytes = await doc.save();
	return Buffer.from(bytes);
}

/**
 * Upload a test PDF via the Library page and return its name.
 * Assumes the page is already at the library route or will navigate there.
 */
export async function uploadTestPdf(
	page: Page,
	pdfName: string
): Promise<void> {
	await page.goto(`${BASE_URL}/library`);

	// Open upload dialog
	await page.getByRole("button", { name: "Upload PDF" }).click();
	await page.getByRole("heading", { name: "Upload Base PDF" }).waitFor();

	// Fill name
	await page.getByLabel("Name").fill(pdfName);

	// Set file via input
	const pdfBuffer = await createTestPdfBuffer();
	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles({
		name: "test.pdf",
		mimeType: "application/pdf",
		buffer: pdfBuffer,
	});

	// Submit upload
	await page.getByRole("button", { name: "Upload", exact: true }).click();

	// Wait for dialog to close and PDF to appear (metadata extraction can be slow)
	await page.getByText(pdfName).waitFor({ timeout: 30_000 });
}

/**
 * Create a system variable via the Variables page.
 */
export async function createVariable(
	page: Page,
	key: string,
	label: string,
	type = "string"
): Promise<void> {
	await page.goto(`${BASE_URL}/variables`);

	await page.getByRole("button", { name: "Add Variable" }).click();
	await page.getByRole("heading", { name: "Create System Variable" }).waitFor();

	await page.getByLabel("Key (snake_case)").fill(key);
	await page.getByLabel("Label").fill(label);

	if (type !== "string") {
		await page.locator("#var-type").click();
		await page.getByRole("option", { name: type }).click();
	}

	await page.getByRole("button", { name: "Create Variable" }).click();

	// Wait for variable to appear in the list
	await page.getByText(key).waitFor({ timeout: 10_000 });
}

/**
 * Create a template via the Templates page.
 */
export async function createTemplate(
	page: Page,
	templateName: string,
	basePdfName: string
): Promise<void> {
	await page.goto(`${BASE_URL}/templates`);

	await page.getByRole("button", { name: "New Template" }).click();
	await page.getByRole("heading", { name: "Create Template" }).waitFor();

	await page.getByLabel("Name").fill(templateName);

	// Select base PDF
	await page.locator("#tpl-pdf").click();
	await page.getByRole("option", { name: new RegExp(basePdfName) }).click();

	await page.getByRole("button", { name: "Create Template" }).click();

	// Wait for template to appear
	await page.getByText(templateName).waitFor({ timeout: 10_000 });
}

/**
 * Create a template group via the Groups page.
 */
export async function createGroup(
	page: Page,
	groupName: string
): Promise<void> {
	await page.goto(`${BASE_URL}/groups`);

	await page.getByRole("button", { name: "New Group" }).click();
	await page.getByRole("heading", { name: "Create Template Group" }).waitFor();

	await page.getByLabel("Name").fill(groupName);
	await page.getByRole("button", { name: "Create Group" }).click();

	await page.getByText(groupName).waitFor({ timeout: 10_000 });
}

// ── pdfme Designer helpers ──────────────────────────────────────

/**
 * Navigate to the designer for a template and wait for pdfme to initialize.
 */
export async function navigateToDesigner(
	page: Page,
	templateName: string
): Promise<void> {
	await page.goto(`${BASE_URL}/templates`);
	await page.getByText(templateName).waitFor({ timeout: 10_000 });

	await page
		.locator("[data-slot='card']")
		.filter({ hasText: templateName })
		.first()
		.getByRole("button", { name: "Design" })
		.click();

	await waitForDesignerReady(page);
}

/**
 * Wait for the pdfme Designer to fully initialize inside its container.
 * Checks that the container has rendered content (pdfme injects its DOM).
 */
export async function waitForDesignerReady(page: Page): Promise<void> {
	// Wait for our toolbar to render (proves the page loaded)
	await page.getByRole("button", { name: "Save" }).waitFor({ timeout: 15_000 });

	// Wait for pdfme to inject its DOM into the container
	const container = page.getByTestId("pdfme-designer");
	await container.waitFor({ timeout: 10_000 });
	await expect(container.locator(":scope > *").first()).toBeAttached({
		timeout: 10_000,
	});
}

/**
 * Add a field to the pdfme Designer canvas by dragging from the sidebar.
 *
 * pdfme's left sidebar shows registered schema types (plugin keys) as
 * draggable items. We find them by text and drag to the canvas area.
 */
export async function addFieldInDesigner(
	page: Page,
	fieldType: "interpolableField" | "signableField"
): Promise<void> {
	const container = page.getByTestId("pdfme-designer");

	// pdfme sidebar renders plugin keys as text labels
	const sidebarItem = container.locator(`text=${fieldType}`).first();
	await sidebarItem.waitFor({ timeout: 5000 });

	// Get the container bounds for targeting the canvas area
	const box = await container.boundingBox();
	if (!box) {
		throw new Error("pdfme designer container is not visible");
	}

	// Drag from sidebar to the center-right of the canvas
	// (pdfme sidebar is on the left, canvas occupies the rest)
	await sidebarItem.dragTo(container, {
		targetPosition: {
			x: Math.round(box.width * 0.5),
			y: Math.round(box.height * 0.4),
		},
	});

	// Wait for pdfme to process the drop and fire onChangeTemplate
	await page.waitForTimeout(500);
}

/**
 * Check that the pdfme Designer container has rendered content,
 * proving that the pdfme library initialized successfully.
 */
export async function expectDesignerRendered(page: Page): Promise<void> {
	const container = page.getByTestId("pdfme-designer");
	// pdfme renders multiple child divs for sidebar, canvas, etc.
	const childCount = await container.locator(":scope > *").count();
	expect(childCount).toBeGreaterThan(0);
}
