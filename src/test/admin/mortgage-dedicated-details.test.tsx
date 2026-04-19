/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
	NormalizedFieldDefinition,
	UnifiedRecord,
} from "../../../convex/crm/types";
import { MortgagesDedicatedDetailsContent } from "#/components/admin/shell/dedicated-detail-panels";

vi.mock("@tanstack/react-router", async () => {
	const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
		"@tanstack/react-router"
	);

	return {
		...actual,
		Link: (props: {
			children: ReactNode;
			className?: string;
			params?: Record<string, string>;
			to: string;
		}) => (
			<a
				className={props.className}
				href={props.to.replace(
					"$recordid",
					props.params?.recordid ?? "$recordid"
				)}
			>
				{props.children}
			</a>
		),
	};
});

function buildFieldDef(args: {
	displayOrder: number;
	fieldType?: NormalizedFieldDefinition["fieldType"];
	label: string;
	name: string;
}): NormalizedFieldDefinition {
	return {
		aggregation: {
			enabled: false,
			reason: "Test fixture",
			supportedFunctions: [],
		},
		computed: undefined,
		defaultValue: undefined,
		description: undefined,
		displayOrder: args.displayOrder,
		editability: { mode: "editable" },
		fieldDefId: `field_${args.name}` as Id<"fieldDefs">,
		fieldSource: "persisted",
		fieldType: args.fieldType ?? "text",
		isActive: true,
		isRequired: false,
		isUnique: false,
		isVisibleByDefault: true,
		label: args.label,
		layoutEligibility: {
			calendar: { enabled: false, reason: "Test fixture" },
			groupBy: { enabled: false, reason: "Test fixture" },
			kanban: { enabled: false, reason: "Test fixture" },
			table: { enabled: true },
		},
		name: args.name,
		nativeColumnPath: undefined,
		nativeReadOnly: false,
		normalizedFieldKind: "primitive",
		objectDefId: "object_mortgage" as Id<"objectDefs">,
		options: undefined,
		relation: undefined,
		rendererHint: "text",
	};
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("mortgage dedicated details", () => {
	it("renders the phase-6 payment, valuation, and document blueprint context", () => {
		const detailContext = {
				borrowers: [
					{
						borrowerId: "borrower_1",
						idvStatus: "verified",
						name: "Ada Borrower",
						role: "primary",
						status: "active",
					},
				],
				documents: [
					{
						archivedAt: null,
						asset: {
							assetId: "document_asset_borrower_summary",
							fileRef: "storage_doc_1",
							name: "Borrower Summary.pdf",
							url: "https://example.com/borrower-summary.pdf",
						},
						blueprintId: "blueprint_1",
						class: "public_static",
						description: "Public borrower summary staged during origination.",
						displayName: "Borrower Summary",
						packageLabel: null,
						status: "active",
						templateName: null,
						templateVersion: null,
					},
				],
				listing: {
					interestRate: 9.5,
					listingId: "listing_1",
					ltvRatio: 62,
					principal: 250_000,
					publishedAt: null,
					status: "draft",
					title: "King West bridge opportunity",
				},
				latestValuationSnapshot: {
					createdByUserId: "user_admin_1",
					relatedDocumentAssetId: "document_asset_valuation_report",
					source: "admin_origination",
					valueAsIs: 425_000,
					valuationDate: "2026-05-01",
				},
				paymentSetup: {
					activationLastAttemptAt: new Date(
						"2026-05-01T12:00:00.000Z"
					).getTime(),
					activationLastError: "Rotessa provider timeout",
					activationRetryCount: 2,
					activationSelectedBankAccountId: "bank_account_1",
					activationStatus: "failed",
					collectionAttemptCount: 0,
					collectionExecutionMode: "app_owned",
					collectionExecutionProviderCode: null,
					collectionPlanEntries: [
						{
							amount: 2_450,
							balancePreCheck: {},
							createdAt: Date.now(),
							createdByRule: null,
							executionMode: "app_owned",
							lineage: {},
							method: "manual",
							mortgageId: "mortgage_1",
							obligationIds: ["obligation_1"],
							planEntryId: "plan_entry_1",
							relatedAttempt: null,
							reschedule: {},
							scheduledDate: new Date("2026-05-27T12:00:00.000Z").getTime(),
							source: "default_schedule",
							status: "planned",
							workoutPlan: null,
						},
					],
					collectionPlanEntryCount: 1,
					externalSchedule: {
						activatedAt: null,
						bankAccountId: "bank_account_1",
						externalScheduleRef: null,
						lastSyncErrorMessage: "Rotessa provider timeout",
						lastSyncedAt: null,
						nextPollAt: null,
						providerCode: "pad_rotessa",
						scheduleId: "schedule_1",
						status: "activation_failed",
					},
					obligationCount: 1,
					obligations: [
						{
							amount: 2_450,
							amountSettled: 0,
							dueDate: new Date("2026-06-01T12:00:00.000Z").getTime(),
							obligationId: "obligation_1",
							paymentNumber: 1,
							status: "upcoming",
							type: "regular_interest",
						},
					],
					originationCaseId: "case_1",
					scheduleRuleMissing: true,
					transferRequestCount: 0,
				},
				obligationStats: {},
				property: {
					city: "Toronto",
					postalCode: "M5H 1J9",
					propertyId: "property_1",
					propertyType: "residential",
					province: "ON",
					streetAddress: "123 King St W",
					unit: null,
				},
				recentAuditEvents: [
					{
						eventId: "audit_1",
						eventType: "ORIGINATION_COMMITTED",
						newState: "active",
						outcome: "success",
						previousState: "draft",
						timestamp: Date.now(),
					},
				],
				recentObligations: [],
			};

		const fields = [
			buildFieldDef({ displayOrder: 0, label: "Status", name: "status" }),
			buildFieldDef({
				displayOrder: 1,
				label: "Interest Rate",
				name: "interestRate",
			}),
			buildFieldDef({ displayOrder: 2, label: "Loan Type", name: "loanType" }),
			buildFieldDef({
				displayOrder: 3,
				label: "Term Months",
				name: "termMonths",
			}),
			buildFieldDef({
				displayOrder: 4,
				label: "Maturity Date",
				name: "maturityDate",
			}),
			buildFieldDef({
				displayOrder: 5,
				label: "Lien Position",
				name: "lienPosition",
			}),
			buildFieldDef({
				displayOrder: 6,
				label: "Payment Amount",
				name: "paymentAmount",
			}),
			buildFieldDef({
				displayOrder: 7,
				label: "Payment Frequency",
				name: "paymentFrequency",
			}),
			buildFieldDef({
				displayOrder: 8,
				label: "Payment Summary",
				name: "paymentSummary",
			}),
			buildFieldDef({
				displayOrder: 9,
				label: "First Payment Date",
				name: "firstPaymentDate",
			}),
			buildFieldDef({ displayOrder: 10, label: "Rate Type", name: "rateType" }),
			buildFieldDef({
				displayOrder: 11,
				label: "Listing Summary",
				name: "listingSummary",
			}),
			buildFieldDef({
				displayOrder: 12,
				label: "Property Summary",
				name: "propertySummary",
			}),
			buildFieldDef({
				displayOrder: 13,
				label: "Borrower Summary",
				name: "borrowerSummary",
			}),
			buildFieldDef({ displayOrder: 14, label: "Principal", name: "principal" }),
		];
		const record: UnifiedRecord = {
			_id: "mortgage_1",
			_kind: "native",
			createdAt: 0,
			fields: {
				borrowerSummary: "Ada Borrower",
				firstPaymentDate: "2026-06-01",
				interestRate: 9.5,
				lienPosition: 1,
				listingSummary: "King West bridge opportunity",
				loanType: "conventional",
				maturityDate: "2027-04-30",
				paymentAmount: 2_450,
				paymentFrequency: "monthly",
				paymentSummary: "Monthly • $2,450",
				principal: 250_000,
				propertySummary: "123 King St W, Toronto, ON",
				rateType: "fixed",
				status: "active",
				termMonths: 12,
			},
			objectDefId: "object_mortgage" as Id<"objectDefs">,
			updatedAt: 0,
		};

		render(
			<MortgagesDedicatedDetailsContent
				canManageMortgageDocuments
				canRetryCollectionsActivation
				detailContext={detailContext}
				detailFields={fields}
				mortgageHistory={[]}
				onArchiveBlueprint={vi.fn(async () => {})}
				onReplaceBlueprint={vi.fn()}
				onRetryCollectionsActivation={vi.fn(async () => {})}
				paymentSetup={detailContext.paymentSetup}
				record={record}
			/>
		);

		expect(screen.getByText("Summary")).toBeTruthy();
		expect(screen.getByText("Borrowers")).toBeTruthy();
		expect(screen.getByText("Payment Setup")).toBeTruthy();
		expect(screen.getByText("Listing Projection")).toBeTruthy();
		expect(screen.getByText("Documents")).toBeTruthy();
		expect(screen.getByText("Audit")).toBeTruthy();
		expect(screen.getByText("Schedule rule fallback applied")).toBeTruthy();
		expect(
			screen.getByText("Immediate Rotessa activation failed")
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Retry activation" })).toBeTruthy();
		expect(screen.getByText("External schedule schedule_1")).toBeTruthy();
		expect(screen.getByText("Open obligation")).toBeTruthy();
		expect(screen.getAllByText("Plan Entries").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Borrower Summary").length).toBeGreaterThanOrEqual(
			2
		);
		expect(
			screen.getByText("Public borrower summary staged during origination.")
		).toBeTruthy();
		expect(screen.getByRole("link", { name: "Open PDF" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
		const paymentSetupSection = screen
			.getByRole("heading", { exact: true, name: "Payment Setup" })
			.closest("section");
		expect(paymentSetupSection?.textContent).toContain("App Owned");
		expect(paymentSetupSection?.textContent).toContain("Failed");
		expect(paymentSetupSection?.textContent).toContain("Planned");
		expect(screen.getByText(/425,000/)).toBeTruthy();
		expect(screen.getByText(/2026-05-01/)).toBeTruthy();
		expect(screen.getByText("Admin Origination")).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "Ada Borrower" }).getAttribute("href")
		).toBe("/admin/borrowers/borrower_1");
		expect(
			screen
				.getByRole("link", { name: "Open property record" })
				.getAttribute("href")
		).toBe("/admin/properties/property_1");
		expect(
			screen
				.getByRole("link", { name: "Open obligation" })
				.getAttribute("href")
		).toBe("/admin/obligations/obligation_1");
	});
});
