type ModuleLoader = () => Promise<unknown>;
type ModuleMap = Record<string, ModuleLoader>;

process.env.ALLOW_INMEMORY_AUDIT_EVIDENCE_SINK ??= "true";

function withModuleAliases(modules: ModuleMap): ModuleMap {
	const aliasedModules: ModuleMap = { ...modules };

	for (const [key, loader] of Object.entries(modules)) {
		const keyWithoutLeadingSlash = key.startsWith("/") ? key.slice(1) : key;
		aliasedModules[keyWithoutLeadingSlash] = loader;

		if (key.startsWith("/convex/")) {
			const convexRelativeKey = key.slice("/convex/".length);
			aliasedModules[convexRelativeKey] = loader;

			if (convexRelativeKey.endsWith(".ts")) {
				aliasedModules[convexRelativeKey.slice(0, -3)] = loader;
				aliasedModules[`${convexRelativeKey.slice(0, -3)}.js`] = loader;
				aliasedModules[`${key.slice(0, -3)}.js`] = loader;
			}
		}

		if (keyWithoutLeadingSlash.endsWith(".js")) {
			aliasedModules[keyWithoutLeadingSlash.slice(0, -3)] = loader;
		}
	}

	return aliasedModules;
}

export const convexModules: ModuleMap = withModuleAliases({
	"/convex/accrual/calculateAccruedByMortgage.ts": async () =>
		await import("./../accrual/calculateAccruedByMortgage.ts"),
	"/convex/accrual/calculateAccruedInterest.ts": async () =>
		await import("./../accrual/calculateAccruedInterest.ts"),
	"/convex/accrual/calculateDailyAccrual.ts": async () =>
		await import("./../accrual/calculateDailyAccrual.ts"),
	"/convex/accrual/calculateInvestorPortfolio.ts": async () =>
		await import("./../accrual/calculateInvestorPortfolio.ts"),
	"/convex/accrual/interestMath.ts": async () =>
		await import("./../accrual/interestMath.ts"),
	"/convex/accrual/ownershipPeriods.ts": async () =>
		await import("./../accrual/ownershipPeriods.ts"),
	"/convex/accrual/queryHelpers.ts": async () =>
		await import("./../accrual/queryHelpers.ts"),
	"/convex/accrual/types.ts": async () => await import("./../accrual/types.ts"),
	"/convex/audit/queries.ts": async () => await import("./../audit/queries.ts"),
	"/convex/auditEvidence/services.ts": async () =>
		await import("./../auditEvidence/services.ts"),
	"/convex/auditLog.ts": async () => await import("./../auditLog.ts"),
	"/convex/auditTrailClient.ts": async () =>
		await import("./../auditTrailClient.ts"),
	"/convex/auth.config.ts": async () => await import("./../auth.config.ts"),
	"/convex/auth.ts": async () => await import("./../auth.ts"),
	"/convex/auth/auditAuth.ts": async () =>
		await import("./../auth/auditAuth.ts"),
	"/convex/auth/internal.ts": async () => await import("./../auth/internal.ts"),
	"/convex/auth/resourceChecks.ts": async () =>
		await import("./../auth/resourceChecks.ts"),
	"/convex/admin/origination/access.ts": async () =>
		await import("./../admin/origination/access.ts"),
	"/convex/admin/origination/caseDocuments.ts": async () =>
		await import("./../admin/origination/caseDocuments.ts"),
	"/convex/admin/origination/cases.ts": async () =>
		await import("./../admin/origination/cases.ts"),
	"/convex/admin/origination/collections.ts": async () =>
		await import("./../admin/origination/collections.ts"),
	"/convex/admin/origination/commit.ts": async () =>
		await import("./../admin/origination/commit.ts"),
	"/convex/admin/origination/validators.ts": async () =>
		await import("./../admin/origination/validators.ts"),
	"/convex/brokers/migrations.ts": async () =>
		await import("./../brokers/migrations.ts"),
	"/convex/borrowers/resolveOrProvisionForOrigination.ts": async () =>
		await import("./../borrowers/resolveOrProvisionForOrigination.ts"),
	"/convex/_generated/api.js": async () =>
		await import("./../_generated/api.js"),
	"/convex/_generated/server.js": async () =>
		await import("./../_generated/server.js"),
	"/convex/components/auditTrail/_generated/api.ts": async () =>
		await import("./../components/auditTrail/_generated/api.ts"),
	"/convex/components/auditTrail/_generated/component.ts": async () =>
		await import("./../components/auditTrail/_generated/component.ts"),
	"/convex/components/auditTrail/_generated/dataModel.ts": async () =>
		await import("./../components/auditTrail/_generated/dataModel.ts"),
	"/convex/components/auditTrail/_generated/server.ts": async () =>
		await import("./../components/auditTrail/_generated/server.ts"),
	"/convex/components/auditTrail/convex.config.ts": async () =>
		await import("./../components/auditTrail/convex.config.ts"),
	"/convex/components/auditTrail/crons.ts": async () =>
		await import("./../components/auditTrail/crons.ts"),
	"/convex/components/auditTrail/internal.ts": async () =>
		await import("./../components/auditTrail/internal.ts"),
	"/convex/components/auditTrail/lib.ts": async () =>
		await import("./../components/auditTrail/lib.ts"),
	"/convex/components/auditTrail/schema.ts": async () =>
		await import("./../components/auditTrail/schema.ts"),
	"/convex/constants.ts": async () => await import("./../constants.ts"),
	"/convex/convex.config.ts": async () => await import("./../convex.config.ts"),
	"/convex/crm/activityQueries.ts": async () =>
		await import("./../crm/activityQueries.ts"),
	"/convex/crm/calendarQuery.ts": async () =>
		await import("./../crm/calendarQuery.ts"),
	"/convex/crm/detailContextQueries.ts": async () =>
		await import("./../crm/detailContextQueries.ts"),
	"/convex/crm/fieldDefs.ts": async () => await import("./../crm/fieldDefs.ts"),
	"/convex/crm/fieldValidation.ts": async () =>
		await import("./../crm/fieldValidation.ts"),
	"/convex/crm/filterConstants.ts": async () =>
		await import("./../crm/filterConstants.ts"),
	"/convex/crm/filterOperatorValidation.ts": async () =>
		await import("./../crm/filterOperatorValidation.ts"),
	"/convex/crm/linkQueries.ts": async () =>
		await import("./../crm/linkQueries.ts"),
	"/convex/crm/linkTypes.ts": async () => await import("./../crm/linkTypes.ts"),
	"/convex/crm/metadataCompiler.ts": async () =>
		await import("./../crm/metadataCompiler.ts"),
	"/convex/crm/migrations.ts": async () =>
		await import("./../crm/migrations.ts"),
	"/convex/crm/objectDefs.ts": async () =>
		await import("./../crm/objectDefs.ts"),
	"/convex/crm/recordLinks.ts": async () =>
		await import("./../crm/recordLinks.ts"),
	"/convex/crm/recordQueries.ts": async () =>
		await import("./../crm/recordQueries.ts"),
	"/convex/crm/records.ts": async () => await import("./../crm/records.ts"),
	"/convex/crm/systemAdapters/bootstrap.ts": async () =>
		await import("./../crm/systemAdapters/bootstrap.ts"),
	"/convex/crm/systemAdapters/columnResolver.ts": async () =>
		await import("./../crm/systemAdapters/columnResolver.ts"),
	"/convex/crm/systemAdapters/queryAdapter.ts": async () =>
		await import("./../crm/systemAdapters/queryAdapter.ts"),
	"/convex/crm/types.ts": async () => await import("./../crm/types.ts"),
	"/convex/crm/userSavedViews.ts": async () =>
		await import("./../crm/userSavedViews.ts"),
	"/convex/crm/validators.ts": async () =>
		await import("./../crm/validators.ts"),
	"/convex/crm/valueRouter.ts": async () =>
		await import("./../crm/valueRouter.ts"),
	"/convex/crm/viewDefs.ts": async () => await import("./../crm/viewDefs.ts"),
	"/convex/crm/viewFields.ts": async () =>
		await import("./../crm/viewFields.ts"),
	"/convex/crm/viewFilters.ts": async () =>
		await import("./../crm/viewFilters.ts"),
	"/convex/crm/viewKanbanGroups.ts": async () =>
		await import("./../crm/viewKanbanGroups.ts"),
	"/convex/crm/viewQueries.ts": async () =>
		await import("./../crm/viewQueries.ts"),
	"/convex/crm/viewState.ts": async () => await import("./../crm/viewState.ts"),
	"/convex/crons.ts": async () => await import("./../crons.ts"),
	"/convex/dealReroutes/mutations.ts": async () =>
		await import("./../dealReroutes/mutations.ts"),
	"/convex/dealReroutes/queries.ts": async () =>
		await import("./../dealReroutes/queries.ts"),
	"/convex/deals/accessCheck.ts": async () =>
		await import("./../deals/accessCheck.ts"),
	"/convex/deals/mutations.ts": async () =>
		await import("./../deals/mutations.ts"),
	"/convex/deals/queries.ts": async () => await import("./../deals/queries.ts"),
	"/convex/demo/actionCache.ts": async () =>
		await import("./../demo/actionCache.ts"),
	"/convex/demo/aggregate.ts": async () =>
		await import("./../demo/aggregate.ts"),
	"/convex/demo/apiCredentials.ts": async () =>
		await import("./../demo/apiCredentials.ts"),
	"/convex/demo/amps.ts": async () => await import("./../demo/amps.ts"),
	"/convex/demo/ampsE2e.ts": async () => await import("./../demo/ampsE2e.ts"),
	"/convex/demo/ampsExecutionModes.ts": async () =>
		await import("./../demo/ampsExecutionModes.ts"),
	"/convex/demo/auditLog.ts": async () => await import("./../demo/auditLog.ts"),
	"/convex/demo/auditTraceability.ts": async () =>
		await import("./../demo/auditTraceability.ts"),
	"/convex/demo/cascadingDelete.ts": async () =>
		await import("./../demo/cascadingDelete.ts"),
	"/convex/demo/crons.ts": async () => await import("./../demo/crons.ts"),
	"/convex/demo/debouncer.ts": async () =>
		await import("./../demo/debouncer.ts"),
	"/convex/demo/demoLedgerSeed.ts": async () =>
		await import("./../demo/demoLedgerSeed.ts"),
	"/convex/demo/fileManagement.ts": async () =>
		await import("./../demo/fileManagement.ts"),
	"/convex/demo/fluentConvex.ts": async () =>
		await import("./../demo/fluentConvex.ts"),
	"/convex/demo/geospatial.ts": async () =>
		await import("./../demo/geospatial.ts"),
	"/convex/demo/governedTransitions.ts": async () =>
		await import("./../demo/governedTransitions.ts"),
	"/convex/demo/governedTransitionsEffects.ts": async () =>
		await import("./../demo/governedTransitionsEffects.ts"),
	"/convex/demo/ledger.ts": async () => await import("./../demo/ledger.ts"),
	"/convex/demo/machines/loanApplication.machine.ts": async () =>
		await import("./../demo/machines/loanApplication.machine.ts"),
	"/convex/demo/machines/registry.ts": async () =>
		await import("./../demo/machines/registry.ts"),
	"/convex/demo/migrations.ts": async () =>
		await import("./../demo/migrations.ts"),
	"/convex/demo/presence.ts": async () => await import("./../demo/presence.ts"),
	"/convex/demo/prodLedger.ts": async () =>
		await import("./../demo/prodLedger.ts"),
	"/convex/demo/rateLimiter.ts": async () =>
		await import("./../demo/rateLimiter.ts"),
	"/convex/demo/rbacAuth.ts": async () => await import("./../demo/rbacAuth.ts"),
	"/convex/demo/simulation.ts": async () =>
		await import("./../demo/simulation.ts"),
	"/convex/demo/timeline.ts": async () => await import("./../demo/timeline.ts"),
	"/convex/demo/tracer.ts": async () => await import("./../demo/tracer.ts"),
	"/convex/demo/triggers.ts": async () => await import("./../demo/triggers.ts"),
	"/convex/demo/workflow.ts": async () => await import("./../demo/workflow.ts"),
	"/convex/demo/workosAuth.ts": async () =>
		await import("./../demo/workosAuth.ts"),
	"/convex/dispersal/createDispersalEntries.ts": async () =>
		await import("./../dispersal/createDispersalEntries.ts"),
	"/convex/dispersal/disbursementBridge.ts": async () =>
		await import("./../dispersal/disbursementBridge.ts"),
	"/convex/dispersal/holdPeriod.ts": async () =>
		await import("./../dispersal/holdPeriod.ts"),
	"/convex/dispersal/lenderIdentity.ts": async () =>
		await import("./../dispersal/lenderIdentity.ts"),
	"/convex/dispersal/queries.ts": async () =>
		await import("./../dispersal/queries.ts"),
	"/convex/dispersal/selfHealing.ts": async () =>
		await import("./../dispersal/selfHealing.ts"),
	"/convex/dispersal/selfHealingTypes.ts": async () =>
		await import("./../dispersal/selfHealingTypes.ts"),
	"/convex/dispersal/servicingFee.ts": async () =>
		await import("./../dispersal/servicingFee.ts"),
	"/convex/dispersal/types.ts": async () =>
		await import("./../dispersal/types.ts"),
	"/convex/dispersal/validators.ts": async () =>
		await import("./../dispersal/validators.ts"),
	"/convex/documentEngine/basePdfs.ts": async () =>
		await import("./../documentEngine/basePdfs.ts"),
	"/convex/documentEngine/dataModelEntities.ts": async () =>
		await import("./../documentEngine/dataModelEntities.ts"),
	"/convex/documents/assets.ts": async () =>
		await import("./../documents/assets.ts"),
	"/convex/documents/contracts.ts": async () =>
		await import("./../documents/contracts.ts"),
	"/convex/documents/dealPackages.ts": async () =>
		await import("./../documents/dealPackages.ts"),
	"/convex/documents/mortgageBlueprints.ts": async () =>
		await import("./../documents/mortgageBlueprints.ts"),
	"/convex/documentEngine/generation.ts": async () =>
		await import("./../documentEngine/generation.ts"),
	"/convex/documentEngine/generationHelpers.ts": async () =>
		await import("./../documentEngine/generationHelpers.ts"),
	"/convex/documentEngine/systemVariables.ts": async () =>
		await import("./../documentEngine/systemVariables.ts"),
	"/convex/documentEngine/templateGroups.ts": async () =>
		await import("./../documentEngine/templateGroups.ts"),
	"/convex/documentEngine/templates.ts": async () =>
		await import("./../documentEngine/templates.ts"),
	"/convex/documentEngine/templateTimeline.ts": async () =>
		await import("./../documentEngine/templateTimeline.ts"),
	"/convex/documentEngine/templateVersions.ts": async () =>
		await import("./../documentEngine/templateVersions.ts"),
	"/convex/documentEngine/validators.ts": async () =>
		await import("./../documentEngine/validators.ts"),
	"/convex/engine/auditJournal.ts": async () =>
		await import("./../engine/auditJournal.ts"),
	"/convex/engine/commands.ts": async () =>
		await import("./../engine/commands.ts"),
	"/convex/engine/effects/collectionAttempt.ts": async () =>
		await import("./../engine/effects/collectionAttempt.ts"),
	"/convex/engine/effects/dealAccess.ts": async () =>
		await import("./../engine/effects/dealAccess.ts"),
	"/convex/engine/effects/dealClosing.ts": async () =>
		await import("./../engine/effects/dealClosing.ts"),
	"/convex/engine/effects/dealClosingEffects.ts": async () =>
		await import("./../engine/effects/dealClosingEffects.ts"),
	"/convex/engine/effects/dealClosingPayments.ts": async () =>
		await import("./../engine/effects/dealClosingPayments.ts"),
	"/convex/engine/effects/dealClosingPlaceholder.ts": async () =>
		await import("./../engine/effects/dealClosingPlaceholder.ts"),
	"/convex/engine/effects/dealClosingProrate.ts": async () =>
		await import("./../engine/effects/dealClosingProrate.ts"),
	"/convex/engine/effects/obligation.ts": async () =>
		await import("./../engine/effects/obligation.ts"),
	"/convex/engine/effects/obligationAccrual.ts": async () =>
		await import("./../engine/effects/obligationAccrual.ts"),
	"/convex/engine/effects/obligationLateFee.ts": async () =>
		await import("./../engine/effects/obligationLateFee.ts"),
	"/convex/engine/effects/obligationPayment.ts": async () =>
		await import("./../engine/effects/obligationPayment.ts"),
	"/convex/engine/effects/obligationWaiver.ts": async () =>
		await import("./../engine/effects/obligationWaiver.ts"),
	"/convex/engine/effects/onboarding.ts": async () =>
		await import("./../engine/effects/onboarding.ts"),
	"/convex/engine/effects/registry.ts": async () =>
		await import("./../engine/effects/registry.ts"),
	"/convex/engine/effects/transfer.ts": async () =>
		await import("./../engine/effects/transfer.ts"),
	"/convex/engine/effects/workosProvisioning.ts": async () =>
		await import("./../engine/effects/workosProvisioning.ts"),
	"/convex/engine/hashChain.ts": async () =>
		await import("./../engine/hashChain.ts"),
	"/convex/engine/machines/collectionAttempt.machine.ts": async () =>
		await import("./../engine/machines/collectionAttempt.machine.ts"),
	"/convex/engine/machines/deal.machine.ts": async () =>
		await import("./../engine/machines/deal.machine.ts"),
	"/convex/engine/machines/mortgage.machine.ts": async () =>
		await import("./../engine/machines/mortgage.machine.ts"),
	"/convex/engine/machines/obligation.machine.ts": async () =>
		await import("./../engine/machines/obligation.machine.ts"),
	"/convex/engine/machines/onboardingRequest.machine.ts": async () =>
		await import("./../engine/machines/onboardingRequest.machine.ts"),
	"/convex/engine/machines/registry.ts": async () =>
		await import("./../engine/machines/registry.ts"),
	"/convex/engine/machines/transfer.machine.ts": async () =>
		await import("./../engine/machines/transfer.machine.ts"),
	"/convex/engine/reconciliation.ts": async () =>
		await import("./../engine/reconciliation.ts"),
	"/convex/engine/reconciliationAction.ts": async () =>
		await import("./../engine/reconciliationAction.ts"),
	"/convex/engine/serialization.ts": async () =>
		await import("./../engine/serialization.ts"),
	"/convex/engine/transition.ts": async () =>
		await import("./../engine/transition.ts"),
	"/convex/engine/transitionMutation.ts": async () =>
		await import("./../engine/transitionMutation.ts"),
	"/convex/engine/types.ts": async () => await import("./../engine/types.ts"),
	"/convex/engine/validators.ts": async () =>
		await import("./../engine/validators.ts"),
	"/convex/fees/config.ts": async () => await import("./../fees/config.ts"),
	"/convex/fees/migrations.ts": async () =>
		await import("./../fees/migrations.ts"),
	"/convex/fees/queries.ts": async () => await import("./../fees/queries.ts"),
	"/convex/fees/resolver.ts": async () => await import("./../fees/resolver.ts"),
	"/convex/fees/validators.ts": async () =>
		await import("./../fees/validators.ts"),
	"/convex/fluent.ts": async () => await import("./../fluent.ts"),
	"/convex/http.ts": async () => await import("./../http.ts"),
	"/convex/ledger/accountOwnership.ts": async () =>
		await import("./../ledger/accountOwnership.ts"),
	"/convex/ledger/accounts.ts": async () =>
		await import("./../ledger/accounts.ts"),
	"/convex/ledger/bootstrap.ts": async () =>
		await import("./../ledger/bootstrap.ts"),
	"/convex/ledger/constants.ts": async () =>
		await import("./../ledger/constants.ts"),
	"/convex/ledger/cursors.ts": async () =>
		await import("./../ledger/cursors.ts"),
	"/convex/ledger/migrations.ts": async () =>
		await import("./../ledger/migrations.ts"),
	"/convex/ledger/mutations.ts": async () =>
		await import("./../ledger/mutations.ts"),
	"/convex/ledger/postEntry.ts": async () =>
		await import("./../ledger/postEntry.ts"),
	"/convex/ledger/queries.ts": async () =>
		await import("./../ledger/queries.ts"),
	"/convex/ledger/sequenceCounter.ts": async () =>
		await import("./../ledger/sequenceCounter.ts"),
	"/convex/ledger/types.ts": async () => await import("./../ledger/types.ts"),
	"/convex/ledger/validation.ts": async () =>
		await import("./../ledger/validation.ts"),
	"/convex/ledger/validators.ts": async () =>
		await import("./../ledger/validators.ts"),
	"/convex/listings/create.ts": async () =>
		await import("./../listings/create.ts"),
	"/convex/listings/curation.ts": async () =>
		await import("./../listings/curation.ts"),
	"/convex/listings/projection.ts": async () =>
		await import("./../listings/projection.ts"),
	"/convex/listings/publicDocuments.ts": async () =>
		await import("./../listings/publicDocuments.ts"),
	"/convex/listings/queries.ts": async () =>
		await import("./../listings/queries.ts"),
	"/convex/listings/validators.ts": async () =>
		await import("./../listings/validators.ts"),
	"/convex/lib/businessDates.ts": async () =>
		await import("./../lib/businessDates.ts"),
	"/convex/lib/businessDays.ts": async () =>
		await import("./../lib/businessDays.ts"),
	"/convex/lib/orgScope.ts": async () => await import("./../lib/orgScope.ts"),
	"/convex/mortgages/activateMortgageAggregate.ts": async () =>
		await import("./../mortgages/activateMortgageAggregate.ts"),
	"/convex/mortgages/paymentFrequency.ts": async () =>
		await import("./../mortgages/paymentFrequency.ts"),
	"/convex/mortgages/provenance.ts": async () =>
		await import("./../mortgages/provenance.ts"),
	"/convex/mortgages/queries.ts": async () =>
		await import("./../mortgages/queries.ts"),
	"/convex/mortgages/valuation.ts": async () =>
		await import("./../mortgages/valuation.ts"),
	"/convex/numbers.ts": async () => await import("./../numbers.ts"),
	"/convex/obligations/mutations.ts": async () =>
		await import("./../obligations/mutations.ts"),
	"/convex/obligations/queries.ts": async () =>
		await import("./../obligations/queries.ts"),
	"/convex/onboarding/internal.ts": async () =>
		await import("./../onboarding/internal.ts"),
	"/convex/onboarding/mutations.ts": async () =>
		await import("./../onboarding/mutations.ts"),
	"/convex/onboarding/queries.ts": async () =>
		await import("./../onboarding/queries.ts"),
	"/convex/onboarding/validators.ts": async () =>
		await import("./../onboarding/validators.ts"),
	"/convex/payments/bankAccounts/mutations.ts": async () =>
		await import("./../payments/bankAccounts/mutations.ts"),
	"/convex/payments/bankAccounts/queries.ts": async () =>
		await import("./../payments/bankAccounts/queries.ts"),
	"/convex/payments/bankAccounts/types.ts": async () =>
		await import("./../payments/bankAccounts/types.ts"),
	"/convex/payments/bankAccounts/validation.ts": async () =>
		await import("./../payments/bankAccounts/validation.ts"),
	"/convex/payments/adminDashboard/queries.ts": async () =>
		await import("./../payments/adminDashboard/queries.ts"),
	"/convex/payments/cashLedger/accounts.ts": async () =>
		await import("./../payments/cashLedger/accounts.ts"),
	"/convex/payments/cashLedger/disbursementGate.ts": async () =>
		await import("./../payments/cashLedger/disbursementGate.ts"),
	"/convex/payments/cashLedger/hashChain.ts": async () =>
		await import("./../payments/cashLedger/hashChain.ts"),
	"/convex/payments/cashLedger/integrations.ts": async () =>
		await import("./../payments/cashLedger/integrations.ts"),
	"/convex/payments/cashLedger/mutations.ts": async () =>
		await import("./../payments/cashLedger/mutations.ts"),
	"/convex/payments/cashLedger/postEntry.ts": async () =>
		await import("./../payments/cashLedger/postEntry.ts"),
	"/convex/payments/cashLedger/postingGroups.ts": async () =>
		await import("./../payments/cashLedger/postingGroups.ts"),
	"/convex/payments/cashLedger/queries.ts": async () =>
		await import("./../payments/cashLedger/queries.ts"),
	"/convex/payments/cashLedger/reconciliation.ts": async () =>
		await import("./../payments/cashLedger/reconciliation.ts"),
	"/convex/payments/cashLedger/reconciliationCron.ts": async () =>
		await import("./../payments/cashLedger/reconciliationCron.ts"),
	"/convex/payments/cashLedger/reconciliationQueries.ts": async () =>
		await import("./../payments/cashLedger/reconciliationQueries.ts"),
	"/convex/payments/cashLedger/reconciliationSuite.ts": async () =>
		await import("./../payments/cashLedger/reconciliationSuite.ts"),
	"/convex/payments/cashLedger/replayIntegrity.ts": async () =>
		await import("./../payments/cashLedger/replayIntegrity.ts"),
	"/convex/payments/cashLedger/sequenceCounter.ts": async () =>
		await import("./../payments/cashLedger/sequenceCounter.ts"),
	"/convex/payments/cashLedger/transferHealingTypes.ts": async () =>
		await import("./../payments/cashLedger/transferHealingTypes.ts"),
	"/convex/payments/cashLedger/transferReconciliation.ts": async () =>
		await import("./../payments/cashLedger/transferReconciliation.ts"),
	"/convex/payments/cashLedger/transferReconciliationCron.ts": async () =>
		await import("./../payments/cashLedger/transferReconciliationCron.ts"),
	"/convex/payments/cashLedger/types.ts": async () =>
		await import("./../payments/cashLedger/types.ts"),
	"/convex/payments/cashLedger/validators.ts": async () =>
		await import("./../payments/cashLedger/validators.ts"),
	"/convex/payments/cashLedger/waiveObligationBalanceHandler.ts": async () =>
		await import("./../payments/cashLedger/waiveObligationBalanceHandler.ts"),
	"/convex/payments/collectionPlan/engine.ts": async () =>
		await import("./../payments/collectionPlan/engine.ts"),
	"/convex/payments/collectionPlan/admin.ts": async () =>
		await import("./../payments/collectionPlan/admin.ts"),
	"/convex/payments/collectionPlan/mutations.ts": async () =>
		await import("./../payments/collectionPlan/mutations.ts"),
	"/convex/payments/collectionPlan/queries.ts": async () =>
		await import("./../payments/collectionPlan/queries.ts"),
	"/convex/payments/collectionPlan/readModels.ts": async () =>
		await import("./../payments/collectionPlan/readModels.ts"),
	"/convex/payments/collectionPlan/reschedule.ts": async () =>
		await import("./../payments/collectionPlan/reschedule.ts"),
	"/convex/payments/collectionPlan/rules/lateFeeRule.ts": async () =>
		await import("./../payments/collectionPlan/rules/lateFeeRule.ts"),
	"/convex/payments/collectionPlan/rules/retryRule.ts": async () =>
		await import("./../payments/collectionPlan/rules/retryRule.ts"),
	"/convex/payments/collectionPlan/rules/scheduleRule.ts": async () =>
		await import("./../payments/collectionPlan/rules/scheduleRule.ts"),
	"/convex/payments/collectionPlan/runner.ts": async () =>
		await import("./../payments/collectionPlan/runner.ts"),
	"/convex/payments/collectionPlan/seed.ts": async () =>
		await import("./../payments/collectionPlan/seed.ts"),
	"/convex/payments/collectionPlan/stubs.ts": async () =>
		await import("./../payments/collectionPlan/stubs.ts"),
	"/convex/payments/collectionPlan/workout.ts": async () =>
		await import("./../payments/collectionPlan/workout.ts"),
	"/convex/payments/dispersal/stubs.ts": async () =>
		await import("./../payments/dispersal/stubs.ts"),
	"/convex/payments/obligations/createCorrectiveObligation.ts": async () =>
		await import("./../payments/obligations/createCorrectiveObligation.ts"),
	"/convex/payments/obligations/crons.ts": async () =>
		await import("./../payments/obligations/crons.ts"),
	"/convex/payments/obligations/generate.ts": async () =>
		await import("./../payments/obligations/generate.ts"),
	"/convex/payments/obligations/generateImpl.ts": async () =>
		await import("./../payments/obligations/generateImpl.ts"),
	"/convex/payments/obligations/monitoring.ts": async () =>
		await import("./../payments/obligations/monitoring.ts"),
	"/convex/payments/obligations/queries.ts": async () =>
		await import("./../payments/obligations/queries.ts"),
	"/convex/payments/payout/adminPayout.ts": async () =>
		await import("./../payments/payout/adminPayout.ts"),
	"/convex/payments/payout/batchPayout.ts": async () =>
		await import("./../payments/payout/batchPayout.ts"),
	"/convex/payments/payout/config.ts": async () =>
		await import("./../payments/payout/config.ts"),
	"/convex/payments/payout/mutations.ts": async () =>
		await import("./../payments/payout/mutations.ts"),
	"/convex/payments/payout/queries.ts": async () =>
		await import("./../payments/payout/queries.ts"),
	"/convex/payments/payout/refs.ts": async () =>
		await import("./../payments/payout/refs.ts"),
	"/convex/payments/payout/transferOwnedFlow.ts": async () =>
		await import("./../payments/payout/transferOwnedFlow.ts"),
	"/convex/payments/payout/validators.ts": async () =>
		await import("./../payments/payout/validators.ts"),
	"/convex/payments/recurringSchedules/activation.ts": async () =>
		await import("./../payments/recurringSchedules/activation.ts"),
	"/convex/payments/recurringSchedules/occurrenceIngestion.ts": async () =>
		await import("./../payments/recurringSchedules/occurrenceIngestion.ts"),
	"/convex/payments/recurringSchedules/poller.ts": async () =>
		await import("./../payments/recurringSchedules/poller.ts"),
	"/convex/payments/recurringSchedules/providers/rotessaRecurring.ts":
		async () =>
			await import(
				"./../payments/recurringSchedules/providers/rotessaRecurring.ts"
			),
	"/convex/payments/recurringSchedules/queries.ts": async () =>
		await import("./../payments/recurringSchedules/queries.ts"),
	"/convex/payments/recurringSchedules/rotessaCustomerReference.ts": async () =>
		await import(
			"./../payments/recurringSchedules/rotessaCustomerReference.ts"
		),
	"/convex/payments/recurringSchedules/types.ts": async () =>
		await import("./../payments/recurringSchedules/types.ts"),
	"/convex/payments/rotessa/api.ts": async () =>
		await import("./../payments/rotessa/api.ts"),
	"/convex/payments/rotessa/financialTransactions.ts": async () =>
		await import("./../payments/rotessa/financialTransactions.ts"),
	"/convex/payments/transfers/depositCollection.logic.ts": async () =>
		await import("./../payments/transfers/depositCollection.logic.ts"),
	"/convex/payments/transfers/depositCollection.ts": async () =>
		await import("./../payments/transfers/depositCollection.ts"),
	"/convex/payments/transfers/interface.ts": async () =>
		await import("./../payments/transfers/interface.ts"),
	"/convex/payments/transfers/mockProviders.ts": async () =>
		await import("./../payments/transfers/mockProviders.ts"),
	"/convex/payments/transfers/mutations.ts": async () =>
		await import("./../payments/transfers/mutations.ts"),
	"/convex/payments/transfers/pipeline.ts": async () =>
		await import("./../payments/transfers/pipeline.ts"),
	"/convex/payments/transfers/pipeline.types.ts": async () =>
		await import("./../payments/transfers/pipeline.types.ts"),
	"/convex/payments/transfers/principalReturn.logic.ts": async () =>
		await import("./../payments/transfers/principalReturn.logic.ts"),
	"/convex/payments/transfers/principalReturn.ts": async () =>
		await import("./../payments/transfers/principalReturn.ts"),
	"/convex/payments/transfers/providers/manual.ts": async () =>
		await import("./../payments/transfers/providers/manual.ts"),
	"/convex/payments/transfers/providers/manualReview.ts": async () =>
		await import("./../payments/transfers/providers/manualReview.ts"),
	"/convex/payments/collectionPlan/execution.ts": async () =>
		await import("./../payments/collectionPlan/execution.ts"),
	"/convex/payments/transfers/providers/mock.ts": async () =>
		await import("./../payments/transfers/providers/mock.ts"),
	"/convex/payments/transfers/providers/rotessa.ts": async () =>
		await import("./../payments/transfers/providers/rotessa.ts"),
	"/convex/payments/transfers/providers/registry.ts": async () =>
		await import("./../payments/transfers/providers/registry.ts"),
	"/convex/payments/transfers/queries.ts": async () =>
		await import("./../payments/transfers/queries.ts"),
	"/convex/payments/transfers/reconciliation.ts": async () =>
		await import("./../payments/transfers/reconciliation.ts"),
	"/convex/payments/transfers/types.ts": async () =>
		await import("./../payments/transfers/types.ts"),
	"/convex/payments/transfers/validators.ts": async () =>
		await import("./../payments/transfers/validators.ts"),
	"/convex/payments/webhooks/eftVopay.ts": async () =>
		await import("./../payments/webhooks/eftVopay.ts"),
	"/convex/payments/webhooks/handleReversal.ts": async () =>
		await import("./../payments/webhooks/handleReversal.ts"),
	"/convex/payments/webhooks/processReversal.ts": async () =>
		await import("./../payments/webhooks/processReversal.ts"),
	"/convex/payments/webhooks/rotessa.ts": async () =>
		await import("./../payments/webhooks/rotessa.ts"),
	"/convex/payments/webhooks/rotessaPad.ts": async () =>
		await import("./../payments/webhooks/rotessaPad.ts"),
	"/convex/payments/webhooks/stripe.ts": async () =>
		await import("./../payments/webhooks/stripe.ts"),
	"/convex/payments/webhooks/transferCore.ts": async () =>
		await import("./../payments/webhooks/transferCore.ts"),
	"/convex/payments/webhooks/types.ts": async () =>
		await import("./../payments/webhooks/types.ts"),
	"/convex/payments/webhooks/utils.ts": async () =>
		await import("./../payments/webhooks/utils.ts"),
	"/convex/payments/webhooks/vopay.ts": async () =>
		await import("./../payments/webhooks/vopay.ts"),
	"/convex/prorateEntries/mutations.ts": async () =>
		await import("./../prorateEntries/mutations.ts"),
	"/convex/prorateEntries/queries.ts": async () =>
		await import("./../prorateEntries/queries.ts"),
	"/convex/schema.ts": async () => await import("./../schema.ts"),
	"/convex/seed/seedAll.ts": async () => await import("./../seed/seedAll.ts"),
	"/convex/seed/seedBorrower.ts": async () =>
		await import("./../seed/seedBorrower.ts"),
	"/convex/seed/seedBroker.ts": async () =>
		await import("./../seed/seedBroker.ts"),
	"/convex/seed/seedDeal.ts": async () => await import("./../seed/seedDeal.ts"),
	"/convex/seed/seedHelpers.ts": async () =>
		await import("./../seed/seedHelpers.ts"),
	"/convex/seed/seedLender.ts": async () =>
		await import("./../seed/seedLender.ts"),
	"/convex/seed/seedMortgage.ts": async () =>
		await import("./../seed/seedMortgage.ts"),
	"/convex/seed/seedObligation.ts": async () =>
		await import("./../seed/seedObligation.ts"),
	"/convex/seed/seedObligationStates.ts": async () =>
		await import("./../seed/seedObligationStates.ts"),
	"/convex/seed/seedOnboardingRequest.ts": async () =>
		await import("./../seed/seedOnboardingRequest.ts"),
	"/convex/seed/seedPaymentData.ts": async () =>
		await import("./../seed/seedPaymentData.ts"),
	"/convex/test/authTestEndpoints.ts": async () =>
		await import("./authTestEndpoints.ts"),
	"/convex/test/moduleMaps.ts": async () => await import("./moduleMaps.ts"),
	"/convex/todos.ts": async () => await import("./../todos.ts"),
});

