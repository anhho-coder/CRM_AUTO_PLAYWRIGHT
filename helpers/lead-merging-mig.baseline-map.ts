/**
 * CRM-12370 section 9 - Leads Merging on crm-mig: which pre-production BASELINE each crm-mig spec was ported from.
 * ONE source of truth for the traceability shown in the reports (see baselineDetails() in lead-merging-mig.helper.ts).
 *
 *  key           crm-mig Test Case ID (the spec's `const TC`)
 *  baselineTc    pre-production Test Case ID (tests/1.Project_CRM/3.Lead_Merging)
 *  baselineJira  Xray "Post-EA - Test Case" of the baseline - read on Jira 2026-10-30 with one bounded JQL; summary starts
 *                with baselineTc. Where Xray holds two copies (CRM-49xx/50xx and the later "Summary:" CRM-88xx/91xx), the
 *                later copy is used - it is the one the pre-production automation was matched to.
 *  baselineSpec  the baseline automation spec, repo-relative
 *  masterRow     row of the crm-mig manual TC in master tab "Migration - Setup New CRM" - 0 until the 20 rows are added
 *  migJira       Xray key of the crm-mig manual TC - EMPTY until imported; fill it in here, nowhere else
 */
import type { BaselineLink } from '@helpers/baseline-traceability';

const LM = 'tests/1.Project_CRM/3.Lead_Merging';

