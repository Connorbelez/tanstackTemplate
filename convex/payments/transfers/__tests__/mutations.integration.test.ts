import { describe, expect, it } from "vitest";
import { FAIRLEND_STAFF_ORG_ID } from "../../../constants";
import { createTransferRequest } from "../mutations";

const WORKOS_AUTH_ID_RE = /WorkOS auth ID/;

const ADMIN_IDENTITY = {
	issuer: "https://api.workos.com",
	org_id: FAIRLEND_STAFF_ORG_ID,
	organization_name: "FairLend Staff",
	permissions: JSON.stringify(["admin:access"]),
	role: "admin",
	roles: JSON.stringify(["admin"]),
	subject: "user_fairlend_admin",
	user_email: "admin@fairlend.ca",
	user_first_name: "FairLend",
	user_last_name: "Admin",
} as const;

interface CreateTransferRequestHandler {
	_handler: (
		ctx: {
			auth: {
				getUserIdentity: () => Promise<typeof ADMIN_IDENTITY | null>;
			};
			db: {
				insert: (...args: unknown[]) => Promise<unknown>;
				query: (...args: unknown[]) => {
					withIndex: (...args: unknown[]) => {
						first: () => Promise<unknown>;
					};
				};
			};
		},
		args: {
			amount: number;
			bankAccountRef?: string;
			borrowerId?: string;
			collectionAttemptId?: string;
			counterpartyId: string;
			counterpartyType: "borrower";
			dealId?: string;
			direction: "inbound";
			dispersalEntryId?: string;
			idempotencyKey: string;
			legNumber?: number;
			lenderId?: string;
			metadata?: Record<string, unknown>;
			mortgageId?: string;
			obligationId?: string;
			pipelineId?: string;
			planEntryId?: string;
			providerCode: "manual";
			transferType: "borrower_interest_collection";
			currency?: "CAD";
		}
	) => Promise<unknown>;
}

const createTransferRequestHandler =
	createTransferRequest as unknown as CreateTransferRequestHandler;

describe("createTransferRequest counterpartyId guard", () => {
	it("rejects WorkOS auth IDs before persistence", async () => {
		const unexpectedDbCall = () => {
			throw new Error("unexpected database access");
		};

		const ctx = {
			auth: {
				getUserIdentity: async () => ADMIN_IDENTITY,
			},
			db: {
				insert: async () => {
					unexpectedDbCall();
				},
				query: () => ({
					withIndex: () => ({
						first: async () => {
							unexpectedDbCall();
						},
					}),
				}),
			},
			viewer: {
				authId: ADMIN_IDENTITY.subject,
				email: ADMIN_IDENTITY.user_email,
				firstName: ADMIN_IDENTITY.user_first_name,
				isFairLendAdmin: true,
				lastName: ADMIN_IDENTITY.user_last_name,
				orgId: ADMIN_IDENTITY.org_id,
				orgName: ADMIN_IDENTITY.organization_name,
				permissions: new Set(
					JSON.parse(ADMIN_IDENTITY.permissions) as string[]
				),
				role: ADMIN_IDENTITY.role,
				roles: new Set(JSON.parse(ADMIN_IDENTITY.roles) as string[]),
			},
		} as Parameters<CreateTransferRequestHandler["_handler"]>[0] & {
			viewer: {
				authId: string;
				email: string | undefined;
				firstName: string | undefined;
				isFairLendAdmin: boolean;
				lastName: string | undefined;
				orgId: string | undefined;
				orgName: string | undefined;
				permissions: Set<string>;
				role: string | undefined;
				roles: Set<string>;
			};
		};

		await expect(
			createTransferRequestHandler._handler(ctx, {
				amount: 100,
				counterpartyId: "user_01KKFF8EA41DV152KVHD8VJB48",
				counterpartyType: "borrower",
				direction: "inbound",
				idempotencyKey: "transfer-invalid-counterparty-id",
				providerCode: "manual",
				transferType: "borrower_interest_collection",
			})
		).rejects.toThrow(WORKOS_AUTH_ID_RE);
	});
});