export const auditTrailModules: ModuleMap = withModuleAliases({
	"/convex/components/auditTrail/_generated/api.ts": async () =>
		await import("./../components/auditTrail/_generated/api.ts"),
	"/convex/components/auditTrail/_generated/component.ts": async () =>
		await import("./../components/auditTrail/_generated/component.ts"),
	"/convex/components/auditTrail/_generated/dataModel.ts": async () =>
		await import("./../components/auditTrail/_generated/dataModel.ts"),
	"/convex/components/auditTrail/_generated/server.ts": async () =>
		await import("./../components/auditTrail/_generated/server.ts"),
	"/convex/components/auditTrail/convex.config.ts": async () =>
		await import("./../components/auditTrail/convex.config.ts"),
	"/convex/components/auditTrail/crons.ts": async () =>
		await import("./../components/auditTrail/crons.ts"),
	"/convex/components/auditTrail/internal.ts": async () =>
		await import("./../components/auditTrail/internal.ts"),
	"/convex/components/auditTrail/lib.ts": async () =>
		await import("./../components/auditTrail/lib.ts"),
	"/convex/components/auditTrail/schema.ts": async () =>
		await import("./../components/auditTrail/schema.ts"),
});

export const workflowModules: ModuleMap = withModuleAliases({
	"/node_modules/@convex-dev/workflow/dist/component/_generated/api.js":
		async () =>
			await import(
				"./../../node_modules/@convex-dev/workflow/dist/component/_generated/api.js"
			),
	"/node_modules/@convex-dev/workflow/dist/component/_generated/component.js":
		async () =>
			await import(
				"./../../node_modules/@convex-dev/workflow/dist/component/_generated/component.js"
			),
	"/node_modules/@convex-dev/workflow/dist/component/_generated/dataModel.js":
		async () =>
			await import(
				"./../../node_modules/@convex-dev/workflow/dist/component/_generated/dataModel.js"
			),
	"/node_modules/@convex-dev/workflow/dist/component/_generated/server.js":
		async () =>
			await import(
				"./../../node_modules/@convex-dev/workflow/dist/component/_generated/server.js"
			),
	"/node_modules/@convex-dev/workflow/dist/component/convex.config.js":
		async () =>
			await import(
				"./../../node_modules/@convex-dev/workflow/dist/component/convex.config.js"
			),
	"/node_modules/@convex-dev/workflow/dist/component/event.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workflow/dist/component/event.js"
		),
	"/node_modules/@convex-dev/workflow/dist/component/journal.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workflow/dist/component/journal.js"
		),
	"/node_modules/@convex-dev/workflow/dist/component/logging.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workflow/dist/component/logging.js"
		),
	"/node_modules/@convex-dev/workflow/dist/component/model.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workflow/dist/component/model.js"
		),
	"/node_modules/@convex-dev/workflow/dist/component/pool.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workflow/dist/component/pool.js"
		),
	"/node_modules/@convex-dev/workflow/dist/component/schema.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workflow/dist/component/schema.js"
		),
	"/node_modules/@convex-dev/workflow/dist/component/utils.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workflow/dist/component/utils.js"
		),
	"/node_modules/@convex-dev/workflow/dist/component/workflow.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workflow/dist/component/workflow.js"
		),
});

