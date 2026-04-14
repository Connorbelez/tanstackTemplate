/**
 * Role-to-permission truth table.
 *
 * Maps every application role to the exact set of permissions it grants.
 * Used by test helpers to build realistic mock identities without
 * hard-coding permission lists in every test file.
 */

export const ROLE_PERMISSIONS: Record<string, string[]> = {
	admin: ["admin:access"],
	broker: [
		"broker:access",
		"onboarding:access",
		"application:create",
		"offer:create",
		"offer:manage",
		"condition:submit",
		"mortgage:service",
		"document:upload",
		"deal:view",
		"ledger:view",
		"accrual:view",
		"listing:create",
		"listing:manage",
		"listing:view",
		"renewal:acknowledge",
	],
	lender: [
		"lender:access",
		"onboarding:access",
		"deal:view",
		"ledger:view",
		"accrual:view",
		"dispersal:view",
		"listing:view",
		"listing:invest",
		"portfolio:view",
		"portfolio:signal_renewal",
		"portfolio:export_tax",
	],
	borrower: [
		"borrower:access",
		"onboarding:access",
		"condition:submit",
		"mortgage:view_own",
		"payment:view_own",
		"payment:reschedule_own",
		"document:upload",
		"document:sign",
		"renewal:signal",
	],
	lawyer: ["lawyer:access", "onboarding:access", "deal:view"],
	jr_underwriter: [
		"underwriter:access",
		"application:review",
		"underwriting:view_queue",
		"underwriting:claim",
		"underwriting:release",
		"underwriting:recommend",
		"condition:review",
		"document:review",
	],
	underwriter: [
		"underwriter:access",
		"application:review",
		"underwriting:view_queue",
		"underwriting:claim",
		"underwriting:release",
		"underwriting:decide",
		"underwriting:review_decisions",
		"underwriting:view_team_metrics",
		"condition:review",
		"document:review",
	],
	sr_underwriter: [
		"underwriter:access",
		"application:review",
		"underwriting:view_queue",
		"underwriting:claim",
		"underwriting:release",
		"underwriting:decide",
		"underwriting:review_decisions",
		"underwriting:review_samples",
		"underwriting:reassign",
		"underwriting:configure_queue",
		"underwriting:view_all",
		"underwriting:view_team_metrics",
		"condition:review",
		"document:review",
	],
	member: ["onboarding:access"],
};

export function lookupPermissions(roles: string[]): string[] {
	const merged = new Set<string>();
	for (const role of roles) {
		const perms = ROLE_PERMISSIONS[role];
		if (!perms) {
			throw new Error(`Unknown role: ${role}`);
		}
		for (const permission of perms) {
			merged.add(permission);
		}
	}
	return [...merged];
}
