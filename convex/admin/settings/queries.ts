import type { Doc } from "../../_generated/dataModel";
import { SYSTEM_OBJECT_CONFIGS } from "../../crm/systemAdapters/bootstrap";
import { crmAdminQuery } from "../../fluent";

export interface AdminOrgMemberSummary {
	readonly email: string | null;
	readonly firstName: string | null;
	readonly lastName: string | null;
	readonly membershipWorkosId: string;
	readonly roleSlug: string;
	readonly roleSlugs: readonly string[];
	readonly status: string;
	readonly userWorkosId: string;
}

export interface AdminOrgBootstrapStatus {
	readonly expectedSystemObjectCount: number;
	readonly isBootstrapped: boolean;
	readonly missingSystemObjectNames: readonly string[];
	readonly seededSystemObjectCount: number;
}

export interface AdminOrgSettingsSnapshot {
	readonly bootstrapStatus: AdminOrgBootstrapStatus;
	readonly members: readonly AdminOrgMemberSummary[];
	readonly organization: Doc<"organizations"> | null;
}

export const getOrgSettings = crmAdminQuery
	.handler(async (ctx): Promise<AdminOrgSettingsSnapshot | null> => {
		const orgId = ctx.viewer.orgId;
		if (!orgId) {
			return null;
		}

		const [organization, memberships, systemObjects] = await Promise.all([
			ctx.db
				.query("organizations")
				.withIndex("workosId", (q) => q.eq("workosId", orgId))
				.unique(),
			ctx.db
				.query("organizationMemberships")
				.withIndex("byOrganization", (q) => q.eq("organizationWorkosId", orgId))
				.collect(),
			ctx.db
				.query("objectDefs")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect(),
		]);

		const uniqueUserIds = Array.from(
			new Set(memberships.map((membership) => membership.userWorkosId))
		);
		const users = await Promise.all(
			uniqueUserIds.map((userId) =>
				ctx.db
					.query("users")
					.withIndex("authId", (q) => q.eq("authId", userId))
					.unique()
			)
		);
		const userByAuthId = new Map(
			users.flatMap((user) => (user ? [[user.authId, user] as const] : []))
		);

		const members: AdminOrgMemberSummary[] = memberships
			.map((membership) => {
				const user = userByAuthId.get(membership.userWorkosId);
				return {
					email: user?.email ?? null,
					firstName: user?.firstName ?? null,
					lastName: user?.lastName ?? null,
					membershipWorkosId: membership.workosId,
					roleSlug: membership.roleSlug,
					roleSlugs: membership.roleSlugs ?? [membership.roleSlug],
					status: membership.status,
					userWorkosId: membership.userWorkosId,
				};
			})
			.sort((left, right) => {
				const leftName =
					`${left.firstName ?? ""} ${left.lastName ?? ""}`.trim() ||
					left.email ||
					left.userWorkosId;
				const rightName =
					`${right.firstName ?? ""} ${right.lastName ?? ""}`.trim() ||
					right.email ||
					right.userWorkosId;
				return leftName.localeCompare(rightName);
			});

		const seededSystemObjectNames = new Set(
			systemObjects
				.filter((objectDef) => objectDef.isSystem && objectDef.isActive)
				.map((objectDef) => objectDef.name)
		);
		const missingSystemObjectNames = SYSTEM_OBJECT_CONFIGS.flatMap((config) =>
			seededSystemObjectNames.has(config.name) ? [] : [config.name]
		);
		const bootstrapStatus: AdminOrgBootstrapStatus = {
			expectedSystemObjectCount: SYSTEM_OBJECT_CONFIGS.length,
			isBootstrapped: missingSystemObjectNames.length === 0,
			missingSystemObjectNames,
			seededSystemObjectCount: seededSystemObjectNames.size,
		};

		return {
			bootstrapStatus,
			members,
			organization,
		};
	})
	.public();