export const workpoolModules: ModuleMap = withModuleAliases({
	"/node_modules/@convex-dev/workpool/dist/component/_generated/api.js":
		async () =>
			await import(
				"./../../node_modules/@convex-dev/workpool/dist/component/_generated/api.js"
			),
	"/node_modules/@convex-dev/workpool/dist/component/_generated/component.js":
		async () =>
			await import(
				"./../../node_modules/@convex-dev/workpool/dist/component/_generated/component.js"
			),
	"/node_modules/@convex-dev/workpool/dist/component/_generated/dataModel.js":
		async () =>
			await import(
				"./../../node_modules/@convex-dev/workpool/dist/component/_generated/dataModel.js"
			),
	"/node_modules/@convex-dev/workpool/dist/component/_generated/server.js":
		async () =>
			await import(
				"./../../node_modules/@convex-dev/workpool/dist/component/_generated/server.js"
			),
	"/node_modules/@convex-dev/workpool/dist/component/complete.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/complete.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/config.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/config.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/convex.config.js":
		async () =>
			await import(
				"./../../node_modules/@convex-dev/workpool/dist/component/convex.config.js"
			),
	"/node_modules/@convex-dev/workpool/dist/component/crons.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/crons.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/danger.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/danger.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/kick.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/kick.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/lib.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/lib.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/logging.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/logging.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/loop.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/loop.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/recovery.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/recovery.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/schema.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/schema.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/shared.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/shared.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/stats.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/stats.js"
		),
	"/node_modules/@convex-dev/workpool/dist/component/worker.js": async () =>
		await import(
			"./../../node_modules/@convex-dev/workpool/dist/component/worker.js"
		),
});
