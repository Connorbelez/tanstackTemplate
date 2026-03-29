import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";
import { adminMutation, adminQuery } from "../fluent";
import { orgIdFromMortgageId } from "../lib/orgScope";

const migrations = new Migrations<DataModel>(components.migrations);

const migrationRefs = internal as unknown as {
	brokers: {
		migrations: {
			backfillBrokerOrgId: never;
			backfillLenderOrgId: never;
			backfillAuditJournalOrganizationId: never;
		};
	};
};

/**
 * Sets `brokers.orgId` from the broker user's WorkOS organization membership
 * when missing (legacy rows). Uses `users.authId` as `userWorkosId` on
 * `organizationMemberships`, matching WorkOS-synced accounts.
 */
export const backfillBrokerOrgId = migrations.define({
	table: "brokers",
	migrateOne: async (ctx, broker) => {
		if (broker.orgId) {
			return;
		}
		const user = await ctx.db.get(broker.userId);
		if (!user) {
			return;
		}
		const memberships = await ctx.db
			.query("organizationMemberships")
			.withIndex("byUser", (q) => q.eq("userWorkosId", user.authId))
			.collect();
		const preferred =
			memberships.find((m) => m.status === "active") ?? memberships[0];
		if (!preferred?.organizationWorkosId) {
			return;
		}
		await ctx.db.patch(broker._id, {
			orgId: preferred.organizationWorkosId,
		});
	},
});

/** Copies `orgId` from the lender's broker when the lender row is missing it. */
export const backfillLenderOrgId = migrations.define({
	table: "lenders",
	migrateOne: async (ctx, lender) => {
		if (lender.orgId) {
			return;
		}
		const broker = await ctx.db.get(lender.brokerId);
		if (!broker?.orgId) {
			return;
		}
		await ctx.db.patch(lender._id, { orgId: broker.orgId });
	},
});

/** Best-effort `organizationId` on legacy audit journal rows for org-scoped indexes. */
export const backfillAuditJournalOrganizationId = migrations.define({
	table: "auditJournal",
	migrateOne: async (ctx, row) => {
		if (row.organizationId) {
			return;
		}

		const entityId = row.entityId;

		if (row.entityType === "broker") {
			const broker = await ctx.db.get(entityId as Id<"brokers">);
			if (broker?.orgId) {
				await ctx.db.patch(row._id, {
					organizationId: broker.orgId,
				});
			}
			return;
		}

		if (row.entityType === "mortgage") {
			const orgId = await orgIdFromMortgageId(ctx, entityId as Id<"mortgages">);
			if (orgId) {
				await ctx.db.patch(row._id, { organizationId: orgId });
			}
			return;
		}

		if (row.entityType === "obligation") {
			const obl = await ctx.db.get(entityId as Id<"obligations">);
			if (!obl) {
				return;
			}
			const orgId =
				obl.orgId ?? (await orgIdFromMortgageId(ctx, obl.mortgageId));
			if (orgId) {
				await ctx.db.patch(row._id, { organizationId: orgId });
			}
			return;
		}

		if (row.entityType === "lender") {
			const lender = await ctx.db.get(entityId as Id<"lenders">);
			if (!lender) {
				return;
			}
			const broker = await ctx.db.get(lender.brokerId);
			const orgId = lender.orgId ?? broker?.orgId;
			if (orgId) {
				await ctx.db.patch(row._id, { organizationId: orgId });
			}
		}
	},
});

export const runOrgScopeEntityBackfill = adminMutation
	.input({})
	.handler(async (ctx) => {
		await migrations.runOne(
			ctx,
			migrationRefs.brokers.migrations.backfillBrokerOrgId
		);
		await migrations.runOne(
			ctx,
			migrationRefs.brokers.migrations.backfillLenderOrgId
		);
		await migrations.runOne(
			ctx,
			migrationRefs.brokers.migrations.backfillAuditJournalOrganizationId
		);
	})
	.public();

export const getOrgScopeBackfillStatus = adminQuery
	.input({})
	.handler(async (ctx) => {
		const brokers = await ctx.db.query("brokers").collect();
		const lenders = await ctx.db.query("lenders").collect();
		const journals = await ctx.db.query("auditJournal").collect();

		return {
			brokersMissingOrgId: brokers.filter((b) => !b.orgId).length,
			lendersMissingOrgId: lenders.filter((l) => !l.orgId).length,
			auditJournalMissingOrgId: journals.filter((j) => !j.organizationId)
				.length,
		};
	})
	.public();