export const CRM12370_LEAD_MERGING_BASELINE_MAP: Readonly<Record<string, BaselineLink>> = {
  // 9.1 Merge
  'CRM-12370_9.1.1': { baselineTc: 'CRM-2178_1.1.1.1', baselineJira: 'CRM-9150', baselineSpec: `${LM}/CRM-2178_Lead_merging_rules_update_Sept-23/1.Leads_are_qualified_to_be_merged/1.1.Multiple-leads-with-the-same-company-email/1.1.1.Leads-with-different-priority-if/tc-crm-2178-1-1-1-1-merge-leads-same-company-email-lower-priority-manual.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.1.2': { baselineTc: 'CRM-2178_1.1.2.1', baselineJira: 'CRM-9153', baselineSpec: `${LM}/CRM-2178_Lead_merging_rules_update_Sept-23/1.Leads_are_qualified_to_be_merged/1.1.Multiple-leads-with-the-same-company-email/1.1.2.Leads-with-same-priority-if/tc-crm-2178-1-1-2-1-merge-leads-same-company-email-first-lead-is-manual.spec.ts`, masterRow: 0, migJira: '' },
  // Was SKIPPED by bug CRM-14065 (crm-mig emptied Company Name on both leads after a PUBLIC-domain merge, the baseline
  // keeps it - Step 3.2 / 7.2). CRM-14065 Resolved 2026-11-02, spec un-skipped the same day.
  'CRM-12370_9.1.3': { baselineTc: 'CRM-542_1.2.1.1', baselineJira: 'CRM-8899', baselineSpec: `${LM}/CRM-542_Lead_merging_rules_updated/1.Leads-are-qualified-to-be-merged/1.2.Multiple-leads-same-public-domain-email/1.2.1.Leads-with-different-priority-if/tc-crm-542-1-2-1-1-merge-leads-public-domain-ib-renewal.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.1.4': { baselineTc: 'CRM-542_1.1.1.2', baselineJira: 'CRM-8897', baselineSpec: `${LM}/CRM-542_Lead_merging_rules_updated/1.Leads-are-qualified-to-be-merged/1.1.Multiple-leads-same-company-domain-email/1.1.1.Leads-with-different-priority-if/tc-crm-542-1-1-1-2-merge-leads-partner-signup-same-priority.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.1.5': { baselineTc: 'CRM-542_1.1.2.1', baselineJira: 'CRM-8898', baselineSpec: `${LM}/CRM-542_Lead_merging_rules_updated/1.Leads-are-qualified-to-be-merged/1.1.Multiple-leads-same-company-domain-email/1.1.2.Leads-with-equal-priority-some-filled-fields-not-same/tc-crm-542-1-1-2-1-merge-leads-equal-priority-different-fields.spec.ts`, masterRow: 0, migJira: '' },
  // 9.2 Clone Deal Registration
  'CRM-12370_9.2.1': { baselineTc: 'CRM-1992_1.1.1.1.1', baselineJira: 'CRM-9110', baselineSpec: `${LM}/CRM-1992_Lead_merging/1.Deal-registration-will-be-cloned-from-Source-Lead-to-Target-Lead/1.1.Leads-same-company-email/1.1.1.Leads-different-priority-if/1.1.1.1.Lower-priority-lead-is-created-manually-and-has-tag-can_merge-and/tc-crm-1992-1-1-1-1-1-merge-leads-same-company-email-with-download-free-trial.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.2.2': { baselineTc: 'CRM-1992_1.2.1.1.1', baselineJira: 'CRM-9132', baselineSpec: `${LM}/CRM-1992_Lead_merging/1.Deal-registration-will-be-cloned-from-Source-Lead-to-Target-Lead/1.2.Multiple-leads-same-public-email/1.2.1.Leads-with-different-priority-if/1.2.1.1.Lower-priority-lead-is-created-manually-and-has-tag-can_merge-and/tc-crm-1992-1-2-1-1-1-merge-leads-same-public-email-with-download-free-trial.spec.ts`, masterRow: 0, migJira: '' },
  // 9.3 No merge
  'CRM-12370_9.3.1': { baselineTc: 'CRM-542_2.3.1', baselineJira: 'CRM-8905', baselineSpec: `${LM}/CRM-542_Lead_merging_rules_updated/2.Leads-are-NOT-qualified-to-be-merged/2.3.Multiple-leads-different-emails/tc-crm-542-2-3-1-no-merge-leads-different-email-domain.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.3.2': { baselineTc: 'CRM-2178_2.1.1.1', baselineJira: 'CRM-9159', baselineSpec: `${LM}/CRM-2178_Lead_merging_rules_update_Sept-23/2. Leads_are_NOT_qualified_to_be_merged/2.1.(Item#5)Multiple_leads_with_the_same_company_domain_but_different_email/tc-crm-2178-2-1-1-1-NOT-merge-leads-same-company-email-first-lead-is-manual.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.3.3': { baselineTc: 'CRM-542_2.2.1', baselineJira: 'CRM-8903', baselineSpec: `${LM}/CRM-542_Lead_merging_rules_updated/2.Leads-are-NOT-qualified-to-be-merged/2.2.Multiple-leads-different-company/tc-crm-542-2-2-1-no-merge-each-lead-has-each-company.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.3.4': { baselineTc: 'CRM-1664_1.1.1', baselineJira: 'CRM-9106', baselineSpec: `${LM}/CRM-1664_Marketing_lead_merging/1.Leads-are-NOT-qualified-to-be-merged/1.1.And-adding-a-totally-new-contact-email/tc-crm-1664-1-1-1-no-merge-bdeu-marketing-bdr-new-email.spec.ts`, masterRow: 0, migJira: '' },
  // 9.4 Rule 7 - Sales Team / Salesperson
  'CRM-12370_9.4.1': { baselineTc: 'CRM-9059_7.1.4', baselineJira: 'CRM-11429', baselineSpec: `${LM}/CRM-9059_(Rule7)_Lead.Salesteam-or-Lead.Salesperson-is-not-empty-for-both-leads-not-be-merged/A.Sales-Team/tc-crm-9059-7-1-4-salesteam-different-NO-merge.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.4.2': { baselineTc: 'CRM-9059_7.2.4', baselineJira: 'CRM-11433', baselineSpec: `${LM}/CRM-9059_(Rule7)_Lead.Salesteam-or-Lead.Salesperson-is-not-empty-for-both-leads-not-be-merged/B.Salesperson/tc-crm-9059-7-2-4-salesperson-different-NO-merge.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.4.3': { baselineTc: 'CRM-9059_7.3.1', baselineJira: 'CRM-11434', baselineSpec: `${LM}/CRM-9059_(Rule7)_Lead.Salesteam-or-Lead.Salesperson-is-not-empty-for-both-leads-not-be-merged/C.Combined/tc-crm-9059-7-3-1-sameteam-diff-salesperson-NO-merge.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.4.4': { baselineTc: 'CRM-9059_7.3.4', baselineJira: 'CRM-11437', baselineSpec: `${LM}/CRM-9059_(Rule7)_Lead.Salesteam-or-Lead.Salesperson-is-not-empty-for-both-leads-not-be-merged/C.Combined/tc-crm-9059-7-3-4-sameteam-same-salesperson-MERGE.spec.ts`, masterRow: 0, migJira: '' },
  // 9.5 Enterprise account
  'CRM-12370_9.5.1': { baselineTc: 'CRM-11284_1.1', baselineJira: 'CRM-11744', baselineSpec: `${LM}/CRM-11284_Source-Lead-has-Enterprise_account-tag-should-NOT-merged/1.NOT Merged Lead/tc-crm-11284-1-1-enterprise-account-lead-not-merged.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.5.2': { baselineTc: 'CRM-11284_1.3', baselineJira: 'CRM-11745', baselineSpec: `${LM}/CRM-11284_Source-Lead-has-Enterprise_account-tag-should-NOT-merged/1.NOT Merged Lead/tc-crm-11284-1-3-enterprise-renewal-not-merged-by-investment-import.spec.ts`, masterRow: 0, migJira: '' },
  // 9.6 Lead into Opp / manual merge
  'CRM-12370_9.6.1': { baselineTc: 'LeadMerging-Exploratory_1.1', baselineJira: 'CRM-9312', baselineSpec: `${LM}/Exploratory_test_cases/1.Merge_Lead_into_Opp/LeadMerging-Exploratory_1.1-Lead-merge-Opp.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.6.2': { baselineTc: 'LeadMerging-Exploratory_4.1', baselineJira: 'CRM-9317', baselineSpec: `${LM}/Exploratory_test_cases/4.Merge_Lead_into_many_potential_target_Lead/LeadMerging-Exploratory_4.1-Download-Free_Trial-Lead-merge-two_IBNC_Lead-Leads.spec.ts`, masterRow: 0, migJira: '' },
  'CRM-12370_9.6.3': { baselineTc: 'CRM-10066_1.1', baselineJira: 'CRM-11418', baselineSpec: `${LM}/Manual_Lead_Merging_test_cases/CRM-10066_Cannot-make-manual-merging-using-Conver_to_opportunity-option/tc-crm-10066-1-1-manual-merge-convert-to-opportunity.spec.ts`, masterRow: 0, migJira: '' },
};
