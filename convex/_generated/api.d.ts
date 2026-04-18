/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accrual_calculateAccruedByMortgage from "../accrual/calculateAccruedByMortgage.js";
import type * as accrual_calculateAccruedInterest from "../accrual/calculateAccruedInterest.js";
import type * as accrual_calculateDailyAccrual from "../accrual/calculateDailyAccrual.js";
import type * as accrual_calculateInvestorPortfolio from "../accrual/calculateInvestorPortfolio.js";
import type * as accrual_interestMath from "../accrual/interestMath.js";
import type * as accrual_ownershipPeriods from "../accrual/ownershipPeriods.js";
import type * as accrual_queryHelpers from "../accrual/queryHelpers.js";
import type * as accrual_types from "../accrual/types.js";
import type * as admin_origination_access from "../admin/origination/access.js";
import type * as admin_origination_caseDocuments from "../admin/origination/caseDocuments.js";
import type * as admin_origination_cases from "../admin/origination/cases.js";
import type * as admin_origination_collections from "../admin/origination/collections.js";
import type * as admin_origination_commit from "../admin/origination/commit.js";
import type * as admin_origination_validators from "../admin/origination/validators.js";
import type * as admin_queries from "../admin/queries.js";
import type * as audit_queries from "../audit/queries.js";
import type * as auditEvidence_services from "../auditEvidence/services.js";
import type * as auditLog from "../auditLog.js";
import type * as auditTrailClient from "../auditTrailClient.js";
import type * as auth from "../auth.js";
import type * as auth_auditAuth from "../auth/auditAuth.js";
import type * as auth_internal from "../auth/internal.js";
import type * as auth_permissionCatalog from "../auth/permissionCatalog.js";
import type * as auth_resourceChecks from "../auth/resourceChecks.js";
import type * as borrowers_resolveOrProvisionForOrigination from "../borrowers/resolveOrProvisionForOrigination.js";
import type * as brokers_migrations from "../brokers/migrations.js";
import type * as constants from "../constants.js";
import type * as crm_activityQueries from "../crm/activityQueries.js";
import type * as crm_calendarQuery from "../crm/calendarQuery.js";
import type * as crm_detailContextQueries from "../crm/detailContextQueries.js";
import type * as crm_entityAdapterRegistry from "../crm/entityAdapterRegistry.js";
import type * as crm_entityViewFields from "../crm/entityViewFields.js";
import type * as crm_entityViewHydration from "../crm/entityViewHydration.js";
import type * as crm_fieldDefs from "../crm/fieldDefs.js";
import type * as crm_fieldValidation from "../crm/fieldValidation.js";
import type * as crm_filterConstants from "../crm/filterConstants.js";
import type * as crm_filterOperatorValidation from "../crm/filterOperatorValidation.js";
import type * as crm_linkQueries from "../crm/linkQueries.js";
import type * as crm_linkTypes from "../crm/linkTypes.js";
import type * as crm_metadataCompiler from "../crm/metadataCompiler.js";
import type * as crm_migrations from "../crm/migrations.js";
import type * as crm_objectDefs from "../crm/objectDefs.js";
import type * as crm_recordLinks from "../crm/recordLinks.js";
import type * as crm_recordQueries from "../crm/recordQueries.js";
import type * as crm_records from "../crm/records.js";
import type * as crm_relationCellPayloads from "../crm/relationCellPayloads.js";
import type * as crm_systemAdapters_bootstrap from "../crm/systemAdapters/bootstrap.js";
import type * as crm_systemAdapters_columnResolver from "../crm/systemAdapters/columnResolver.js";
import type * as crm_systemAdapters_queryAdapter from "../crm/systemAdapters/queryAdapter.js";
import type * as crm_types from "../crm/types.js";
import type * as crm_userSavedViews from "../crm/userSavedViews.js";
import type * as crm_validators from "../crm/validators.js";
import type * as crm_valueRouter from "../crm/valueRouter.js";
import type * as crm_viewDefs from "../crm/viewDefs.js";
import type * as crm_viewFields from "../crm/viewFields.js";
import type * as crm_viewFilters from "../crm/viewFilters.js";
import type * as crm_viewKanbanGroups from "../crm/viewKanbanGroups.js";
import type * as crm_viewQueries from "../crm/viewQueries.js";
import type * as crm_viewState from "../crm/viewState.js";
import type * as crons from "../crons.js";
import type * as dealReroutes_mutations from "../dealReroutes/mutations.js";
import type * as dealReroutes_queries from "../dealReroutes/queries.js";
import type * as deals_accessCheck from "../deals/accessCheck.js";
import type * as deals_mutations from "../deals/mutations.js";
import type * as deals_queries from "../deals/queries.js";
import type * as demo_actionCache from "../demo/actionCache.js";
import type * as demo_aggregate from "../demo/aggregate.js";
import type * as demo_amps from "../demo/amps.js";
import type * as demo_ampsE2e from "../demo/ampsE2e.js";
import type * as demo_ampsExecutionModes from "../demo/ampsExecutionModes.js";
import type * as demo_apiCredentials from "../demo/apiCredentials.js";
import type * as demo_auditLog from "../demo/auditLog.js";
import type * as demo_auditTraceability from "../demo/auditTraceability.js";
import type * as demo_cascadingDelete from "../demo/cascadingDelete.js";
import type * as demo_crmSandbox from "../demo/crmSandbox.js";
import type * as demo_crons from "../demo/crons.js";
import type * as demo_debouncer from "../demo/debouncer.js";
import type * as demo_demoLedgerSeed from "../demo/demoLedgerSeed.js";
import type * as demo_fileManagement from "../demo/fileManagement.js";
import type * as demo_fluentConvex from "../demo/fluentConvex.js";
import type * as demo_geospatial from "../demo/geospatial.js";
import type * as demo_governedTransitions from "../demo/governedTransitions.js";
import type * as demo_governedTransitionsEffects from "../demo/governedTransitionsEffects.js";
import type * as demo_ledger from "../demo/ledger.js";
import type * as demo_machines_registry from "../demo/machines/registry.js";
import type * as demo_migrations from "../demo/migrations.js";
import type * as demo_presence from "../demo/presence.js";
import type * as demo_prodLedger from "../demo/prodLedger.js";
import type * as demo_rateLimiter from "../demo/rateLimiter.js";
import type * as demo_rbacAuth from "../demo/rbacAuth.js";
import type * as demo_simulation from "../demo/simulation.js";
import type * as demo_timeline from "../demo/timeline.js";
import type * as demo_tracer from "../demo/tracer.js";
import type * as demo_triggers from "../demo/triggers.js";
import type * as demo_workflow from "../demo/workflow.js";
import type * as demo_workosAuth from "../demo/workosAuth.js";
import type * as dispersal_createDispersalEntries from "../dispersal/createDispersalEntries.js";
import type * as dispersal_disbursementBridge from "../dispersal/disbursementBridge.js";
import type * as dispersal_holdPeriod from "../dispersal/holdPeriod.js";
import type * as dispersal_lenderIdentity from "../dispersal/lenderIdentity.js";
import type * as dispersal_queries from "../dispersal/queries.js";
import type * as dispersal_selfHealing from "../dispersal/selfHealing.js";
import type * as dispersal_selfHealingTypes from "../dispersal/selfHealingTypes.js";
import type * as dispersal_servicingFee from "../dispersal/servicingFee.js";
import type * as dispersal_types from "../dispersal/types.js";
import type * as dispersal_validators from "../dispersal/validators.js";
import type * as documentEngine_basePdfs from "../documentEngine/basePdfs.js";
import type * as documentEngine_dataModelEntities from "../documentEngine/dataModelEntities.js";
import type * as documentEngine_generation from "../documentEngine/generation.js";
import type * as documentEngine_generationHelpers from "../documentEngine/generationHelpers.js";
import type * as documentEngine_systemVariables from "../documentEngine/systemVariables.js";
import type * as documentEngine_templateGroups from "../documentEngine/templateGroups.js";
import type * as documentEngine_templateTimeline from "../documentEngine/templateTimeline.js";
import type * as documentEngine_templateVersions from "../documentEngine/templateVersions.js";
import type * as documentEngine_templates from "../documentEngine/templates.js";
import type * as documentEngine_validators from "../documentEngine/validators.js";
import type * as documents_assets from "../documents/assets.js";
import type * as documents_contracts from "../documents/contracts.js";
import type * as documents_dealPackages from "../documents/dealPackages.js";
import type * as documents_mortgageBlueprints from "../documents/mortgageBlueprints.js";
import type * as documents_templateValidation from "../documents/templateValidation.js";
import type * as engine_auditJournal from "../engine/auditJournal.js";
import type * as engine_commands from "../engine/commands.js";
import type * as engine_effects_collectionAttempt from "../engine/effects/collectionAttempt.js";
import type * as engine_effects_dealAccess from "../engine/effects/dealAccess.js";
import type * as engine_effects_dealClosing from "../engine/effects/dealClosing.js";
import type * as engine_effects_dealClosingEffects from "../engine/effects/dealClosingEffects.js";
import type * as engine_effects_dealClosingPayments from "../engine/effects/dealClosingPayments.js";
import type * as engine_effects_dealClosingPlaceholder from "../engine/effects/dealClosingPlaceholder.js";
import type * as engine_effects_dealClosingProrate from "../engine/effects/dealClosingProrate.js";
import type * as engine_effects_obligation from "../engine/effects/obligation.js";
import type * as engine_effects_obligationAccrual from "../engine/effects/obligationAccrual.js";
import type * as engine_effects_obligationLateFee from "../engine/effects/obligationLateFee.js";
import type * as engine_effects_obligationPayment from "../engine/effects/obligationPayment.js";
import type * as engine_effects_obligationWaiver from "../engine/effects/obligationWaiver.js";
import type * as engine_effects_onboarding from "../engine/effects/onboarding.js";
import type * as engine_effects_registry from "../engine/effects/registry.js";
import type * as engine_effects_transfer from "../engine/effects/transfer.js";
import type * as engine_effects_workosProvisioning from "../engine/effects/workosProvisioning.js";
import type * as engine_hashChain from "../engine/hashChain.js";
import type * as engine_machines_registry from "../engine/machines/registry.js";
import type * as engine_reconciliation from "../engine/reconciliation.js";
import type * as engine_reconciliationAction from "../engine/reconciliationAction.js";
import type * as engine_serialization from "../engine/serialization.js";
import type * as engine_transition from "../engine/transition.js";
import type * as engine_transitionMutation from "../engine/transitionMutation.js";
import type * as engine_types from "../engine/types.js";
import type * as engine_validators from "../engine/validators.js";
import type * as fees_config from "../fees/config.js";
import type * as fees_migrations from "../fees/migrations.js";
import type * as fees_queries from "../fees/queries.js";
import type * as fees_resolver from "../fees/resolver.js";
import type * as fees_validators from "../fees/validators.js";
import type * as fluent from "../fluent.js";
import type * as http from "../http.js";
import type * as ledger_accountOwnership from "../ledger/accountOwnership.js";
import type * as ledger_accounts from "../ledger/accounts.js";
import type * as ledger_bootstrap from "../ledger/bootstrap.js";
import type * as ledger_constants from "../ledger/constants.js";
import type * as ledger_cursors from "../ledger/cursors.js";
import type * as ledger_migrations from "../ledger/migrations.js";
import type * as ledger_mutations from "../ledger/mutations.js";
import type * as ledger_postEntry from "../ledger/postEntry.js";
import type * as ledger_queries from "../ledger/queries.js";
import type * as ledger_sequenceCounter from "../ledger/sequenceCounter.js";
import type * as ledger_types from "../ledger/types.js";
import type * as ledger_validation from "../ledger/validation.js";
import type * as ledger_validators from "../ledger/validators.js";
import type * as lib_businessDates from "../lib/businessDates.js";
import type * as lib_businessDays from "../lib/businessDays.js";
import type * as lib_orgScope from "../lib/orgScope.js";
import type * as listings_create from "../listings/create.js";
import type * as listings_curation from "../listings/curation.js";
import type * as listings_projection from "../listings/projection.js";
import type * as listings_publicDocuments from "../listings/publicDocuments.js";
import type * as listings_queries from "../listings/queries.js";
import type * as listings_validators from "../listings/validators.js";
import type * as mortgages_activateMortgageAggregate from "../mortgages/activateMortgageAggregate.js";
import type * as mortgages_paymentFrequency from "../mortgages/paymentFrequency.js";
import type * as mortgages_provenance from "../mortgages/provenance.js";
import type * as mortgages_queries from "../mortgages/queries.js";
import type * as mortgages_valuation from "../mortgages/valuation.js";
import type * as numbers from "../numbers.js";
import type * as obligations_mutations from "../obligations/mutations.js";
import type * as obligations_queries from "../obligations/queries.js";
import type * as onboarding_internal from "../onboarding/internal.js";
import type * as onboarding_mutations from "../onboarding/mutations.js";
import type * as onboarding_queries from "../onboarding/queries.js";
import type * as onboarding_validators from "../onboarding/validators.js";
import type * as payments_adminDashboard_queries from "../payments/adminDashboard/queries.js";
import type * as payments_bankAccounts_mutations from "../payments/bankAccounts/mutations.js";
import type * as payments_bankAccounts_queries from "../payments/bankAccounts/queries.js";
import type * as payments_bankAccounts_types from "../payments/bankAccounts/types.js";
import type * as payments_bankAccounts_validation from "../payments/bankAccounts/validation.js";
import type * as payments_cashLedger_accounts from "../payments/cashLedger/accounts.js";
import type * as payments_cashLedger_disbursementGate from "../payments/cashLedger/disbursementGate.js";
import type * as payments_cashLedger_hashChain from "../payments/cashLedger/hashChain.js";
import type * as payments_cashLedger_integrations from "../payments/cashLedger/integrations.js";
import type * as payments_cashLedger_mutations from "../payments/cashLedger/mutations.js";
import type * as payments_cashLedger_postEntry from "../payments/cashLedger/postEntry.js";
import type * as payments_cashLedger_postingGroups from "../payments/cashLedger/postingGroups.js";
import type * as payments_cashLedger_queries from "../payments/cashLedger/queries.js";
import type * as payments_cashLedger_reconciliation from "../payments/cashLedger/reconciliation.js";
import type * as payments_cashLedger_reconciliationCron from "../payments/cashLedger/reconciliationCron.js";
import type * as payments_cashLedger_reconciliationQueries from "../payments/cashLedger/reconciliationQueries.js";
import type * as payments_cashLedger_reconciliationSuite from "../payments/cashLedger/reconciliationSuite.js";
import type * as payments_cashLedger_replayIntegrity from "../payments/cashLedger/replayIntegrity.js";
import type * as payments_cashLedger_sequenceCounter from "../payments/cashLedger/sequenceCounter.js";
import type * as payments_cashLedger_transferHealingTypes from "../payments/cashLedger/transferHealingTypes.js";
import type * as payments_cashLedger_transferReconciliation from "../payments/cashLedger/transferReconciliation.js";
import type * as payments_cashLedger_transferReconciliationCron from "../payments/cashLedger/transferReconciliationCron.js";
import type * as payments_cashLedger_types from "../payments/cashLedger/types.js";
import type * as payments_cashLedger_validators from "../payments/cashLedger/validators.js";
import type * as payments_cashLedger_waiveObligationBalanceHandler from "../payments/cashLedger/waiveObligationBalanceHandler.js";
import type * as payments_collectionPlan_admin from "../payments/collectionPlan/admin.js";
import type * as payments_collectionPlan_balancePreCheck from "../payments/collectionPlan/balancePreCheck.js";
import type * as payments_collectionPlan_balancePreCheckContract from "../payments/collectionPlan/balancePreCheckContract.js";
import type * as payments_collectionPlan_defaultRules from "../payments/collectionPlan/defaultRules.js";
import type * as payments_collectionPlan_engine from "../payments/collectionPlan/engine.js";
import type * as payments_collectionPlan_execution from "../payments/collectionPlan/execution.js";
import type * as payments_collectionPlan_executionContract from "../payments/collectionPlan/executionContract.js";
import type * as payments_collectionPlan_executionGuards from "../payments/collectionPlan/executionGuards.js";
import type * as payments_collectionPlan_initialScheduling from "../payments/collectionPlan/initialScheduling.js";
import type * as payments_collectionPlan_manualCollection from "../payments/collectionPlan/manualCollection.js";
import type * as payments_collectionPlan_mutations from "../payments/collectionPlan/mutations.js";
import type * as payments_collectionPlan_planEntrySafety from "../payments/collectionPlan/planEntrySafety.js";
import type * as payments_collectionPlan_queries from "../payments/collectionPlan/queries.js";
import type * as payments_collectionPlan_readModels from "../payments/collectionPlan/readModels.js";
import type * as payments_collectionPlan_reschedule from "../payments/collectionPlan/reschedule.js";
import type * as payments_collectionPlan_ruleContract from "../payments/collectionPlan/ruleContract.js";
import type * as payments_collectionPlan_ruleRecords from "../payments/collectionPlan/ruleRecords.js";
import type * as payments_collectionPlan_rules_balancePreCheckRule from "../payments/collectionPlan/rules/balancePreCheckRule.js";
import type * as payments_collectionPlan_rules_lateFeeRule from "../payments/collectionPlan/rules/lateFeeRule.js";
import type * as payments_collectionPlan_rules_retryRule from "../payments/collectionPlan/rules/retryRule.js";
import type * as payments_collectionPlan_rules_scheduleRule from "../payments/collectionPlan/rules/scheduleRule.js";
import type * as payments_collectionPlan_runner from "../payments/collectionPlan/runner.js";
import type * as payments_collectionPlan_seed from "../payments/collectionPlan/seed.js";
import type * as payments_collectionPlan_stubs from "../payments/collectionPlan/stubs.js";
import type * as payments_collectionPlan_workout from "../payments/collectionPlan/workout.js";
import type * as payments_collectionPlan_workoutContract from "../payments/collectionPlan/workoutContract.js";
import type * as payments_dispersal_stubs from "../payments/dispersal/stubs.js";
import type * as payments_obligations_createCorrectiveObligation from "../payments/obligations/createCorrectiveObligation.js";
import type * as payments_obligations_crons from "../payments/obligations/crons.js";
import type * as payments_obligations_generate from "../payments/obligations/generate.js";
import type * as payments_obligations_generateImpl from "../payments/obligations/generateImpl.js";
import type * as payments_obligations_monitoring from "../payments/obligations/monitoring.js";
import type * as payments_obligations_queries from "../payments/obligations/queries.js";
import type * as payments_origination_bootstrap from "../payments/origination/bootstrap.js";
import type * as payments_payout_adminPayout from "../payments/payout/adminPayout.js";
import type * as payments_payout_batchPayout from "../payments/payout/batchPayout.js";
import type * as payments_payout_config from "../payments/payout/config.js";
import type * as payments_payout_mutations from "../payments/payout/mutations.js";
import type * as payments_payout_queries from "../payments/payout/queries.js";
import type * as payments_payout_refs from "../payments/payout/refs.js";
import type * as payments_payout_transferOwnedFlow from "../payments/payout/transferOwnedFlow.js";
import type * as payments_payout_validators from "../payments/payout/validators.js";
import type * as payments_recurringSchedules_activation from "../payments/recurringSchedules/activation.js";
import type * as payments_recurringSchedules_occurrenceIngestion from "../payments/recurringSchedules/occurrenceIngestion.js";
import type * as payments_recurringSchedules_poller from "../payments/recurringSchedules/poller.js";
import type * as payments_recurringSchedules_providers_registry from "../payments/recurringSchedules/providers/registry.js";
import type * as payments_recurringSchedules_providers_rotessaRecurring from "../payments/recurringSchedules/providers/rotessaRecurring.js";
import type * as payments_recurringSchedules_queries from "../payments/recurringSchedules/queries.js";
import type * as payments_recurringSchedules_rotessaCustomerReference from "../payments/recurringSchedules/rotessaCustomerReference.js";
import type * as payments_recurringSchedules_types from "../payments/recurringSchedules/types.js";
import type * as payments_recurringSchedules_validators from "../payments/recurringSchedules/validators.js";
import type * as payments_rotessa_api from "../payments/rotessa/api.js";
import type * as payments_rotessa_client from "../payments/rotessa/client.js";
import type * as payments_rotessa_financialTransactions from "../payments/rotessa/financialTransactions.js";
import type * as payments_rotessa_manifest from "../payments/rotessa/manifest.js";
import type * as payments_rotessa_types from "../payments/rotessa/types.js";
import type * as payments_transfers_collectionAttemptReconciliation from "../payments/transfers/collectionAttemptReconciliation.js";
import type * as payments_transfers_depositCollection from "../payments/transfers/depositCollection.js";
import type * as payments_transfers_interface from "../payments/transfers/interface.js";
import type * as payments_transfers_mockProviders from "../payments/transfers/mockProviders.js";
import type * as payments_transfers_mutations from "../payments/transfers/mutations.js";
import type * as payments_transfers_pipeline from "../payments/transfers/pipeline.js";
import type * as payments_transfers_principalReturn from "../payments/transfers/principalReturn.js";
import type * as payments_transfers_providers_manual from "../payments/transfers/providers/manual.js";
import type * as payments_transfers_providers_manualReview from "../payments/transfers/providers/manualReview.js";
import type * as payments_transfers_providers_mock from "../payments/transfers/providers/mock.js";
import type * as payments_transfers_providers_registry from "../payments/transfers/providers/registry.js";
import type * as payments_transfers_providers_rotessa from "../payments/transfers/providers/rotessa.js";
import type * as payments_transfers_queries from "../payments/transfers/queries.js";
import type * as payments_transfers_reconciliation from "../payments/transfers/reconciliation.js";
import type * as payments_transfers_types from "../payments/transfers/types.js";
import type * as payments_transfers_validators from "../payments/transfers/validators.js";
import type * as payments_webhooks_eftVopay from "../payments/webhooks/eftVopay.js";
import type * as payments_webhooks_handleReversal from "../payments/webhooks/handleReversal.js";
import type * as payments_webhooks_legacyReversal from "../payments/webhooks/legacyReversal.js";
import type * as payments_webhooks_processReversal from "../payments/webhooks/processReversal.js";
import type * as payments_webhooks_rotessa from "../payments/webhooks/rotessa.js";
import type * as payments_webhooks_rotessaPad from "../payments/webhooks/rotessaPad.js";
import type * as payments_webhooks_stripe from "../payments/webhooks/stripe.js";
import type * as payments_webhooks_transferCore from "../payments/webhooks/transferCore.js";
import type * as payments_webhooks_types from "../payments/webhooks/types.js";
import type * as payments_webhooks_utils from "../payments/webhooks/utils.js";
import type * as payments_webhooks_verification from "../payments/webhooks/verification.js";
import type * as payments_webhooks_vopay from "../payments/webhooks/vopay.js";
import type * as prorateEntries_mutations from "../prorateEntries/mutations.js";
import type * as prorateEntries_queries from "../prorateEntries/queries.js";
import type * as seed_seedAll from "../seed/seedAll.js";
import type * as seed_seedBorrower from "../seed/seedBorrower.js";
import type * as seed_seedBroker from "../seed/seedBroker.js";
import type * as seed_seedDeal from "../seed/seedDeal.js";
import type * as seed_seedHelpers from "../seed/seedHelpers.js";
import type * as seed_seedLender from "../seed/seedLender.js";
import type * as seed_seedMortgage from "../seed/seedMortgage.js";
import type * as seed_seedObligation from "../seed/seedObligation.js";
import type * as seed_seedObligationStates from "../seed/seedObligationStates.js";
import type * as seed_seedOnboardingRequest from "../seed/seedOnboardingRequest.js";
import type * as seed_seedPaymentData from "../seed/seedPaymentData.js";
import type * as test_authTestEndpoints from "../test/authTestEndpoints.js";
import type * as test_dealPackageE2e from "../test/dealPackageE2e.js";
import type * as test_moduleMaps from "../test/moduleMaps.js";
import type * as test_originationE2e from "../test/originationE2e.js";
import type * as test_packageSchemas from "../test/packageSchemas.js";
import type * as todos from "../todos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "accrual/calculateAccruedByMortgage": typeof accrual_calculateAccruedByMortgage;
  "accrual/calculateAccruedInterest": typeof accrual_calculateAccruedInterest;
  "accrual/calculateDailyAccrual": typeof accrual_calculateDailyAccrual;
  "accrual/calculateInvestorPortfolio": typeof accrual_calculateInvestorPortfolio;
  "accrual/interestMath": typeof accrual_interestMath;
  "accrual/ownershipPeriods": typeof accrual_ownershipPeriods;
  "accrual/queryHelpers": typeof accrual_queryHelpers;
  "accrual/types": typeof accrual_types;
  "admin/origination/access": typeof admin_origination_access;
  "admin/origination/caseDocuments": typeof admin_origination_caseDocuments;
  "admin/origination/cases": typeof admin_origination_cases;
  "admin/origination/collections": typeof admin_origination_collections;
  "admin/origination/commit": typeof admin_origination_commit;
  "admin/origination/validators": typeof admin_origination_validators;
  "admin/queries": typeof admin_queries;
  "audit/queries": typeof audit_queries;
  "auditEvidence/services": typeof auditEvidence_services;
  auditLog: typeof auditLog;
  auditTrailClient: typeof auditTrailClient;
  auth: typeof auth;
  "auth/auditAuth": typeof auth_auditAuth;
  "auth/internal": typeof auth_internal;
  "auth/permissionCatalog": typeof auth_permissionCatalog;
  "auth/resourceChecks": typeof auth_resourceChecks;
  "borrowers/resolveOrProvisionForOrigination": typeof borrowers_resolveOrProvisionForOrigination;
  "brokers/migrations": typeof brokers_migrations;
  constants: typeof constants;
  "crm/activityQueries": typeof crm_activityQueries;
  "crm/calendarQuery": typeof crm_calendarQuery;
  "crm/detailContextQueries": typeof crm_detailContextQueries;
  "crm/entityAdapterRegistry": typeof crm_entityAdapterRegistry;
  "crm/entityViewFields": typeof crm_entityViewFields;
  "crm/entityViewHydration": typeof crm_entityViewHydration;
  "crm/fieldDefs": typeof crm_fieldDefs;
  "crm/fieldValidation": typeof crm_fieldValidation;
  "crm/filterConstants": typeof crm_filterConstants;
  "crm/filterOperatorValidation": typeof crm_filterOperatorValidation;
  "crm/linkQueries": typeof crm_linkQueries;
  "crm/linkTypes": typeof crm_linkTypes;
  "crm/metadataCompiler": typeof crm_metadataCompiler;
  "crm/migrations": typeof crm_migrations;
  "crm/objectDefs": typeof crm_objectDefs;
  "crm/recordLinks": typeof crm_recordLinks;
  "crm/recordQueries": typeof crm_recordQueries;
  "crm/records": typeof crm_records;
  "crm/relationCellPayloads": typeof crm_relationCellPayloads;
  "crm/systemAdapters/bootstrap": typeof crm_systemAdapters_bootstrap;
  "crm/systemAdapters/columnResolver": typeof crm_systemAdapters_columnResolver;
  "crm/systemAdapters/queryAdapter": typeof crm_systemAdapters_queryAdapter;
  "crm/types": typeof crm_types;
  "crm/userSavedViews": typeof crm_userSavedViews;
  "crm/validators": typeof crm_validators;
  "crm/valueRouter": typeof crm_valueRouter;
  "crm/viewDefs": typeof crm_viewDefs;
  "crm/viewFields": typeof crm_viewFields;
  "crm/viewFilters": typeof crm_viewFilters;
  "crm/viewKanbanGroups": typeof crm_viewKanbanGroups;
  "crm/viewQueries": typeof crm_viewQueries;
  "crm/viewState": typeof crm_viewState;
  crons: typeof crons;
  "dealReroutes/mutations": typeof dealReroutes_mutations;
  "dealReroutes/queries": typeof dealReroutes_queries;
  "deals/accessCheck": typeof deals_accessCheck;
  "deals/mutations": typeof deals_mutations;
  "deals/queries": typeof deals_queries;
  "demo/actionCache": typeof demo_actionCache;
  "demo/aggregate": typeof demo_aggregate;
  "demo/amps": typeof demo_amps;
  "demo/ampsE2e": typeof demo_ampsE2e;
  "demo/ampsExecutionModes": typeof demo_ampsExecutionModes;
  "demo/apiCredentials": typeof demo_apiCredentials;
  "demo/auditLog": typeof demo_auditLog;
  "demo/auditTraceability": typeof demo_auditTraceability;
  "demo/cascadingDelete": typeof demo_cascadingDelete;
  "demo/crmSandbox": typeof demo_crmSandbox;
  "demo/crons": typeof demo_crons;
  "demo/debouncer": typeof demo_debouncer;
  "demo/demoLedgerSeed": typeof demo_demoLedgerSeed;
  "demo/fileManagement": typeof demo_fileManagement;
  "demo/fluentConvex": typeof demo_fluentConvex;
  "demo/geospatial": typeof demo_geospatial;
  "demo/governedTransitions": typeof demo_governedTransitions;
  "demo/governedTransitionsEffects": typeof demo_governedTransitionsEffects;
  "demo/ledger": typeof demo_ledger;
  "demo/machines/registry": typeof demo_machines_registry;
  "demo/migrations": typeof demo_migrations;
  "demo/presence": typeof demo_presence;
  "demo/prodLedger": typeof demo_prodLedger;
  "demo/rateLimiter": typeof demo_rateLimiter;
  "demo/rbacAuth": typeof demo_rbacAuth;
  "demo/simulation": typeof demo_simulation;
  "demo/timeline": typeof demo_timeline;
  "demo/tracer": typeof demo_tracer;
  "demo/triggers": typeof demo_triggers;
  "demo/workflow": typeof demo_workflow;
  "demo/workosAuth": typeof demo_workosAuth;
  "dispersal/createDispersalEntries": typeof dispersal_createDispersalEntries;
  "dispersal/disbursementBridge": typeof dispersal_disbursementBridge;
  "dispersal/holdPeriod": typeof dispersal_holdPeriod;
  "dispersal/lenderIdentity": typeof dispersal_lenderIdentity;
  "dispersal/queries": typeof dispersal_queries;
  "dispersal/selfHealing": typeof dispersal_selfHealing;
  "dispersal/selfHealingTypes": typeof dispersal_selfHealingTypes;
  "dispersal/servicingFee": typeof dispersal_servicingFee;
  "dispersal/types": typeof dispersal_types;
  "dispersal/validators": typeof dispersal_validators;
  "documentEngine/basePdfs": typeof documentEngine_basePdfs;
  "documentEngine/dataModelEntities": typeof documentEngine_dataModelEntities;
  "documentEngine/generation": typeof documentEngine_generation;
  "documentEngine/generationHelpers": typeof documentEngine_generationHelpers;
  "documentEngine/systemVariables": typeof documentEngine_systemVariables;
  "documentEngine/templateGroups": typeof documentEngine_templateGroups;
  "documentEngine/templateTimeline": typeof documentEngine_templateTimeline;
  "documentEngine/templateVersions": typeof documentEngine_templateVersions;
  "documentEngine/templates": typeof documentEngine_templates;
  "documentEngine/validators": typeof documentEngine_validators;
  "documents/assets": typeof documents_assets;
  "documents/contracts": typeof documents_contracts;
  "documents/dealPackages": typeof documents_dealPackages;
  "documents/mortgageBlueprints": typeof documents_mortgageBlueprints;
  "documents/templateValidation": typeof documents_templateValidation;
  "engine/auditJournal": typeof engine_auditJournal;
  "engine/commands": typeof engine_commands;
  "engine/effects/collectionAttempt": typeof engine_effects_collectionAttempt;
  "engine/effects/dealAccess": typeof engine_effects_dealAccess;
  "engine/effects/dealClosing": typeof engine_effects_dealClosing;
  "engine/effects/dealClosingEffects": typeof engine_effects_dealClosingEffects;
  "engine/effects/dealClosingPayments": typeof engine_effects_dealClosingPayments;
  "engine/effects/dealClosingPlaceholder": typeof engine_effects_dealClosingPlaceholder;
  "engine/effects/dealClosingProrate": typeof engine_effects_dealClosingProrate;
  "engine/effects/obligation": typeof engine_effects_obligation;
  "engine/effects/obligationAccrual": typeof engine_effects_obligationAccrual;
  "engine/effects/obligationLateFee": typeof engine_effects_obligationLateFee;
  "engine/effects/obligationPayment": typeof engine_effects_obligationPayment;
  "engine/effects/obligationWaiver": typeof engine_effects_obligationWaiver;
  "engine/effects/onboarding": typeof engine_effects_onboarding;
  "engine/effects/registry": typeof engine_effects_registry;
  "engine/effects/transfer": typeof engine_effects_transfer;
  "engine/effects/workosProvisioning": typeof engine_effects_workosProvisioning;
  "engine/hashChain": typeof engine_hashChain;
  "engine/machines/registry": typeof engine_machines_registry;
  "engine/reconciliation": typeof engine_reconciliation;
  "engine/reconciliationAction": typeof engine_reconciliationAction;
  "engine/serialization": typeof engine_serialization;
  "engine/transition": typeof engine_transition;
  "engine/transitionMutation": typeof engine_transitionMutation;
  "engine/types": typeof engine_types;
  "engine/validators": typeof engine_validators;
  "fees/config": typeof fees_config;
  "fees/migrations": typeof fees_migrations;
  "fees/queries": typeof fees_queries;
  "fees/resolver": typeof fees_resolver;
  "fees/validators": typeof fees_validators;
  fluent: typeof fluent;
  http: typeof http;
  "ledger/accountOwnership": typeof ledger_accountOwnership;
  "ledger/accounts": typeof ledger_accounts;
  "ledger/bootstrap": typeof ledger_bootstrap;
  "ledger/constants": typeof ledger_constants;
  "ledger/cursors": typeof ledger_cursors;
  "ledger/migrations": typeof ledger_migrations;
  "ledger/mutations": typeof ledger_mutations;
  "ledger/postEntry": typeof ledger_postEntry;
  "ledger/queries": typeof ledger_queries;
  "ledger/sequenceCounter": typeof ledger_sequenceCounter;
  "ledger/types": typeof ledger_types;
  "ledger/validation": typeof ledger_validation;
  "ledger/validators": typeof ledger_validators;
  "lib/businessDates": typeof lib_businessDates;
  "lib/businessDays": typeof lib_businessDays;
  "lib/orgScope": typeof lib_orgScope;
  "listings/create": typeof listings_create;
  "listings/curation": typeof listings_curation;
  "listings/projection": typeof listings_projection;
  "listings/publicDocuments": typeof listings_publicDocuments;
  "listings/queries": typeof listings_queries;
  "listings/validators": typeof listings_validators;
  "mortgages/activateMortgageAggregate": typeof mortgages_activateMortgageAggregate;
  "mortgages/paymentFrequency": typeof mortgages_paymentFrequency;
  "mortgages/provenance": typeof mortgages_provenance;
  "mortgages/queries": typeof mortgages_queries;
  "mortgages/valuation": typeof mortgages_valuation;
  numbers: typeof numbers;
  "obligations/mutations": typeof obligations_mutations;
  "obligations/queries": typeof obligations_queries;
  "onboarding/internal": typeof onboarding_internal;
  "onboarding/mutations": typeof onboarding_mutations;
  "onboarding/queries": typeof onboarding_queries;
  "onboarding/validators": typeof onboarding_validators;
  "payments/adminDashboard/queries": typeof payments_adminDashboard_queries;
  "payments/bankAccounts/mutations": typeof payments_bankAccounts_mutations;
  "payments/bankAccounts/queries": typeof payments_bankAccounts_queries;
  "payments/bankAccounts/types": typeof payments_bankAccounts_types;
  "payments/bankAccounts/validation": typeof payments_bankAccounts_validation;
  "payments/cashLedger/accounts": typeof payments_cashLedger_accounts;
  "payments/cashLedger/disbursementGate": typeof payments_cashLedger_disbursementGate;
  "payments/cashLedger/hashChain": typeof payments_cashLedger_hashChain;
  "payments/cashLedger/integrations": typeof payments_cashLedger_integrations;
  "payments/cashLedger/mutations": typeof payments_cashLedger_mutations;
  "payments/cashLedger/postEntry": typeof payments_cashLedger_postEntry;
  "payments/cashLedger/postingGroups": typeof payments_cashLedger_postingGroups;
  "payments/cashLedger/queries": typeof payments_cashLedger_queries;
  "payments/cashLedger/reconciliation": typeof payments_cashLedger_reconciliation;
  "payments/cashLedger/reconciliationCron": typeof payments_cashLedger_reconciliationCron;
  "payments/cashLedger/reconciliationQueries": typeof payments_cashLedger_reconciliationQueries;
  "payments/cashLedger/reconciliationSuite": typeof payments_cashLedger_reconciliationSuite;
  "payments/cashLedger/replayIntegrity": typeof payments_cashLedger_replayIntegrity;
  "payments/cashLedger/sequenceCounter": typeof payments_cashLedger_sequenceCounter;
  "payments/cashLedger/transferHealingTypes": typeof payments_cashLedger_transferHealingTypes;
  "payments/cashLedger/transferReconciliation": typeof payments_cashLedger_transferReconciliation;
  "payments/cashLedger/transferReconciliationCron": typeof payments_cashLedger_transferReconciliationCron;
  "payments/cashLedger/types": typeof payments_cashLedger_types;
  "payments/cashLedger/validators": typeof payments_cashLedger_validators;
  "payments/cashLedger/waiveObligationBalanceHandler": typeof payments_cashLedger_waiveObligationBalanceHandler;
  "payments/collectionPlan/admin": typeof payments_collectionPlan_admin;
  "payments/collectionPlan/balancePreCheck": typeof payments_collectionPlan_balancePreCheck;
  "payments/collectionPlan/balancePreCheckContract": typeof payments_collectionPlan_balancePreCheckContract;
  "payments/collectionPlan/defaultRules": typeof payments_collectionPlan_defaultRules;
  "payments/collectionPlan/engine": typeof payments_collectionPlan_engine;
  "payments/collectionPlan/execution": typeof payments_collectionPlan_execution;
  "payments/collectionPlan/executionContract": typeof payments_collectionPlan_executionContract;
  "payments/collectionPlan/executionGuards": typeof payments_collectionPlan_executionGuards;
  "payments/collectionPlan/initialScheduling": typeof payments_collectionPlan_initialScheduling;
  "payments/collectionPlan/manualCollection": typeof payments_collectionPlan_manualCollection;
  "payments/collectionPlan/mutations": typeof payments_collectionPlan_mutations;
  "payments/collectionPlan/planEntrySafety": typeof payments_collectionPlan_planEntrySafety;
  "payments/collectionPlan/queries": typeof payments_collectionPlan_queries;
  "payments/collectionPlan/readModels": typeof payments_collectionPlan_readModels;
  "payments/collectionPlan/reschedule": typeof payments_collectionPlan_reschedule;
  "payments/collectionPlan/ruleContract": typeof payments_collectionPlan_ruleContract;
  "payments/collectionPlan/ruleRecords": typeof payments_collectionPlan_ruleRecords;
  "payments/collectionPlan/rules/balancePreCheckRule": typeof payments_collectionPlan_rules_balancePreCheckRule;
  "payments/collectionPlan/rules/lateFeeRule": typeof payments_collectionPlan_rules_lateFeeRule;
  "payments/collectionPlan/rules/retryRule": typeof payments_collectionPlan_rules_retryRule;
  "payments/collectionPlan/rules/scheduleRule": typeof payments_collectionPlan_rules_scheduleRule;
  "payments/collectionPlan/runner": typeof payments_collectionPlan_runner;
  "payments/collectionPlan/seed": typeof payments_collectionPlan_seed;
  "payments/collectionPlan/stubs": typeof payments_collectionPlan_stubs;
  "payments/collectionPlan/workout": typeof payments_collectionPlan_workout;
  "payments/collectionPlan/workoutContract": typeof payments_collectionPlan_workoutContract;
  "payments/dispersal/stubs": typeof payments_dispersal_stubs;
  "payments/obligations/createCorrectiveObligation": typeof payments_obligations_createCorrectiveObligation;
  "payments/obligations/crons": typeof payments_obligations_crons;
  "payments/obligations/generate": typeof payments_obligations_generate;
  "payments/obligations/generateImpl": typeof payments_obligations_generateImpl;
  "payments/obligations/monitoring": typeof payments_obligations_monitoring;
  "payments/obligations/queries": typeof payments_obligations_queries;
  "payments/origination/bootstrap": typeof payments_origination_bootstrap;
  "payments/payout/adminPayout": typeof payments_payout_adminPayout;
  "payments/payout/batchPayout": typeof payments_payout_batchPayout;
  "payments/payout/config": typeof payments_payout_config;
  "payments/payout/mutations": typeof payments_payout_mutations;
  "payments/payout/queries": typeof payments_payout_queries;
  "payments/payout/refs": typeof payments_payout_refs;
  "payments/payout/transferOwnedFlow": typeof payments_payout_transferOwnedFlow;
  "payments/payout/validators": typeof payments_payout_validators;
  "payments/recurringSchedules/activation": typeof payments_recurringSchedules_activation;
  "payments/recurringSchedules/occurrenceIngestion": typeof payments_recurringSchedules_occurrenceIngestion;
  "payments/recurringSchedules/poller": typeof payments_recurringSchedules_poller;
  "payments/recurringSchedules/providers/registry": typeof payments_recurringSchedules_providers_registry;
  "payments/recurringSchedules/providers/rotessaRecurring": typeof payments_recurringSchedules_providers_rotessaRecurring;
  "payments/recurringSchedules/queries": typeof payments_recurringSchedules_queries;
  "payments/recurringSchedules/rotessaCustomerReference": typeof payments_recurringSchedules_rotessaCustomerReference;
  "payments/recurringSchedules/types": typeof payments_recurringSchedules_types;
  "payments/recurringSchedules/validators": typeof payments_recurringSchedules_validators;
  "payments/rotessa/api": typeof payments_rotessa_api;
  "payments/rotessa/client": typeof payments_rotessa_client;
  "payments/rotessa/financialTransactions": typeof payments_rotessa_financialTransactions;
  "payments/rotessa/manifest": typeof payments_rotessa_manifest;
  "payments/rotessa/types": typeof payments_rotessa_types;
  "payments/transfers/collectionAttemptReconciliation": typeof payments_transfers_collectionAttemptReconciliation;
  "payments/transfers/depositCollection": typeof payments_transfers_depositCollection;
  "payments/transfers/interface": typeof payments_transfers_interface;
  "payments/transfers/mockProviders": typeof payments_transfers_mockProviders;
  "payments/transfers/mutations": typeof payments_transfers_mutations;
  "payments/transfers/pipeline": typeof payments_transfers_pipeline;
  "payments/transfers/principalReturn": typeof payments_transfers_principalReturn;
  "payments/transfers/providers/manual": typeof payments_transfers_providers_manual;
  "payments/transfers/providers/manualReview": typeof payments_transfers_providers_manualReview;
  "payments/transfers/providers/mock": typeof payments_transfers_providers_mock;
  "payments/transfers/providers/registry": typeof payments_transfers_providers_registry;
  "payments/transfers/providers/rotessa": typeof payments_transfers_providers_rotessa;
  "payments/transfers/queries": typeof payments_transfers_queries;
  "payments/transfers/reconciliation": typeof payments_transfers_reconciliation;
  "payments/transfers/types": typeof payments_transfers_types;
  "payments/transfers/validators": typeof payments_transfers_validators;
  "payments/webhooks/eftVopay": typeof payments_webhooks_eftVopay;
  "payments/webhooks/handleReversal": typeof payments_webhooks_handleReversal;
  "payments/webhooks/legacyReversal": typeof payments_webhooks_legacyReversal;
  "payments/webhooks/processReversal": typeof payments_webhooks_processReversal;
  "payments/webhooks/rotessa": typeof payments_webhooks_rotessa;
  "payments/webhooks/rotessaPad": typeof payments_webhooks_rotessaPad;
  "payments/webhooks/stripe": typeof payments_webhooks_stripe;
  "payments/webhooks/transferCore": typeof payments_webhooks_transferCore;
  "payments/webhooks/types": typeof payments_webhooks_types;
  "payments/webhooks/utils": typeof payments_webhooks_utils;
  "payments/webhooks/verification": typeof payments_webhooks_verification;
  "payments/webhooks/vopay": typeof payments_webhooks_vopay;
  "prorateEntries/mutations": typeof prorateEntries_mutations;
  "prorateEntries/queries": typeof prorateEntries_queries;
  "seed/seedAll": typeof seed_seedAll;
  "seed/seedBorrower": typeof seed_seedBorrower;
  "seed/seedBroker": typeof seed_seedBroker;
  "seed/seedDeal": typeof seed_seedDeal;
  "seed/seedHelpers": typeof seed_seedHelpers;
  "seed/seedLender": typeof seed_seedLender;
  "seed/seedMortgage": typeof seed_seedMortgage;
  "seed/seedObligation": typeof seed_seedObligation;
  "seed/seedObligationStates": typeof seed_seedObligationStates;
  "seed/seedOnboardingRequest": typeof seed_seedOnboardingRequest;
  "seed/seedPaymentData": typeof seed_seedPaymentData;
  "test/authTestEndpoints": typeof test_authTestEndpoints;
  "test/dealPackageE2e": typeof test_dealPackageE2e;
  "test/moduleMaps": typeof test_moduleMaps;
  "test/originationE2e": typeof test_originationE2e;
  "test/packageSchemas": typeof test_packageSchemas;
  todos: typeof todos;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workOSAuthKit: {
    lib: {
      enqueueWebhookEvent: FunctionReference<
        "mutation",
        "internal",
        {
          apiKey: string;
          event: string;
          eventId: string;
          eventTypes?: Array<string>;
          logLevel?: "DEBUG";
          onEventHandle?: string;
          updatedAt?: string;
        },
        any
      >;
      getAuthUser: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          createdAt: string;
          email: string;
          emailVerified: boolean;
          externalId?: null | string;
          firstName?: null | string;
          id: string;
          lastName?: null | string;
          lastSignInAt?: null | string;
          locale?: null | string;
          metadata: Record<string, any>;
          profilePictureUrl?: null | string;
          updatedAt: string;
        } | null
      >;
    };
  };
  actionCache: {
    crons: {
      purge: FunctionReference<
        "mutation",
        "internal",
        { expiresAt?: number },
        null
      >;
    };
    lib: {
      get: FunctionReference<
        "query",
        "internal",
        { args: any; name: string; ttl: number | null },
        { kind: "hit"; value: any } | { expiredEntry?: string; kind: "miss" }
      >;
      put: FunctionReference<
        "mutation",
        "internal",
        {
          args: any;
          expiredEntry?: string;
          name: string;
          ttl: number | null;
          value: any;
        },
        { cacheHit: boolean; deletedExpiredEntry: boolean }
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { args: any; name: string },
        null
      >;
      removeAll: FunctionReference<
        "mutation",
        "internal",
        { batchSize?: number; before?: number; name?: string },
        null
      >;
    };
  };
  convexFilesControl: {
    accessControl: {
      addAccessKey: FunctionReference<
        "mutation",
        "internal",
        { accessKey: string; storageId: string },
        { accessKey: string }
      >;
      removeAccessKey: FunctionReference<
        "mutation",
        "internal",
        { accessKey: string; storageId: string },
        { removed: boolean }
      >;
      updateFileExpiration: FunctionReference<
        "mutation",
        "internal",
        { expiresAt: null | number; storageId: string },
        { expiresAt: null | number }
      >;
    };
    cleanUp: {
      cleanupExpired: FunctionReference<
        "mutation",
        "internal",
        {
          limit?: number;
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
        },
        { deletedCount: number; hasMore: boolean }
      >;
      deleteFile: FunctionReference<
        "mutation",
        "internal",
        {
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
          storageId: string;
        },
        { deleted: boolean }
      >;
      deleteStorageFile: FunctionReference<
        "action",
        "internal",
        {
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
          storageId: string;
          storageProvider: "convex" | "r2";
        },
        null
      >;
    };
    download: {
      consumeDownloadGrantForUrl: FunctionReference<
        "mutation",
        "internal",
        {
          accessKey?: string;
          downloadToken: string;
          password?: string;
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
        },
        {
          downloadUrl?: string;
          status:
            | "ok"
            | "not_found"
            | "expired"
            | "exhausted"
            | "file_missing"
            | "file_expired"
            | "access_denied"
            | "password_required"
            | "invalid_password";
        }
      >;
      createDownloadGrant: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt?: null | number;
          maxUses?: null | number;
          password?: string;
          shareableLink?: boolean;
          storageId: string;
        },
        {
          downloadToken: string;
          expiresAt: null | number;
          maxUses: null | number;
          shareableLink: boolean;
          storageId: string;
        }
      >;
    };
    queries: {
      getFile: FunctionReference<
        "query",
        "internal",
        { storageId: string },
        {
          _id: string;
          expiresAt: number | null;
          storageId: string;
          storageProvider: "convex" | "r2";
          virtualPath: string | null;
        } | null
      >;
      getFileByVirtualPath: FunctionReference<
        "query",
        "internal",
        { virtualPath: string },
        {
          _id: string;
          expiresAt: number | null;
          storageId: string;
          storageProvider: "convex" | "r2";
          virtualPath: string | null;
        } | null
      >;
      hasAccessKey: FunctionReference<
        "query",
        "internal",
        { accessKey: string; storageId: string },
        boolean
      >;
      listAccessKeysPage: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          storageId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<string>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listDownloadGrantsPage: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _id: string;
            expiresAt: number | null;
            hasPassword: boolean;
            maxUses: null | number;
            storageId: string;
            useCount: number;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listFilesByAccessKeyPage: FunctionReference<
        "query",
        "internal",
        {
          accessKey: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _id: string;
            expiresAt: number | null;
            storageId: string;
            storageProvider: "convex" | "r2";
            virtualPath: string | null;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listFilesPage: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _id: string;
            expiresAt: number | null;
            storageId: string;
            storageProvider: "convex" | "r2";
            virtualPath: string | null;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
    };
    transfer: {
      transferFile: FunctionReference<
        "action",
        "internal",
        {
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
          storageId: string;
          targetProvider: "convex" | "r2";
          virtualPath?: string;
        },
        {
          storageId: string;
          storageProvider: "convex" | "r2";
          virtualPath: string | null;
        }
      >;
    };
    upload: {
      computeR2Metadata: FunctionReference<
        "action",
        "internal",
        {
          r2Config: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
          storageId: string;
        },
        {
          contentType: string | null;
          sha256: string;
          size: number;
          storageId: string;
        }
      >;
      finalizeUpload: FunctionReference<
        "mutation",
        "internal",
        {
          accessKeys: Array<string>;
          expiresAt?: null | number;
          metadata?: {
            contentType: string | null;
            sha256: string;
            size: number;
          };
          storageId: string;
          uploadToken: string;
          virtualPath?: string;
        },
        {
          expiresAt: null | number;
          metadata: {
            contentType: string | null;
            sha256: string;
            size: number;
            storageId: string;
          } | null;
          storageId: string;
          storageProvider: "convex" | "r2";
          virtualPath: string | null;
        }
      >;
      generateUploadUrl: FunctionReference<
        "mutation",
        "internal",
        {
          provider: "convex" | "r2";
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
          virtualPath?: string;
        },
        {
          storageId: string | null;
          storageProvider: "convex" | "r2";
          uploadToken: string;
          uploadTokenExpiresAt: number;
          uploadUrl: string;
        }
      >;
      registerFile: FunctionReference<
        "mutation",
        "internal",
        {
          accessKeys: Array<string>;
          expiresAt?: null | number;
          metadata?: {
            contentType: string | null;
            sha256: string;
            size: number;
          };
          storageId: string;
          storageProvider: "convex" | "r2";
          virtualPath?: string;
        },
        {
          expiresAt: null | number;
          metadata: {
            contentType: string | null;
            sha256: string;
            size: number;
            storageId: string;
          } | null;
          storageId: string;
          storageProvider: "convex" | "r2";
          virtualPath: string | null;
        }
      >;
    };
  };
  debouncer: {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { key: string; namespace: string },
        boolean
      >;
      getCallDetails: FunctionReference<
        "query",
        "internal",
        { key: string; namespace: string },
        null | { functionArgs: any; functionPath: string }
      >;
      schedule: FunctionReference<
        "mutation",
        "internal",
        {
          delay: number;
          functionArgs: any;
          functionHandle: string;
          functionPath: string;
          key: string;
          mode: "eager" | "fixed" | "sliding";
          namespace: string;
        },
        { executed: boolean; scheduledFor: number }
      >;
      status: FunctionReference<
        "query",
        "internal",
        { key: string; namespace: string },
        null | {
          hasTrailingCall: boolean;
          mode: "eager" | "fixed" | "sliding";
          pending: boolean;
          retriggerCount: number;
          scheduledFor: number;
        }
      >;
    };
  };
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
      getValue: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          key?: string;
          name: string;
          sampleShards?: number;
        },
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          shard: number;
          ts: number;
          value: number;
        }
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        null
      >;
    };
    time: {
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
    };
  };
  presence: {
    public: {
      disconnect: FunctionReference<
        "mutation",
        "internal",
        { sessionToken: string },
        null
      >;
      heartbeat: FunctionReference<
        "mutation",
        "internal",
        {
          interval?: number;
          roomId: string;
          sessionId: string;
          userId: string;
        },
        { roomToken: string; sessionToken: string }
      >;
      list: FunctionReference<
        "query",
        "internal",
        { limit?: number; roomToken: string },
        Array<{
          data?: any;
          lastDisconnected: number;
          online: boolean;
          userId: string;
        }>
      >;
      listRoom: FunctionReference<
        "query",
        "internal",
        { limit?: number; onlineOnly?: boolean; roomId: string },
        Array<{ lastDisconnected: number; online: boolean; userId: string }>
      >;
      listUser: FunctionReference<
        "query",
        "internal",
        { limit?: number; onlineOnly?: boolean; userId: string },
        Array<{ lastDisconnected: number; online: boolean; roomId: string }>
      >;
      removeRoom: FunctionReference<
        "mutation",
        "internal",
        { roomId: string },
        null
      >;
      removeRoomUser: FunctionReference<
        "mutation",
        "internal",
        { roomId: string; userId: string },
        null
      >;
      updateRoomUser: FunctionReference<
        "mutation",
        "internal",
        { data?: any; roomId: string; userId: string },
        null
      >;
    };
  };
  migrations: {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { name: string },
        {
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        { sinceTs?: number },
        Array<{
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }>
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { limit?: number; names?: Array<string> },
        Array<{
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }>
      >;
      migrate: FunctionReference<
        "mutation",
        "internal",
        {
          batchSize?: number;
          cursor?: string | null;
          dryRun: boolean;
          fnHandle: string;
          name: string;
          next?: Array<{ fnHandle: string; name: string }>;
          oneBatchOnly?: boolean;
        },
        {
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }
      >;
    };
  };
  aggregate: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
  geospatial: {
    document: {
      get: FunctionReference<
        "query",
        "internal",
        { key: string },
        {
          coordinates: { latitude: number; longitude: number };
          filterKeys: Record<
            string,
            | string
            | number
            | boolean
            | null
            | bigint
            | Array<string | number | boolean | null | bigint>
          >;
          key: string;
          sortKey: number;
        } | null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          document: {
            coordinates: { latitude: number; longitude: number };
            filterKeys: Record<
              string,
              | string
              | number
              | boolean
              | null
              | bigint
              | Array<string | number | boolean | null | bigint>
            >;
            key: string;
            sortKey: number;
          };
          levelMod: number;
          maxCells: number;
          maxLevel: number;
          minLevel: number;
        },
        null
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        {
          key: string;
          levelMod: number;
          maxCells: number;
          maxLevel: number;
          minLevel: number;
        },
        boolean
      >;
    };
    query: {
      debugCells: FunctionReference<
        "query",
        "internal",
        {
          levelMod: number;
          maxCells: number;
          maxLevel: number;
          minLevel: number;
          rectangle: {
            east: number;
            north: number;
            south: number;
            west: number;
          };
        },
        Array<{
          token: string;
          vertices: Array<{ latitude: number; longitude: number }>;
        }>
      >;
      execute: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          levelMod: number;
          logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
          maxCells: number;
          maxLevel: number;
          minLevel: number;
          query: {
            filtering: Array<{
              filterKey: string;
              filterValue: string | number | boolean | null | bigint;
              occur: "should" | "must";
            }>;
            maxResults: number;
            rectangle: {
              east: number;
              north: number;
              south: number;
              west: number;
            };
            sorting: {
              interval: { endExclusive?: number; startInclusive?: number };
            };
          };
        },
        {
          nextCursor?: string;
          results: Array<{
            coordinates: { latitude: number; longitude: number };
            key: string;
          }>;
        }
      >;
      nearestPoints: FunctionReference<
        "query",
        "internal",
        {
          filtering: Array<{
            filterKey: string;
            filterValue: string | number | boolean | null | bigint;
            occur: "should" | "must";
          }>;
          levelMod: number;
          logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
          maxDistance?: number;
          maxLevel: number;
          maxResults: number;
          minLevel: number;
          nextCursor?: string;
          point: { latitude: number; longitude: number };
          sorting: {
            interval: { endExclusive?: number; startInclusive?: number };
          };
        },
        Array<{
          coordinates: { latitude: number; longitude: number };
          distance: number;
          key: string;
        }>
      >;
    };
  };
  crons: {
    public: {
      del: FunctionReference<
        "mutation",
        "internal",
        { identifier: { id: string } | { name: string } },
        null
      >;
      get: FunctionReference<
        "query",
        "internal",
        { identifier: { id: string } | { name: string } },
        {
          args: Record<string, any>;
          functionHandle: string;
          id: string;
          name?: string;
          schedule:
            | { kind: "interval"; ms: number }
            | { cronspec: string; kind: "cron"; tz?: string };
        } | null
      >;
      list: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          args: Record<string, any>;
          functionHandle: string;
          id: string;
          name?: string;
          schedule:
            | { kind: "interval"; ms: number }
            | { cronspec: string; kind: "cron"; tz?: string };
        }>
      >;
      register: FunctionReference<
        "mutation",
        "internal",
        {
          args: Record<string, any>;
          functionHandle: string;
          name?: string;
          schedule:
            | { kind: "interval"; ms: number }
            | { cronspec: string; kind: "cron"; tz?: string };
        },
        string
      >;
    };
  };
  twilio: {
    messages: {
      create: FunctionReference<
        "action",
        "internal",
        {
          account_sid: string;
          auth_token: string;
          body: string;
          callback?: string;
          from: string;
          status_callback: string;
          to: string;
        },
        {
          account_sid: string;
          api_version: string;
          body: string;
          counterparty?: string;
          date_created: string;
          date_sent: string | null;
          date_updated: string | null;
          direction: string;
          error_code: number | null;
          error_message: string | null;
          from: string;
          messaging_service_sid: string | null;
          num_media: string;
          num_segments: string;
          price: string | null;
          price_unit: string | null;
          rest?: any;
          sid: string;
          status: string;
          subresource_uris: { feedback?: string; media: string } | null;
          to: string;
          uri: string;
        }
      >;
      getByCounterparty: FunctionReference<
        "query",
        "internal",
        { account_sid: string; counterparty: string; limit?: number },
        Array<{
          account_sid: string;
          api_version: string;
          body: string;
          counterparty?: string;
          date_created: string;
          date_sent: string | null;
          date_updated: string | null;
          direction: string;
          error_code: number | null;
          error_message: string | null;
          from: string;
          messaging_service_sid: string | null;
          num_media: string;
          num_segments: string;
          price: string | null;
          price_unit: string | null;
          rest?: any;
          sid: string;
          status: string;
          subresource_uris: { feedback?: string; media: string } | null;
          to: string;
          uri: string;
        }>
      >;
      getBySid: FunctionReference<
        "query",
        "internal",
        { account_sid: string; sid: string },
        {
          account_sid: string;
          api_version: string;
          body: string;
          counterparty?: string;
          date_created: string;
          date_sent: string | null;
          date_updated: string | null;
          direction: string;
          error_code: number | null;
          error_message: string | null;
          from: string;
          messaging_service_sid: string | null;
          num_media: string;
          num_segments: string;
          price: string | null;
          price_unit: string | null;
          rest?: any;
          sid: string;
          status: string;
          subresource_uris: { feedback?: string; media: string } | null;
          to: string;
          uri: string;
        } | null
      >;
      getFrom: FunctionReference<
        "query",
        "internal",
        { account_sid: string; from: string; limit?: number },
        Array<{
          account_sid: string;
          api_version: string;
          body: string;
          counterparty?: string;
          date_created: string;
          date_sent: string | null;
          date_updated: string | null;
          direction: string;
          error_code: number | null;
          error_message: string | null;
          from: string;
          messaging_service_sid: string | null;
          num_media: string;
          num_segments: string;
          price: string | null;
          price_unit: string | null;
          rest?: any;
          sid: string;
          status: string;
          subresource_uris: { feedback?: string; media: string } | null;
          to: string;
          uri: string;
        }>
      >;
      getFromTwilioBySidAndInsert: FunctionReference<
        "action",
        "internal",
        {
          account_sid: string;
          auth_token: string;
          incomingMessageCallback?: string;
          sid: string;
        },
        {
          account_sid: string;
          api_version: string;
          body: string;
          counterparty?: string;
          date_created: string;
          date_sent: string | null;
          date_updated: string | null;
          direction: string;
          error_code: number | null;
          error_message: string | null;
          from: string;
          messaging_service_sid: string | null;
          num_media: string;
          num_segments: string;
          price: string | null;
          price_unit: string | null;
          rest?: any;
          sid: string;
          status: string;
          subresource_uris: { feedback?: string; media: string } | null;
          to: string;
          uri: string;
        }
      >;
      getTo: FunctionReference<
        "query",
        "internal",
        { account_sid: string; limit?: number; to: string },
        Array<{
          account_sid: string;
          api_version: string;
          body: string;
          counterparty?: string;
          date_created: string;
          date_sent: string | null;
          date_updated: string | null;
          direction: string;
          error_code: number | null;
          error_message: string | null;
          from: string;
          messaging_service_sid: string | null;
          num_media: string;
          num_segments: string;
          price: string | null;
          price_unit: string | null;
          rest?: any;
          sid: string;
          status: string;
          subresource_uris: { feedback?: string; media: string } | null;
          to: string;
          uri: string;
        }>
      >;
      list: FunctionReference<
        "query",
        "internal",
        { account_sid: string; limit?: number },
        Array<{
          account_sid: string;
          api_version: string;
          body: string;
          counterparty?: string;
          date_created: string;
          date_sent: string | null;
          date_updated: string | null;
          direction: string;
          error_code: number | null;
          error_message: string | null;
          from: string;
          messaging_service_sid: string | null;
          num_media: string;
          num_segments: string;
          price: string | null;
          price_unit: string | null;
          rest?: any;
          sid: string;
          status: string;
          subresource_uris: { feedback?: string; media: string } | null;
          to: string;
          uri: string;
        }>
      >;
      listIncoming: FunctionReference<
        "query",
        "internal",
        { account_sid: string; limit?: number },
        Array<{
          account_sid: string;
          api_version: string;
          body: string;
          counterparty?: string;
          date_created: string;
          date_sent: string | null;
          date_updated: string | null;
          direction: string;
          error_code: number | null;
          error_message: string | null;
          from: string;
          messaging_service_sid: string | null;
          num_media: string;
          num_segments: string;
          price: string | null;
          price_unit: string | null;
          rest?: any;
          sid: string;
          status: string;
          subresource_uris: { feedback?: string; media: string } | null;
          to: string;
          uri: string;
        }>
      >;
      listOutgoing: FunctionReference<
        "query",
        "internal",
        { account_sid: string; limit?: number },
        Array<{
          account_sid: string;
          api_version: string;
          body: string;
          counterparty?: string;
          date_created: string;
          date_sent: string | null;
          date_updated: string | null;
          direction: string;
          error_code: number | null;
          error_message: string | null;
          from: string;
          messaging_service_sid: string | null;
          num_media: string;
          num_segments: string;
          price: string | null;
          price_unit: string | null;
          rest?: any;
          sid: string;
          status: string;
          subresource_uris: { feedback?: string; media: string } | null;
          to: string;
          uri: string;
        }>
      >;
      updateStatus: FunctionReference<
        "mutation",
        "internal",
        { account_sid: string; sid: string; status: string },
        null
      >;
    };
    phone_numbers: {
      create: FunctionReference<
        "action",
        "internal",
        { account_sid: string; auth_token: string; number: string },
        any
      >;
      updateSmsUrl: FunctionReference<
        "action",
        "internal",
        {
          account_sid: string;
          auth_token: string;
          sid: string;
          sms_url: string;
        },
        any
      >;
    };
  };
  launchdarkly: {
    events: {
      storeEvents: FunctionReference<
        "mutation",
        "internal",
        {
          options?: {
            allAttributesPrivate?: boolean;
            eventBatchSize?: number;
            eventCapacity?: number;
            eventProcessingIntervalSeconds?: number;
            eventsUri?: string;
            privateAttributes?: Array<string>;
          };
          payloads: Array<string>;
          sdkKey: string;
        },
        null
      >;
    };
    store: {
      get: FunctionReference<
        "query",
        "internal",
        { key: string; kind: "flags" | "segments" },
        string | null
      >;
      getAll: FunctionReference<
        "query",
        "internal",
        { kind: "flags" | "segments" },
        Array<string>
      >;
      initialized: FunctionReference<"query", "internal", {}, boolean>;
      write: FunctionReference<
        "mutation",
        "internal",
        { payload: string },
        null
      >;
    };
    tokens: {
      validate: FunctionReference<
        "query",
        "internal",
        { token?: string },
        { error?: string; success: boolean }
      >;
    };
  };
  polar: {
    lib: {
      createProduct: FunctionReference<
        "mutation",
        "internal",
        {
          product: {
            benefits?: Array<{
              createdAt: string;
              deletable: boolean;
              description: string;
              id: string;
              metadata?: Record<string, any>;
              modifiedAt: string | null;
              organizationId: string;
              properties?: any;
              selectable: boolean;
              type: string;
            }>;
            createdAt: string;
            description: string | null;
            id: string;
            isArchived: boolean;
            isRecurring: boolean;
            medias: Array<{
              checksumEtag: string | null;
              checksumSha256Base64: string | null;
              checksumSha256Hex: string | null;
              createdAt: string;
              id: string;
              isUploaded: boolean;
              lastModifiedAt: string | null;
              mimeType: string;
              name: string;
              organizationId: string;
              path: string;
              publicUrl: string;
              service?: string;
              size: number;
              sizeReadable: string;
              storageVersion: string | null;
              version: string | null;
            }>;
            metadata?: Record<string, any>;
            modifiedAt: string | null;
            name: string;
            organizationId: string;
            prices: Array<{
              amountType?: string;
              capAmount?: number | null;
              createdAt: string;
              id: string;
              isArchived: boolean;
              maximumAmount?: number | null;
              meter?: { id: string; name: string };
              meterId?: string;
              minimumAmount?: number | null;
              modifiedAt: string | null;
              presetAmount?: number | null;
              priceAmount?: number;
              priceCurrency?: string;
              productId: string;
              recurringInterval?: string | null;
              seatTiers?: Array<{
                maxSeats: number | null;
                minSeats: number;
                pricePerSeat: number;
              }>;
              source?: string;
              type?: string;
              unitAmount?: string;
            }>;
            recurringInterval?: string | null;
            recurringIntervalCount?: number | null;
            trialInterval?: string | null;
            trialIntervalCount?: number | null;
          };
        },
        any
      >;
      createSubscription: FunctionReference<
        "mutation",
        "internal",
        {
          subscription: {
            amount: number | null;
            cancelAtPeriodEnd: boolean;
            canceledAt?: string | null;
            checkoutId: string | null;
            createdAt: string;
            currency: string | null;
            currentPeriodEnd: string | null;
            currentPeriodStart: string;
            customFieldData?: Record<string, any>;
            customerCancellationComment?: string | null;
            customerCancellationReason?: string | null;
            customerId: string;
            discountId?: string | null;
            endedAt: string | null;
            endsAt?: string | null;
            id: string;
            metadata: Record<string, any>;
            modifiedAt: string | null;
            priceId?: string;
            productId: string;
            recurringInterval: string | null;
            recurringIntervalCount?: number;
            seats?: number | null;
            startedAt: string | null;
            status: string;
            trialEnd?: string | null;
            trialStart?: string | null;
          };
        },
        any
      >;
      getCurrentSubscription: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          amount: number | null;
          cancelAtPeriodEnd: boolean;
          canceledAt?: string | null;
          checkoutId: string | null;
          createdAt: string;
          currency: string | null;
          currentPeriodEnd: string | null;
          currentPeriodStart: string;
          customFieldData?: Record<string, any>;
          customerCancellationComment?: string | null;
          customerCancellationReason?: string | null;
          customerId: string;
          discountId?: string | null;
          endedAt: string | null;
          endsAt?: string | null;
          id: string;
          metadata: Record<string, any>;
          modifiedAt: string | null;
          priceId?: string;
          product: {
            benefits?: Array<{
              createdAt: string;
              deletable: boolean;
              description: string;
              id: string;
              metadata?: Record<string, any>;
              modifiedAt: string | null;
              organizationId: string;
              properties?: any;
              selectable: boolean;
              type: string;
            }>;
            createdAt: string;
            description: string | null;
            id: string;
            isArchived: boolean;
            isRecurring: boolean;
            medias: Array<{
              checksumEtag: string | null;
              checksumSha256Base64: string | null;
              checksumSha256Hex: string | null;
              createdAt: string;
              id: string;
              isUploaded: boolean;
              lastModifiedAt: string | null;
              mimeType: string;
              name: string;
              organizationId: string;
              path: string;
              publicUrl: string;
              service?: string;
              size: number;
              sizeReadable: string;
              storageVersion: string | null;
              version: string | null;
            }>;
            metadata?: Record<string, any>;
            modifiedAt: string | null;
            name: string;
            organizationId: string;
            prices: Array<{
              amountType?: string;
              capAmount?: number | null;
              createdAt: string;
              id: string;
              isArchived: boolean;
              maximumAmount?: number | null;
              meter?: { id: string; name: string };
              meterId?: string;
              minimumAmount?: number | null;
              modifiedAt: string | null;
              presetAmount?: number | null;
              priceAmount?: number;
              priceCurrency?: string;
              productId: string;
              recurringInterval?: string | null;
              seatTiers?: Array<{
                maxSeats: number | null;
                minSeats: number;
                pricePerSeat: number;
              }>;
              source?: string;
              type?: string;
              unitAmount?: string;
            }>;
            recurringInterval?: string | null;
            recurringIntervalCount?: number | null;
            trialInterval?: string | null;
            trialIntervalCount?: number | null;
          };
          productId: string;
          recurringInterval: string | null;
          recurringIntervalCount?: number;
          seats?: number | null;
          startedAt: string | null;
          status: string;
          trialEnd?: string | null;
          trialStart?: string | null;
        } | null
      >;
      getCustomerByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        { id: string; metadata?: Record<string, any>; userId: string } | null
      >;
      getProduct: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          benefits?: Array<{
            createdAt: string;
            deletable: boolean;
            description: string;
            id: string;
            metadata?: Record<string, any>;
            modifiedAt: string | null;
            organizationId: string;
            properties?: any;
            selectable: boolean;
            type: string;
          }>;
          createdAt: string;
          description: string | null;
          id: string;
          isArchived: boolean;
          isRecurring: boolean;
          medias: Array<{
            checksumEtag: string | null;
            checksumSha256Base64: string | null;
            checksumSha256Hex: string | null;
            createdAt: string;
            id: string;
            isUploaded: boolean;
            lastModifiedAt: string | null;
            mimeType: string;
            name: string;
            organizationId: string;
            path: string;
            publicUrl: string;
            service?: string;
            size: number;
            sizeReadable: string;
            storageVersion: string | null;
            version: string | null;
          }>;
          metadata?: Record<string, any>;
          modifiedAt: string | null;
          name: string;
          organizationId: string;
          prices: Array<{
            amountType?: string;
            capAmount?: number | null;
            createdAt: string;
            id: string;
            isArchived: boolean;
            maximumAmount?: number | null;
            meter?: { id: string; name: string };
            meterId?: string;
            minimumAmount?: number | null;
            modifiedAt: string | null;
            presetAmount?: number | null;
            priceAmount?: number;
            priceCurrency?: string;
            productId: string;
            recurringInterval?: string | null;
            seatTiers?: Array<{
              maxSeats: number | null;
              minSeats: number;
              pricePerSeat: number;
            }>;
            source?: string;
            type?: string;
            unitAmount?: string;
          }>;
          recurringInterval?: string | null;
          recurringIntervalCount?: number | null;
          trialInterval?: string | null;
          trialIntervalCount?: number | null;
        } | null
      >;
      getSubscription: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          amount: number | null;
          cancelAtPeriodEnd: boolean;
          canceledAt?: string | null;
          checkoutId: string | null;
          createdAt: string;
          currency: string | null;
          currentPeriodEnd: string | null;
          currentPeriodStart: string;
          customFieldData?: Record<string, any>;
          customerCancellationComment?: string | null;
          customerCancellationReason?: string | null;
          customerId: string;
          discountId?: string | null;
          endedAt: string | null;
          endsAt?: string | null;
          id: string;
          metadata: Record<string, any>;
          modifiedAt: string | null;
          priceId?: string;
          productId: string;
          recurringInterval: string | null;
          recurringIntervalCount?: number;
          seats?: number | null;
          startedAt: string | null;
          status: string;
          trialEnd?: string | null;
          trialStart?: string | null;
        } | null
      >;
      insertCustomer: FunctionReference<
        "mutation",
        "internal",
        { id: string; metadata?: Record<string, any>; userId: string },
        string
      >;
      listAllUserSubscriptions: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          amount: number | null;
          cancelAtPeriodEnd: boolean;
          canceledAt?: string | null;
          checkoutId: string | null;
          createdAt: string;
          currency: string | null;
          currentPeriodEnd: string | null;
          currentPeriodStart: string;
          customFieldData?: Record<string, any>;
          customerCancellationComment?: string | null;
          customerCancellationReason?: string | null;
          customerId: string;
          discountId?: string | null;
          endedAt: string | null;
          endsAt?: string | null;
          id: string;
          metadata: Record<string, any>;
          modifiedAt: string | null;
          priceId?: string;
          product: {
            benefits?: Array<{
              createdAt: string;
              deletable: boolean;
              description: string;
              id: string;
              metadata?: Record<string, any>;
              modifiedAt: string | null;
              organizationId: string;
              properties?: any;
              selectable: boolean;
              type: string;
            }>;
            createdAt: string;
            description: string | null;
            id: string;
            isArchived: boolean;
            isRecurring: boolean;
            medias: Array<{
              checksumEtag: string | null;
              checksumSha256Base64: string | null;
              checksumSha256Hex: string | null;
              createdAt: string;
              id: string;
              isUploaded: boolean;
              lastModifiedAt: string | null;
              mimeType: string;
              name: string;
              organizationId: string;
              path: string;
              publicUrl: string;
              service?: string;
              size: number;
              sizeReadable: string;
              storageVersion: string | null;
              version: string | null;
            }>;
            metadata?: Record<string, any>;
            modifiedAt: string | null;
            name: string;
            organizationId: string;
            prices: Array<{
              amountType?: string;
              capAmount?: number | null;
              createdAt: string;
              id: string;
              isArchived: boolean;
              maximumAmount?: number | null;
              meter?: { id: string; name: string };
              meterId?: string;
              minimumAmount?: number | null;
              modifiedAt: string | null;
              presetAmount?: number | null;
              priceAmount?: number;
              priceCurrency?: string;
              productId: string;
              recurringInterval?: string | null;
              seatTiers?: Array<{
                maxSeats: number | null;
                minSeats: number;
                pricePerSeat: number;
              }>;
              source?: string;
              type?: string;
              unitAmount?: string;
            }>;
            recurringInterval?: string | null;
            recurringIntervalCount?: number | null;
            trialInterval?: string | null;
            trialIntervalCount?: number | null;
          } | null;
          productId: string;
          recurringInterval: string | null;
          recurringIntervalCount?: number;
          seats?: number | null;
          startedAt: string | null;
          status: string;
          trialEnd?: string | null;
          trialStart?: string | null;
        }>
      >;
      listCustomerSubscriptions: FunctionReference<
        "query",
        "internal",
        { customerId: string },
        Array<{
          amount: number | null;
          cancelAtPeriodEnd: boolean;
          canceledAt?: string | null;
          checkoutId: string | null;
          createdAt: string;
          currency: string | null;
          currentPeriodEnd: string | null;
          currentPeriodStart: string;
          customFieldData?: Record<string, any>;
          customerCancellationComment?: string | null;
          customerCancellationReason?: string | null;
          customerId: string;
          discountId?: string | null;
          endedAt: string | null;
          endsAt?: string | null;
          id: string;
          metadata: Record<string, any>;
          modifiedAt: string | null;
          priceId?: string;
          productId: string;
          recurringInterval: string | null;
          recurringIntervalCount?: number;
          seats?: number | null;
          startedAt: string | null;
          status: string;
          trialEnd?: string | null;
          trialStart?: string | null;
        }>
      >;
      listProducts: FunctionReference<
        "query",
        "internal",
        { includeArchived?: boolean },
        Array<{
          benefits?: Array<{
            createdAt: string;
            deletable: boolean;
            description: string;
            id: string;
            metadata?: Record<string, any>;
            modifiedAt: string | null;
            organizationId: string;
            properties?: any;
            selectable: boolean;
            type: string;
          }>;
          createdAt: string;
          description: string | null;
          id: string;
          isArchived: boolean;
          isRecurring: boolean;
          medias: Array<{
            checksumEtag: string | null;
            checksumSha256Base64: string | null;
            checksumSha256Hex: string | null;
            createdAt: string;
            id: string;
            isUploaded: boolean;
            lastModifiedAt: string | null;
            mimeType: string;
            name: string;
            organizationId: string;
            path: string;
            publicUrl: string;
            service?: string;
            size: number;
            sizeReadable: string;
            storageVersion: string | null;
            version: string | null;
          }>;
          metadata?: Record<string, any>;
          modifiedAt: string | null;
          name: string;
          organizationId: string;
          priceAmount?: number;
          prices: Array<{
            amountType?: string;
            capAmount?: number | null;
            createdAt: string;
            id: string;
            isArchived: boolean;
            maximumAmount?: number | null;
            meter?: { id: string; name: string };
            meterId?: string;
            minimumAmount?: number | null;
            modifiedAt: string | null;
            presetAmount?: number | null;
            priceAmount?: number;
            priceCurrency?: string;
            productId: string;
            recurringInterval?: string | null;
            seatTiers?: Array<{
              maxSeats: number | null;
              minSeats: number;
              pricePerSeat: number;
            }>;
            source?: string;
            type?: string;
            unitAmount?: string;
          }>;
          recurringInterval?: string | null;
          recurringIntervalCount?: number | null;
          trialInterval?: string | null;
          trialIntervalCount?: number | null;
        }>
      >;
      listUserSubscriptions: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          amount: number | null;
          cancelAtPeriodEnd: boolean;
          canceledAt?: string | null;
          checkoutId: string | null;
          createdAt: string;
          currency: string | null;
          currentPeriodEnd: string | null;
          currentPeriodStart: string;
          customFieldData?: Record<string, any>;
          customerCancellationComment?: string | null;
          customerCancellationReason?: string | null;
          customerId: string;
          discountId?: string | null;
          endedAt: string | null;
          endsAt?: string | null;
          id: string;
          metadata: Record<string, any>;
          modifiedAt: string | null;
          priceId?: string;
          product: {
            benefits?: Array<{
              createdAt: string;
              deletable: boolean;
              description: string;
              id: string;
              metadata?: Record<string, any>;
              modifiedAt: string | null;
              organizationId: string;
              properties?: any;
              selectable: boolean;
              type: string;
            }>;
            createdAt: string;
            description: string | null;
            id: string;
            isArchived: boolean;
            isRecurring: boolean;
            medias: Array<{
              checksumEtag: string | null;
              checksumSha256Base64: string | null;
              checksumSha256Hex: string | null;
              createdAt: string;
              id: string;
              isUploaded: boolean;
              lastModifiedAt: string | null;
              mimeType: string;
              name: string;
              organizationId: string;
              path: string;
              publicUrl: string;
              service?: string;
              size: number;
              sizeReadable: string;
              storageVersion: string | null;
              version: string | null;
            }>;
            metadata?: Record<string, any>;
            modifiedAt: string | null;
            name: string;
            organizationId: string;
            prices: Array<{
              amountType?: string;
              capAmount?: number | null;
              createdAt: string;
              id: string;
              isArchived: boolean;
              maximumAmount?: number | null;
              meter?: { id: string; name: string };
              meterId?: string;
              minimumAmount?: number | null;
              modifiedAt: string | null;
              presetAmount?: number | null;
              priceAmount?: number;
              priceCurrency?: string;
              productId: string;
              recurringInterval?: string | null;
              seatTiers?: Array<{
                maxSeats: number | null;
                minSeats: number;
                pricePerSeat: number;
              }>;
              source?: string;
              type?: string;
              unitAmount?: string;
            }>;
            recurringInterval?: string | null;
            recurringIntervalCount?: number | null;
            trialInterval?: string | null;
            trialIntervalCount?: number | null;
          } | null;
          productId: string;
          recurringInterval: string | null;
          recurringIntervalCount?: number;
          seats?: number | null;
          startedAt: string | null;
          status: string;
          trialEnd?: string | null;
          trialStart?: string | null;
        }>
      >;
      syncProducts: FunctionReference<
        "action",
        "internal",
        { polarAccessToken: string; server: "sandbox" | "production" },
        any
      >;
      updateProduct: FunctionReference<
        "mutation",
        "internal",
        {
          product: {
            benefits?: Array<{
              createdAt: string;
              deletable: boolean;
              description: string;
              id: string;
              metadata?: Record<string, any>;
              modifiedAt: string | null;
              organizationId: string;
              properties?: any;
              selectable: boolean;
              type: string;
            }>;
            createdAt: string;
            description: string | null;
            id: string;
            isArchived: boolean;
            isRecurring: boolean;
            medias: Array<{
              checksumEtag: string | null;
              checksumSha256Base64: string | null;
              checksumSha256Hex: string | null;
              createdAt: string;
              id: string;
              isUploaded: boolean;
              lastModifiedAt: string | null;
              mimeType: string;
              name: string;
              organizationId: string;
              path: string;
              publicUrl: string;
              service?: string;
              size: number;
              sizeReadable: string;
              storageVersion: string | null;
              version: string | null;
            }>;
            metadata?: Record<string, any>;
            modifiedAt: string | null;
            name: string;
            organizationId: string;
            prices: Array<{
              amountType?: string;
              capAmount?: number | null;
              createdAt: string;
              id: string;
              isArchived: boolean;
              maximumAmount?: number | null;
              meter?: { id: string; name: string };
              meterId?: string;
              minimumAmount?: number | null;
              modifiedAt: string | null;
              presetAmount?: number | null;
              priceAmount?: number;
              priceCurrency?: string;
              productId: string;
              recurringInterval?: string | null;
              seatTiers?: Array<{
                maxSeats: number | null;
                minSeats: number;
                pricePerSeat: number;
              }>;
              source?: string;
              type?: string;
              unitAmount?: string;
            }>;
            recurringInterval?: string | null;
            recurringIntervalCount?: number | null;
            trialInterval?: string | null;
            trialIntervalCount?: number | null;
          };
        },
        any
      >;
      updateProducts: FunctionReference<
        "mutation",
        "internal",
        {
          polarAccessToken: string;
          products: Array<{
            benefits?: Array<{
              createdAt: string;
              deletable: boolean;
              description: string;
              id: string;
              metadata?: Record<string, any>;
              modifiedAt: string | null;
              organizationId: string;
              properties?: any;
              selectable: boolean;
              type: string;
            }>;
            createdAt: string;
            description: string | null;
            id: string;
            isArchived: boolean;
            isRecurring: boolean;
            medias: Array<{
              checksumEtag: string | null;
              checksumSha256Base64: string | null;
              checksumSha256Hex: string | null;
              createdAt: string;
              id: string;
              isUploaded: boolean;
              lastModifiedAt: string | null;
              mimeType: string;
              name: string;
              organizationId: string;
              path: string;
              publicUrl: string;
              service?: string;
              size: number;
              sizeReadable: string;
              storageVersion: string | null;
              version: string | null;
            }>;
            metadata?: Record<string, any>;
            modifiedAt: string | null;
            name: string;
            organizationId: string;
            prices: Array<{
              amountType?: string;
              capAmount?: number | null;
              createdAt: string;
              id: string;
              isArchived: boolean;
              maximumAmount?: number | null;
              meter?: { id: string; name: string };
              meterId?: string;
              minimumAmount?: number | null;
              modifiedAt: string | null;
              presetAmount?: number | null;
              priceAmount?: number;
              priceCurrency?: string;
              productId: string;
              recurringInterval?: string | null;
              seatTiers?: Array<{
                maxSeats: number | null;
                minSeats: number;
                pricePerSeat: number;
              }>;
              source?: string;
              type?: string;
              unitAmount?: string;
            }>;
            recurringInterval?: string | null;
            recurringIntervalCount?: number | null;
            trialInterval?: string | null;
            trialIntervalCount?: number | null;
          }>;
        },
        any
      >;
      updateSubscription: FunctionReference<
        "mutation",
        "internal",
        {
          subscription: {
            amount: number | null;
            cancelAtPeriodEnd: boolean;
            canceledAt?: string | null;
            checkoutId: string | null;
            createdAt: string;
            currency: string | null;
            currentPeriodEnd: string | null;
            currentPeriodStart: string;
            customFieldData?: Record<string, any>;
            customerCancellationComment?: string | null;
            customerCancellationReason?: string | null;
            customerId: string;
            discountId?: string | null;
            endedAt: string | null;
            endsAt?: string | null;
            id: string;
            metadata: Record<string, any>;
            modifiedAt: string | null;
            priceId?: string;
            productId: string;
            recurringInterval: string | null;
            recurringIntervalCount?: number;
            seats?: number | null;
            startedAt: string | null;
            status: string;
            trialEnd?: string | null;
            trialStart?: string | null;
          };
        },
        any
      >;
    };
  };
  convexCascadingDelete: {
    lib: {
      createBatchJob: FunctionReference<
        "mutation",
        "internal",
        {
          batchSize: number;
          deleteHandleStr: string;
          targets: Array<{ id: string; table: string }>;
        },
        string
      >;
      getJobStatus: FunctionReference<
        "query",
        "internal",
        { jobId: string },
        {
          completedCount: number;
          completedSummary: string;
          error?: string;
          status: "pending" | "processing" | "completed" | "failed";
          totalTargetCount: number;
        } | null
      >;
      kickOffProcessing: FunctionReference<
        "mutation",
        "internal",
        { jobId: string },
        null
      >;
      reportBatchComplete: FunctionReference<
        "mutation",
        "internal",
        { batchSummary: string; errors?: string; jobId: string },
        null
      >;
    };
  };
  stripe: {
    private: {
      handleCheckoutSessionCompleted: FunctionReference<
        "mutation",
        "internal",
        {
          metadata?: any;
          mode: string;
          stripeCheckoutSessionId: string;
          stripeCustomerId?: string;
        },
        null
      >;
      handleCustomerCreated: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
        },
        null
      >;
      handleCustomerUpdated: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
        },
        null
      >;
      handleInvoiceCreated: FunctionReference<
        "mutation",
        "internal",
        {
          amountDue: number;
          amountPaid: number;
          created: number;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
        },
        null
      >;
      handleInvoicePaid: FunctionReference<
        "mutation",
        "internal",
        { amountPaid: number; stripeInvoiceId: string },
        null
      >;
      handleInvoicePaymentFailed: FunctionReference<
        "mutation",
        "internal",
        { stripeInvoiceId: string },
        null
      >;
      handlePaymentIntentSucceeded: FunctionReference<
        "mutation",
        "internal",
        {
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
        },
        null
      >;
      handleSubscriptionCreated: FunctionReference<
        "mutation",
        "internal",
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
        },
        null
      >;
      handleSubscriptionDeleted: FunctionReference<
        "mutation",
        "internal",
        {
          cancelAt?: number;
          cancelAtPeriodEnd?: boolean;
          currentPeriodEnd?: number;
          stripeSubscriptionId: string;
        },
        null
      >;
      handleSubscriptionUpdated: FunctionReference<
        "mutation",
        "internal",
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          priceId?: string;
          quantity?: number;
          status: string;
          stripeSubscriptionId: string;
        },
        null
      >;
      listSubscriptionsWithCreationTime: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          _creationTime: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
        }>
      >;
      updatePaymentCustomer: FunctionReference<
        "mutation",
        "internal",
        { stripeCustomerId: string; stripePaymentIntentId: string },
        null
      >;
      updateSubscriptionQuantityInternal: FunctionReference<
        "mutation",
        "internal",
        { quantity: number; stripeSubscriptionId: string },
        null
      >;
    };
    public: {
      createOrUpdateCustomer: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
        },
        string
      >;
      getCheckoutSession: FunctionReference<
        "query",
        "internal",
        { stripeCheckoutSessionId: string },
        {
          metadata?: any;
          mode: string;
          status: string;
          stripeCheckoutSessionId: string;
          stripeCustomerId?: string;
        } | null
      >;
      getCustomer: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
          userId?: string;
        } | null
      >;
      getCustomerByEmail: FunctionReference<
        "query",
        "internal",
        { email: string },
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
          userId?: string;
        } | null
      >;
      getCustomerByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
          userId?: string;
        } | null
      >;
      getPayment: FunctionReference<
        "query",
        "internal",
        { stripePaymentIntentId: string },
        {
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        } | null
      >;
      getSubscription: FunctionReference<
        "query",
        "internal",
        { stripeSubscriptionId: string },
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        } | null
      >;
      getSubscriptionByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        } | null
      >;
      listCheckoutSessions: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          metadata?: any;
          mode: string;
          status: string;
          stripeCheckoutSessionId: string;
          stripeCustomerId?: string;
        }>
      >;
      listInvoices: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          amountDue: number;
          amountPaid: number;
          created: number;
          orgId?: string;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
          userId?: string;
        }>
      >;
      listInvoicesByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        Array<{
          amountDue: number;
          amountPaid: number;
          created: number;
          orgId?: string;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
          userId?: string;
        }>
      >;
      listInvoicesByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          amountDue: number;
          amountPaid: number;
          created: number;
          orgId?: string;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
          userId?: string;
        }>
      >;
      listPayments: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        }>
      >;
      listPaymentsByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        Array<{
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        }>
      >;
      listPaymentsByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        }>
      >;
      listSubscriptions: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        }>
      >;
      listSubscriptionsByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        Array<{
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        }>
      >;
      listSubscriptionsByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        }>
      >;
      updateSubscriptionMetadata: FunctionReference<
        "mutation",
        "internal",
        {
          metadata: any;
          orgId?: string;
          stripeSubscriptionId: string;
          userId?: string;
        },
        null
      >;
      updateSubscriptionQuantity: FunctionReference<
        "action",
        "internal",
        { quantity: number; stripeSubscriptionId: string },
        null
      >;
    };
  };
  apiKeys: {
    cleanup: {
      cleanupEvents: FunctionReference<
        "mutation",
        "internal",
        { retentionMs: number },
        { deleted: number; isDone: boolean }
      >;
      cleanupKeys: FunctionReference<
        "mutation",
        "internal",
        { retentionMs: number },
        { deleted: number; isDone: boolean }
      >;
    };
    lib: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt?: number;
          logLevel?: "debug" | "warn" | "error" | "none";
          maxIdleMs?: number;
          metadata?: Record<string, any>;
          name?: string;
          namespace?: string;
          permissions?: Record<string, Array<string>>;
          tokenHash: string;
          tokenLast4: string;
          tokenPrefix: string;
        },
        { createdAt: number; keyId: string }
      >;
      getKey: FunctionReference<
        "query",
        "internal",
        { keyId: string; now: number },
        | {
            createdAt: number;
            effectiveStatus: "active" | "revoked" | "expired" | "idle_timeout";
            expiresAt?: number;
            keyId: string;
            lastUsedAt: number;
            maxIdleMs?: number;
            metadata?: Record<string, any>;
            name?: string;
            namespace?: string;
            ok: true;
            permissions?: Record<string, Array<string>>;
            replaces?: string;
            revocationReason?: string;
            revokedAt?: number;
            status: "active" | "revoked";
            tokenLast4: string;
            tokenPrefix: string;
            updatedAt: number;
          }
        | { ok: false; reason: "not_found" }
      >;
      invalidate: FunctionReference<
        "mutation",
        "internal",
        {
          keyId: string;
          logLevel?: "debug" | "warn" | "error" | "none";
          metadata?: Record<string, any>;
          now: number;
          reason?: string;
        },
        | { keyId: string; ok: true; revokedAt: number }
        | { ok: false; reason: "not_found" | "revoked" }
      >;
      invalidateAll: FunctionReference<
        "mutation",
        "internal",
        {
          after?: number;
          before?: number;
          logLevel?: "debug" | "warn" | "error" | "none";
          metadata?: Record<string, any>;
          namespace?: string;
          now: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          reason?: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          processed: number;
          revoked: number;
        }
      >;
      listEvents: FunctionReference<
        "query",
        "internal",
        {
          namespace?: string;
          order?: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            createdAt: number;
            eventId: string;
            keyId: string;
            keyName?: string;
            metadata?: Record<string, any>;
            namespace?: string;
            reason?: string;
            replacedKeyId?: string;
            replacementKeyId?: string;
            tokenLast4?: string;
            tokenPrefix?: string;
            type: "created" | "revoked" | "rotated";
          }>;
        }
      >;
      listKeyEvents: FunctionReference<
        "query",
        "internal",
        {
          keyId: string;
          order?: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            createdAt: number;
            eventId: string;
            keyId: string;
            keyName?: string;
            metadata?: Record<string, any>;
            namespace?: string;
            reason?: string;
            replacedKeyId?: string;
            replacementKeyId?: string;
            tokenLast4?: string;
            tokenPrefix?: string;
            type: "created" | "revoked" | "rotated";
          }>;
        }
      >;
      listKeys: FunctionReference<
        "query",
        "internal",
        {
          effectiveStatus?: "active" | "revoked" | "expired" | "idle_timeout";
          namespace?: string;
          now: number;
          order?: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          status?: "active" | "revoked";
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            createdAt: number;
            effectiveStatus: "active" | "revoked" | "expired" | "idle_timeout";
            expiresAt?: number;
            keyId: string;
            lastUsedAt: number;
            maxIdleMs?: number;
            metadata?: Record<string, any>;
            name?: string;
            namespace?: string;
            permissions?: Record<string, Array<string>>;
            replaces?: string;
            revocationReason?: string;
            revokedAt?: number;
            status: "active" | "revoked";
            tokenLast4: string;
            tokenPrefix: string;
            updatedAt: number;
          }>;
        }
      >;
      refresh: FunctionReference<
        "mutation",
        "internal",
        {
          keyId: string;
          logLevel?: "debug" | "warn" | "error" | "none";
          metadata?: Record<string, any>;
          now: number;
          reason?: string;
          tokenHash: string;
          tokenLast4: string;
          tokenPrefix: string;
        },
        | {
            createdAt: number;
            expiresAt?: number;
            keyId: string;
            ok: true;
            replacedKeyId: string;
          }
        | {
            ok: false;
            reason: "not_found" | "revoked" | "expired" | "idle_timeout";
          }
      >;
      touch: FunctionReference<
        "mutation",
        "internal",
        { keyId: string; now: number },
        | { keyId: string; ok: true; touchedAt: number }
        | {
            ok: false;
            reason: "not_found" | "revoked" | "expired" | "idle_timeout";
          }
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt?: number | null;
          keyId: string;
          logLevel?: "debug" | "warn" | "error" | "none";
          maxIdleMs?: number | null;
          metadata?: Record<string, any>;
          name?: string;
        },
        | { keyId: string; ok: true }
        | { ok: false; reason: "not_found" | "already_revoked" }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        {
          logLevel?: "debug" | "warn" | "error" | "none";
          now: number;
          tokenHash: string;
        },
        | {
            keyId: string;
            metadata?: Record<string, any>;
            name?: string;
            namespace?: string;
            ok: true;
            permissions?: Record<string, Array<string>>;
          }
        | {
            ok: false;
            reason: "not_found" | "revoked" | "expired" | "idle_timeout";
          }
      >;
    };
  };
  apiTokens: {
    public: {
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { olderThanMs?: number },
        number
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt?: number;
          maxIdleMs?: number;
          metadata?: any;
          name?: string;
          namespace: any;
        },
        { token: string; tokenId: string; tokenPrefix: string }
      >;
      deleteEncryptedKey: FunctionReference<
        "mutation",
        "internal",
        { keyName: string; namespace: any },
        boolean
      >;
      getEncryptedKey: FunctionReference<
        "query",
        "internal",
        { keyName: string; namespace: any },
        {
          createdAt: number;
          encryptedValue: string;
          iv: string;
          updatedAt: number;
        } | null
      >;
      getValue: FunctionReference<
        "query",
        "internal",
        { encryptionKey: string; keyName: string; namespace: any },
        string | null
      >;
      invalidate: FunctionReference<
        "mutation",
        "internal",
        { token: string },
        boolean
      >;
      invalidateAll: FunctionReference<
        "mutation",
        "internal",
        { after?: number; before?: number; namespace?: any },
        number
      >;
      invalidateById: FunctionReference<
        "mutation",
        "internal",
        { tokenId: string },
        boolean
      >;
      list: FunctionReference<
        "query",
        "internal",
        { includeRevoked?: boolean; namespace: any },
        Array<{
          createdAt: number;
          expiresAt?: number;
          lastUsedAt: number;
          maxIdleMs?: number;
          metadata?: any;
          name?: string;
          namespace: any;
          replacedBy?: string;
          revoked: boolean;
          tokenId: string;
          tokenPrefix: string;
        }>
      >;
      listEncryptedKeys: FunctionReference<
        "query",
        "internal",
        { namespace: any },
        Array<{ createdAt: number; keyName: string; updatedAt: number }>
      >;
      refresh: FunctionReference<
        "mutation",
        "internal",
        { token: string },
        {
          ok: boolean;
          reason?: string;
          token?: string;
          tokenId?: string;
          tokenPrefix?: string;
        }
      >;
      storeEncryptedKey: FunctionReference<
        "mutation",
        "internal",
        { encryptedValue: string; iv: string; keyName: string; namespace: any },
        null
      >;
      storeValue: FunctionReference<
        "mutation",
        "internal",
        {
          encryptionKey: string;
          keyName: string;
          namespace: any;
          value: string;
        },
        null
      >;
      touch: FunctionReference<
        "mutation",
        "internal",
        { token: string },
        boolean
      >;
      validate: FunctionReference<
        "mutation",
        "internal",
        { token: string },
        {
          metadata?: any;
          namespace?: any;
          ok: boolean;
          reason?: "expired" | "idle_timeout" | "revoked" | "invalid";
          tokenId?: string;
        }
      >;
    };
  };
  auditLog: {
    lib: {
      cleanup: FunctionReference<
        "mutation",
        "internal",
        {
          batchSize?: number;
          olderThanDays?: number;
          preserveSeverity?: Array<"info" | "warning" | "error" | "critical">;
          retentionCategory?: string;
        },
        number
      >;
      detectAnomalies: FunctionReference<
        "query",
        "internal",
        {
          patterns: Array<{
            action: string;
            threshold: number;
            windowMinutes: number;
          }>;
        },
        Array<{
          action: string;
          count: number;
          detectedAt: number;
          threshold: number;
          windowMinutes: number;
        }>
      >;
      generateReport: FunctionReference<
        "query",
        "internal",
        {
          endDate: number;
          format: "json" | "csv";
          groupBy?: string;
          includeFields?: Array<string>;
          maxRecords?: number;
          startDate: number;
        },
        {
          data: string;
          format: "json" | "csv";
          generatedAt: number;
          recordCount: number;
          truncated: boolean;
        }
      >;
      get: FunctionReference<
        "query",
        "internal",
        { id: string },
        null | {
          _creationTime: number;
          _id: string;
          action: string;
          actorId?: string;
          after?: any;
          before?: any;
          diff?: string;
          ipAddress?: string;
          metadata?: any;
          resourceId?: string;
          resourceType?: string;
          retentionCategory?: string;
          sessionId?: string;
          severity: "info" | "warning" | "error" | "critical";
          tags?: Array<string>;
          timestamp: number;
          userAgent?: string;
        }
      >;
      getConfig: FunctionReference<
        "query",
        "internal",
        {},
        null | {
          _creationTime: number;
          _id: string;
          criticalRetentionDays: number;
          customRetention?: Array<{ category: string; retentionDays: number }>;
          defaultRetentionDays: number;
          piiFieldsToRedact: Array<string>;
          samplingEnabled: boolean;
          samplingRate: number;
        }
      >;
      getStats: FunctionReference<
        "query",
        "internal",
        { fromTimestamp?: number; toTimestamp?: number },
        {
          bySeverity: {
            critical: number;
            error: number;
            info: number;
            warning: number;
          };
          topActions: Array<{ action: string; count: number }>;
          topActors: Array<{ actorId: string; count: number }>;
          totalCount: number;
        }
      >;
      log: FunctionReference<
        "mutation",
        "internal",
        {
          action: string;
          actorId?: string;
          ipAddress?: string;
          metadata?: any;
          resourceId?: string;
          resourceType?: string;
          retentionCategory?: string;
          sessionId?: string;
          severity: "info" | "warning" | "error" | "critical";
          tags?: Array<string>;
          userAgent?: string;
        },
        string
      >;
      logBulk: FunctionReference<
        "mutation",
        "internal",
        {
          events: Array<{
            action: string;
            actorId?: string;
            ipAddress?: string;
            metadata?: any;
            resourceId?: string;
            resourceType?: string;
            retentionCategory?: string;
            sessionId?: string;
            severity: "info" | "warning" | "error" | "critical";
            tags?: Array<string>;
            userAgent?: string;
          }>;
        },
        Array<string>
      >;
      logChange: FunctionReference<
        "mutation",
        "internal",
        {
          action: string;
          actorId?: string;
          after?: any;
          before?: any;
          generateDiff?: boolean;
          ipAddress?: string;
          resourceId: string;
          resourceType: string;
          retentionCategory?: string;
          sessionId?: string;
          severity?: "info" | "warning" | "error" | "critical";
          tags?: Array<string>;
          userAgent?: string;
        },
        string
      >;
      queryByAction: FunctionReference<
        "query",
        "internal",
        { action: string; fromTimestamp?: number; limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          action: string;
          actorId?: string;
          after?: any;
          before?: any;
          diff?: string;
          ipAddress?: string;
          metadata?: any;
          resourceId?: string;
          resourceType?: string;
          retentionCategory?: string;
          sessionId?: string;
          severity: "info" | "warning" | "error" | "critical";
          tags?: Array<string>;
          timestamp: number;
          userAgent?: string;
        }>
      >;
      queryByActor: FunctionReference<
        "query",
        "internal",
        {
          actions?: Array<string>;
          actorId: string;
          fromTimestamp?: number;
          limit?: number;
        },
        Array<{
          _creationTime: number;
          _id: string;
          action: string;
          actorId?: string;
          after?: any;
          before?: any;
          diff?: string;
          ipAddress?: string;
          metadata?: any;
          resourceId?: string;
          resourceType?: string;
          retentionCategory?: string;
          sessionId?: string;
          severity: "info" | "warning" | "error" | "critical";
          tags?: Array<string>;
          timestamp: number;
          userAgent?: string;
        }>
      >;
      queryByResource: FunctionReference<
        "query",
        "internal",
        {
          fromTimestamp?: number;
          limit?: number;
          resourceId: string;
          resourceType: string;
        },
        Array<{
          _creationTime: number;
          _id: string;
          action: string;
          actorId?: string;
          after?: any;
          before?: any;
          diff?: string;
          ipAddress?: string;
          metadata?: any;
          resourceId?: string;
          resourceType?: string;
          retentionCategory?: string;
          sessionId?: string;
          severity: "info" | "warning" | "error" | "critical";
          tags?: Array<string>;
          timestamp: number;
          userAgent?: string;
        }>
      >;
      queryBySeverity: FunctionReference<
        "query",
        "internal",
        {
          fromTimestamp?: number;
          limit?: number;
          severity: Array<"info" | "warning" | "error" | "critical">;
        },
        Array<{
          _creationTime: number;
          _id: string;
          action: string;
          actorId?: string;
          after?: any;
          before?: any;
          diff?: string;
          ipAddress?: string;
          metadata?: any;
          resourceId?: string;
          resourceType?: string;
          retentionCategory?: string;
          sessionId?: string;
          severity: "info" | "warning" | "error" | "critical";
          tags?: Array<string>;
          timestamp: number;
          userAgent?: string;
        }>
      >;
      runBackfill: FunctionReference<
        "mutation",
        "internal",
        { batchSize?: number; cursor?: string },
        { cursor: string | null; isDone: boolean; processed: number }
      >;
      search: FunctionReference<
        "query",
        "internal",
        {
          filters: {
            actions?: Array<string>;
            actorIds?: Array<string>;
            fromTimestamp?: number;
            resourceTypes?: Array<string>;
            severity?: Array<"info" | "warning" | "error" | "critical">;
            tags?: Array<string>;
            toTimestamp?: number;
          };
          pagination: { cursor?: string; limit: number };
        },
        {
          cursor: string | null;
          hasMore: boolean;
          items: Array<{
            _creationTime: number;
            _id: string;
            action: string;
            actorId?: string;
            after?: any;
            before?: any;
            diff?: string;
            ipAddress?: string;
            metadata?: any;
            resourceId?: string;
            resourceType?: string;
            retentionCategory?: string;
            sessionId?: string;
            severity: "info" | "warning" | "error" | "critical";
            tags?: Array<string>;
            timestamp: number;
            userAgent?: string;
          }>;
        }
      >;
      updateConfig: FunctionReference<
        "mutation",
        "internal",
        {
          criticalRetentionDays?: number;
          customRetention?: Array<{ category: string; retentionDays: number }>;
          defaultRetentionDays?: number;
          piiFieldsToRedact?: Array<string>;
          samplingEnabled?: boolean;
          samplingRate?: number;
        },
        string
      >;
      watchCritical: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          severity?: Array<"info" | "warning" | "error" | "critical">;
        },
        Array<{
          _creationTime: number;
          _id: string;
          action: string;
          actorId?: string;
          after?: any;
          before?: any;
          diff?: string;
          ipAddress?: string;
          metadata?: any;
          resourceId?: string;
          resourceType?: string;
          retentionCategory?: string;
          sessionId?: string;
          severity: "info" | "warning" | "error" | "critical";
          tags?: Array<string>;
          timestamp: number;
          userAgent?: string;
        }>
      >;
    };
  };
  auditTrail: {
    lib: {
      emitPending: FunctionReference<"mutation", "internal", {}, any>;
      exportTrail: FunctionReference<
        "query",
        "internal",
        { entityId: string },
        any
      >;
      getOutboxStatus: FunctionReference<"query", "internal", {}, any>;
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          actorId: string;
          afterState?: string;
          beforeState?: string;
          canonicalEnvelope?: string;
          entityId: string;
          entityType: string;
          eventType: string;
          metadata?: string;
          timestamp: number;
        },
        string
      >;
      queryByEntity: FunctionReference<
        "query",
        "internal",
        { entityId: string },
        Array<{
          _creationTime: number;
          _id: string;
          actorId: string;
          afterState?: string;
          archivedAt?: number;
          beforeState?: string;
          canonicalEnvelope?: string;
          emitFailures?: number;
          emitted: boolean;
          emittedAt?: number;
          entityId: string;
          entityType: string;
          eventType: string;
          hash: string;
          metadata?: string;
          prevHash: string;
          retentionUntilAt: number;
          sinkReference?: string;
          timestamp: number;
        }>
      >;
      verifyChain: FunctionReference<
        "query",
        "internal",
        { entityId: string },
        any
      >;
    };
  };
  fs: {
    lib: {
      commitFiles: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          files: Array<{
            attributes?: { expiresAt?: number };
            basis?: null | string;
            blobId: string;
            path: string;
          }>;
        },
        null
      >;
      copyByPath: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          destPath: string;
          sourcePath: string;
        },
        null
      >;
      deleteByPath: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          path: string;
        },
        null
      >;
      getDownloadUrl: FunctionReference<
        "action",
        "internal",
        {
          blobId: string;
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          extraParams?: Record<string, string>;
        },
        string
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          prefix?: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            attributes?: { expiresAt?: number };
            blobId: string;
            contentType: string;
            path: string;
            size: number;
          }>;
        }
      >;
      moveByPath: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          destPath: string;
          sourcePath: string;
        },
        null
      >;
      registerPendingUpload: FunctionReference<
        "mutation",
        "internal",
        {
          blobId: string;
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          contentType: string;
          size: number;
        },
        null
      >;
      stat: FunctionReference<
        "query",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          path: string;
        },
        null | {
          attributes?: { expiresAt?: number };
          blobId: string;
          contentType: string;
          path: string;
          size: number;
        }
      >;
      transact: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          ops: Array<
            | {
                dest: { basis?: null | string; path: string };
                op: "move";
                source: {
                  attributes?: { expiresAt?: number };
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
            | {
                dest: { basis?: null | string; path: string };
                op: "copy";
                source: {
                  attributes?: { expiresAt?: number };
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
            | {
                op: "delete";
                source: {
                  attributes?: { expiresAt?: number };
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
            | {
                attributes: { expiresAt?: null | number };
                op: "setAttributes";
                source: {
                  attributes?: { expiresAt?: number };
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
          >;
        },
        null
      >;
    };
    ops: {
      basics: {
        copyByPath: FunctionReference<
          "mutation",
          "internal",
          {
            config: {
              blobGracePeriod?: number;
              downloadUrlTtl?: number;
              storage:
                | {
                    apiKey: string;
                    cdnHostname: string;
                    region?: string;
                    storageZoneName: string;
                    tokenKey?: string;
                    type: "bunny";
                  }
                | { type: "test" };
            };
            destPath: string;
            sourcePath: string;
          },
          null
        >;
        deleteByPath: FunctionReference<
          "mutation",
          "internal",
          {
            config: {
              blobGracePeriod?: number;
              downloadUrlTtl?: number;
              storage:
                | {
                    apiKey: string;
                    cdnHostname: string;
                    region?: string;
                    storageZoneName: string;
                    tokenKey?: string;
                    type: "bunny";
                  }
                | { type: "test" };
            };
            path: string;
          },
          null
        >;
        list: FunctionReference<
          "query",
          "internal",
          {
            config: {
              blobGracePeriod?: number;
              downloadUrlTtl?: number;
              storage:
                | {
                    apiKey: string;
                    cdnHostname: string;
                    region?: string;
                    storageZoneName: string;
                    tokenKey?: string;
                    type: "bunny";
                  }
                | { type: "test" };
            };
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
            prefix?: string;
          },
          {
            continueCursor: string;
            isDone: boolean;
            page: Array<{
              attributes?: { expiresAt?: number };
              blobId: string;
              contentType: string;
              path: string;
              size: number;
            }>;
          }
        >;
        moveByPath: FunctionReference<
          "mutation",
          "internal",
          {
            config: {
              blobGracePeriod?: number;
              downloadUrlTtl?: number;
              storage:
                | {
                    apiKey: string;
                    cdnHostname: string;
                    region?: string;
                    storageZoneName: string;
                    tokenKey?: string;
                    type: "bunny";
                  }
                | { type: "test" };
            };
            destPath: string;
            sourcePath: string;
          },
          null
        >;
        stat: FunctionReference<
          "query",
          "internal",
          {
            config: {
              blobGracePeriod?: number;
              downloadUrlTtl?: number;
              storage:
                | {
                    apiKey: string;
                    cdnHostname: string;
                    region?: string;
                    storageZoneName: string;
                    tokenKey?: string;
                    type: "bunny";
                  }
                | { type: "test" };
            };
            path: string;
          },
          null | {
            attributes?: { expiresAt?: number };
            blobId: string;
            contentType: string;
            path: string;
            size: number;
          }
        >;
      };
      transact: {
        commitFiles: FunctionReference<
          "mutation",
          "internal",
          {
            config: {
              blobGracePeriod?: number;
              downloadUrlTtl?: number;
              storage:
                | {
                    apiKey: string;
                    cdnHostname: string;
                    region?: string;
                    storageZoneName: string;
                    tokenKey?: string;
                    type: "bunny";
                  }
                | { type: "test" };
            };
            files: Array<{
              attributes?: { expiresAt?: number };
              basis?: null | string;
              blobId: string;
              path: string;
            }>;
          },
          null
        >;
        transact: FunctionReference<
          "mutation",
          "internal",
          {
            config: {
              blobGracePeriod?: number;
              downloadUrlTtl?: number;
              storage:
                | {
                    apiKey: string;
                    cdnHostname: string;
                    region?: string;
                    storageZoneName: string;
                    tokenKey?: string;
                    type: "bunny";
                  }
                | { type: "test" };
            };
            ops: Array<
              | {
                  dest: { basis?: null | string; path: string };
                  op: "move";
                  source: {
                    attributes?: { expiresAt?: number };
                    blobId: string;
                    contentType: string;
                    path: string;
                    size: number;
                  };
                }
              | {
                  dest: { basis?: null | string; path: string };
                  op: "copy";
                  source: {
                    attributes?: { expiresAt?: number };
                    blobId: string;
                    contentType: string;
                    path: string;
                    size: number;
                  };
                }
              | {
                  op: "delete";
                  source: {
                    attributes?: { expiresAt?: number };
                    blobId: string;
                    contentType: string;
                    path: string;
                    size: number;
                  };
                }
              | {
                  attributes: { expiresAt?: null | number };
                  op: "setAttributes";
                  source: {
                    attributes?: { expiresAt?: number };
                    blobId: string;
                    contentType: string;
                    path: string;
                    size: number;
                  };
                }
            >;
          },
          null
        >;
      };
    };
    transfer: {
      getDownloadUrl: FunctionReference<
        "action",
        "internal",
        {
          blobId: string;
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          extraParams?: Record<string, string>;
        },
        string
      >;
      registerPendingUpload: FunctionReference<
        "mutation",
        "internal",
        {
          blobId: string;
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          contentType: string;
          size: number;
        },
        null
      >;
    };
  };
  timeline: {
    lib: {
      clear: FunctionReference<"mutation", "internal", { scope: string }, null>;
      createCheckpoint: FunctionReference<
        "mutation",
        "internal",
        { name: string; scope: string },
        null
      >;
      deleteCheckpoint: FunctionReference<
        "mutation",
        "internal",
        { name: string; scope: string },
        null
      >;
      deleteScope: FunctionReference<
        "mutation",
        "internal",
        { scope: string },
        null
      >;
      getCheckpointDocument: FunctionReference<
        "query",
        "internal",
        { name: string; scope: string },
        any | null
      >;
      getCurrentDocument: FunctionReference<
        "query",
        "internal",
        { scope: string },
        any | null
      >;
      getDocumentAtPosition: FunctionReference<
        "query",
        "internal",
        { position: number; scope: string },
        any | null
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { scope: string },
        {
          canRedo: boolean;
          canUndo: boolean;
          length: number;
          position: number | null;
        }
      >;
      listCheckpoints: FunctionReference<
        "query",
        "internal",
        { scope: string },
        Array<{ name: string; position: number | null }>
      >;
      listNodes: FunctionReference<
        "query",
        "internal",
        { scope: string },
        Array<{ document: any; position: number }>
      >;
      push: FunctionReference<
        "mutation",
        "internal",
        { document: any; maxNodes?: number; scope: string },
        null
      >;
      redo: FunctionReference<
        "mutation",
        "internal",
        { count?: number; scope: string },
        any | null
      >;
      restoreCheckpoint: FunctionReference<
        "mutation",
        "internal",
        { maxNodes?: number; name: string; scope: string },
        any
      >;
      undo: FunctionReference<
        "mutation",
        "internal",
        { count?: number; scope: string },
        any | null
      >;
    };
  };
  tracer: {
    lib: {
      addLog: FunctionReference<
        "mutation",
        "internal",
        {
          log: {
            message: string;
            metadata?: Record<string, any>;
            severity: "info" | "warn" | "error";
            timestamp: number;
          };
          spanId: string;
        },
        string
      >;
      cleanupTrace: FunctionReference<
        "mutation",
        "internal",
        { traceId: string },
        null
      >;
      completeSpan: FunctionReference<
        "mutation",
        "internal",
        {
          duration: number;
          endTime: number;
          error?: string;
          result?: any;
          spanId: string;
          status: "success" | "error";
        },
        null
      >;
      createSpan: FunctionReference<
        "mutation",
        "internal",
        {
          span: {
            args?: any;
            functionName?: string;
            parentSpanId?: string;
            source: "frontend" | "backend";
            spanName: string;
            startTime: number;
            status: "pending" | "success" | "error";
          };
          traceId: string;
        },
        string
      >;
      createTrace: FunctionReference<
        "mutation",
        "internal",
        {
          metadata?: Record<string, any>;
          sampleRate: number;
          source: "frontend" | "backend";
          status: "pending" | "success" | "error";
          userId: "anonymous" | string;
        },
        string
      >;
      getTrace: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        null | {
          _creationTime: number;
          _id: string;
          functionName?: string;
          metadata?: Record<string, any>;
          preserve?: boolean;
          sampleRate: number;
          spans: Array<{
            _creationTime: number;
            _id: string;
            args?: any;
            children?: Array<any>;
            duration?: number;
            endTime?: number;
            error?: string;
            functionName?: string;
            logs?: Array<{
              _creationTime: number;
              _id: string;
              message: string;
              metadata?: Record<string, any>;
              severity: "info" | "warn" | "error";
              spanId: string;
              timestamp: number;
            }>;
            metadata?: Record<string, any>;
            parentSpanId?: string;
            result?: any;
            source: "frontend" | "backend";
            spanName: string;
            startTime: number;
            status: "pending" | "success" | "error";
            traceId: string;
          }>;
          status: "pending" | "success" | "error";
          updatedAt: number;
          userId?: string;
        }
      >;
      listTraces: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          status?: "pending" | "success" | "error";
          userId?: string;
        },
        Array<{
          _creationTime: number;
          _id: string;
          functionName?: string;
          metadata?: Record<string, any>;
          preserve?: boolean;
          sampleRate: number;
          status: "pending" | "success" | "error";
          updatedAt: number;
          userId?: string;
        }>
      >;
      searchTraces: FunctionReference<
        "query",
        "internal",
        {
          functionName: string;
          limit?: number;
          status?: "pending" | "success" | "error";
          userId?: string;
        },
        Array<{
          _creationTime: number;
          _id: string;
          functionName?: string;
          metadata?: Record<string, any>;
          preserve?: boolean;
          sampleRate: number;
          status: "pending" | "success" | "error";
          updatedAt: number;
          userId?: string;
        }>
      >;
      updateSpanMetadata: FunctionReference<
        "mutation",
        "internal",
        { metadata: Record<string, any>; spanId: string },
        null
      >;
      updateTraceMetadata: FunctionReference<
        "mutation",
        "internal",
        { metadata: Record<string, any>; traceId: string },
        null
      >;
      updateTracePreserve: FunctionReference<
        "mutation",
        "internal",
        { preserve?: boolean; sampleRate?: number; traceId: string },
        null
      >;
      updateTraceStatus: FunctionReference<
        "mutation",
        "internal",
        { status: "pending" | "success" | "error"; traceId: string },
        null
      >;
      verifySpan: FunctionReference<
        "query",
        "internal",
        { spanId: string },
        boolean
      >;
      verifyTrace: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        boolean
      >;
    };
  };
  workflow: {
    event: {
      create: FunctionReference<
        "mutation",
        "internal",
        { name: string; workflowId: string },
        string
      >;
      send: FunctionReference<
        "mutation",
        "internal",
        {
          eventId?: string;
          name?: string;
          result:
            | { kind: "success"; returnValue: any }
            | { error: string; kind: "failed" }
            | { kind: "canceled" };
          workflowId?: string;
          workpoolOptions?: {
            defaultRetryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
            retryActionsByDefault?: boolean;
          };
        },
        string
      >;
    };
    journal: {
      load: FunctionReference<
        "query",
        "internal",
        { shortCircuit?: boolean; workflowId: string },
        {
          blocked?: boolean;
          journalEntries: Array<{
            _creationTime: number;
            _id: string;
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
            stepNumber: number;
            workflowId: string;
          }>;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          ok: boolean;
          workflow: {
            _creationTime: number;
            _id: string;
            args: any;
            generationNumber: number;
            logLevel?: any;
            name?: string;
            onComplete?: { context?: any; fnHandle: string };
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt?: any;
            state?: any;
            workflowHandle: string;
          };
        }
      >;
      startSteps: FunctionReference<
        "mutation",
        "internal",
        {
          generationNumber: number;
          steps: Array<{
            retry?:
              | boolean
              | { base: number; initialBackoffMs: number; maxAttempts: number };
            schedulerOptions?: { runAt?: number } | { runAfter?: number };
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
          }>;
          workflowId: string;
          workpoolOptions?: {
            defaultRetryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
            retryActionsByDefault?: boolean;
          };
        },
        Array<{
          _creationTime: number;
          _id: string;
          step:
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                functionType: "query" | "mutation" | "action";
                handle: string;
                inProgress: boolean;
                kind?: "function";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workId?: string;
              }
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                handle: string;
                inProgress: boolean;
                kind: "workflow";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workflowId?: string;
              }
            | {
                args: { eventId?: string };
                argsSize: number;
                completedAt?: number;
                eventId?: string;
                inProgress: boolean;
                kind: "event";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
              };
          stepNumber: number;
          workflowId: string;
        }>
      >;
    };
    workflow: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { workflowId: string },
        null
      >;
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { force?: boolean; workflowId: string },
        boolean
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          generationNumber: number;
          runResult:
            | { kind: "success"; returnValue: any }
            | { error: string; kind: "failed" }
            | { kind: "canceled" };
          workflowId: string;
        },
        null
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          maxParallelism?: number;
          onComplete?: { context?: any; fnHandle: string };
          startAsync?: boolean;
          workflowArgs: any;
          workflowHandle: string;
          workflowName: string;
        },
        string
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { workflowId: string },
        {
          inProgress: Array<{
            _creationTime: number;
            _id: string;
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
            stepNumber: number;
            workflowId: string;
          }>;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          workflow: {
            _creationTime: number;
            _id: string;
            args: any;
            generationNumber: number;
            logLevel?: any;
            name?: string;
            onComplete?: { context?: any; fnHandle: string };
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt?: any;
            state?: any;
            workflowHandle: string;
          };
        }
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            context?: any;
            name?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listByName: FunctionReference<
        "query",
        "internal",
        {
          name: string;
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            context?: any;
            name?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listSteps: FunctionReference<
        "query",
        "internal",
        {
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          workflowId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            completedAt?: number;
            eventId?: string;
            kind: "function" | "workflow" | "event";
            name: string;
            nestedWorkflowId?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt: number;
            stepId: string;
            stepNumber: number;
            workId?: string;
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      restart: FunctionReference<
        "mutation",
        "internal",
        { from?: number | string; startAsync?: boolean; workflowId: string },
        null
      >;
    };
  };
};
