import { test } from '@playwright/test';
import { HomePageMig, LeadPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  baselineDetails, newLeadMergingRun, loginAndOpenLeadsOnMig, MergeVerifyLog, teardownLeadMergingRun, sweepLeadMergingRunsAfterAll, LeadMergingRun, CreatedRecord, createLeadOnMig, openRecordByUrl, verifyStep, watchNoMergeWindowOnMig, companyEmail, recordName,
} from '@helpers/lead-merging-mig.helper';

/**
 * ============================================================================================
 *  CRM-12370_9.3.2 - Lead Merging: NO merge - same company domain, different email (Item#5) (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_9.3.2
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-30
 *  Run as          : Odoo Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *  Baseline        : CRM-2178_2.1.1.1 (Jira CRM-9159) - assertions ported unchanged
 *                    tests/1.Project_CRM/3.Lead_Merging/CRM-2178_Lead_merging_rules_update_Sept-23/2. Leads_are_NOT_qualified_to_be_merged/2.1.(Item#5)Multiple_leads_with_the_same_company_domain_but_different_email/tc-crm-2178-2-1-1-1-NOT-merge-leads-same-company-email-first-lead-is-manual.spec.ts
 *  Source version  : CRM-9159 updated 2026-03-20T05:33+0200 - re-check before trusting this spec
 *  Bug (SKIPPED)   : CRM-14069 - skipped on the tester's request 2026-11-04; un-skip when CRM-14069 is fixed.
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Two leads on the same new company domain but with different e-mails (Lead1@ / Lead2@), no contact created
 *  beforehand. Verifies they are NOT merged: both stay Active with their own tag, fields and Lead form.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_9\.3\.2:" --project=MigSmoke --workers=1
 *  npx playwright test --grep "CRM-14069" --project=MigSmoke --workers=1
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - the assertions are the baseline's)
 * --------------------------------------------------------------------------------------------
 *  - Login users.admin_crm_mig on baseUrl_mig; CRM lists opened by URL hash (HomePageMig).
 *  - Notebook tabs (CRM Developer, Deal registration) opened inline or through the form's "More (N)" dropdown
 *    (LeadPageMig / OpportunityPageMig): the crm-mig form folds overflow tabs there, CRM Developer among them.
 *  - Merge wait: up to 35 min, polled every minute (merge) / watched for the whole window (no merge), instead of
 *    the baseline's 1-6 min: a merge missed at creation is only made by the 20-min re-scan cron on crm-mig
 *    (CRM-12621), once the lead is ~10 min old (measured 2026-10-28). The pre-prod deferred no-merge re-check is
 *    replaced by that full-window watch.
 *  - Run marker: every e-mail carries company-crm12370-9-3-2-<runId>, record names "... CRM-12370_9.3.2 <runId>".
 *  - Each verification point is a soft assertion (one 55-min run reports every difference); values unchanged.
 *  - Clean-up: afterEach deletes the records this run created and the partners carrying the run marker;
 *    afterAll sweeps the run marker (deny-list, counted first).
 *  - Data: the baseline built the two e-mails with generateEmail() a few seconds apart, so its two DOMAINS differed;
 *    here both share ONE domain (Lead1@ / Lead2@) as the manual TC states (same company domain, different email).
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (baseline header, verbatim)
 * --------------------------------------------------------------------------------------------
 *  Pre-condition:
 *  1. After login successful, click at "CRM" button
 *  2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 *
 *  I. Condition#1 to create Lead#1:
 *  1. On "Leads" page, click at "CREATE" button
 *  2. Enter the following information:
 *     - Lead name textbox = TEST Lead 1 + current TC ID
 *     - Email textbox = Company email (with template Lead1@company + current date + current time.com)
 *       (Remember the created email, called Email_Lead#1)
 *     - (in the Address section)
 *       - Company Name textbox = Company Name Lead 1
 *       - Street dropdown list = 123street
 *       - Country dropdown list = Belgium
 *       - State dropdown list = Flanders
 *     - Sales Team dropdown list is cleared
 *     - Salesperson dropdown list is cleared
 *     - Created manually checkbox = TRUE
 *     - Tags = "Can_Merge"
 *  3. Click at "CRM Developer" tab at the bottom of page
 *     - Lead form textbox = BLANK
 *  4. Press "SAVE" button
 *  5. Copy URL of Lead#1, called URL_Lead#1
 *
 *  II. Condition#2 to create Lead#2:
 *  1. On "Leads" page, click at "CREATE" button
 *  2. Enter the following information:
 *     - Lead name textbox = TEST Lead 2 + current TC ID
 *     - Email textbox = Company email (with template Lead2@company + current date + current time.com)
 *       (Remember the created email, called Email_Lead#2)
 *     - (in the Address section)
 *       - Company Name textbox = Company Name Lead 2
 *       - Contact Name textbox = Contact Name Lead 2
 *       - Street dropdown list = 123street
 *       - Country dropdown list = United States
 *       - State dropdown list = Texas (US)
 *     - Sales Team dropdown list is cleared
 *     - Salesperson dropdown list is cleared
 *     - Created manually checkbox = FALSE
 *  3. Click at "CRM Developer" tab at the bottom of page
 *     - Lead form textbox = License
 *  4. Press "SAVE" button
 *  5. Copy URL of Lead#2, called URL_Lead#2
 *
 *  Steps to reproduce:
 *  III. Verify on Lead#1:
 *  1. Wait for 1 minute for Lead Merging NOT happened
 *  2. Open the Lead 1 using URL_Lead#1
 *  3. Verify the following:
 *     3.1. Tag field contains 1 value: "Can_Merge"
 *     3.2. Company Name textbox = Company Name Lead 1
 *     3.3. Street dropdown list = 123street
 *     3.4. Country dropdown list = Belgium
 *     3.5. State dropdown list = Flanders
 *     3.6. Sales Team dropdown list has a value or not
 *     3.7. Email textbox = Email_Lead#1 that created previously
 *  4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *     4.1. Lead form textbox = BLANK
 *     4.2. Active checkbox = TRUE
 *     4.3. Is Won = Pending
 *     4.4. Lost Reason = BLANK
 *
 *  IV. Verify on Lead#2:
 *  1. Open the Lead 2 using URL_Lead#2
 *  2. Verify the following:
 *     2.1. Tag field contains "Product Registration"
 *     2.2. Company Name textbox = Company Name Lead 2
 *     2.3. Street dropdown list = 123street
 *     2.4. Country dropdown list = United States
 *     2.5. State dropdown list = Texas (US)
 *     2.6. Sales Team dropdown list has a value or not
 *     2.7. Email textbox = Email_Lead#2
 *  3. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *     3.1. Lead form textbox = License
 *     3.2. Active checkbox = TRUE
 *     3.3. Is Won = Pending
 *     3.4. Lost Reason = BLANK
 * ============================================================================================
 */

const TC = 'CRM-12370_9.3.2';
const SKIP_CLEANUP_MIG = false; // 2026-11-02: teardown back ON before the push (was OFF for the 11:58 run's investigation; leads 100005114/115 of that run are still on crm-mig)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition 1-2: After login successful, click at "CRM" button, then select "Leads" item then "Leads" sub-item (crm-mig: opened by URL hash - the sidebar theme hides the top menu)',
  c1: 'Condition #1 (steps 1-5): Create Lead #1 (Created Manually = TRUE, Tag = Can_Merge, Lead Form = BLANK)',
  c2: 'Condition #2 (steps 1-5): Create Lead #2 (Created Manually = FALSE, Lead Form = License)',
  s1: 'Step 1: Wait for 1 minute for Lead Merging NOT happened (crm-mig: watch the whole 35-min window - a merge missed at creation is only made by the 20-min re-scan, once the lead is ~10 min old)',
  s2: 'Step 2: Open the Lead 1 using URL_Lead#1',
  s3: 'Step 3: Verify the following fields on Lead #1',
  s3_1: 'Step 3.1: Tag field contains 1 value: "Can_Merge"',
  s3_2: 'Step 3.2: Company Name textbox = Company Name Lead 1',
  s3_3: 'Step 3.3: Street dropdown list = 123street',
  s3_4: 'Step 3.4: Country dropdown list = Belgium',
  s3_5: 'Step 3.5: State dropdown list = Flanders',
  s3_6: 'Step 3.6: Sales Team dropdown list has a value or not',
  s3_7: 'Step 3.7: Email textbox = Email_Lead#1',
  s4: 'Step 4: Click at "CRM Developer" tab and verify the following',
  s4_1: 'Step 4.1: Lead form textbox = BLANK',
  s4_2: 'Step 4.2: Active checkbox = TRUE',
  s4_3: 'Step 4.3: Is Won = Pending',
  s4_4: 'Step 4.4: Lost Reason = BLANK',
  s5: 'Step 5: Open the Lead 2 using URL_Lead#2',
  s6: 'Step 6: Verify the following fields on Lead #2',
  s6_1: 'Step 6.1: Tag field contains "Product Registration"',
  s6_2: 'Step 6.2: Company Name textbox = Company Name Lead 2',
  s6_3: 'Step 6.3: Street dropdown list = 123street',
  s6_4: 'Step 6.4: Country dropdown list = United States',
  s6_5: 'Step 6.5: State dropdown list = Texas (US)',
  s6_6: 'Step 6.6: Sales Team dropdown list has a value or not',
  s6_7: 'Step 6.7: Email textbox = Email_Lead#2',
  s7: 'Step 7: Click at "CRM Developer" tab and verify the following',
  s7_1: 'Step 7.1: Lead form textbox = License',
  s7_2: 'Step 7.2: Active checkbox = TRUE',
  s7_3: 'Step 7.3: Is Won = Pending',
  s7_4: 'Step 7.4: Lost Reason = BLANK',
  verify: 'Verification',
} as const;

let run: LeadMergingRun | undefined;

test.describe(`${TC} - Lead Merging: Same Company Domain but Different Email (NO Merging)`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await teardownLeadMergingRun(page, testInfo, run, SKIP_CLEANUP_MIG);
  });

  test.afterAll(async ({ browser }) => {
    await sweepLeadMergingRunsAfterAll(browser, SKIP_CLEANUP_MIG);
  });

  // Skipped due to bug CRM-14069 - declaration-level skip, so no browser starts and no record is created;
  // un-skip when CRM-14069 is fixed.
  test.skip(`${TC}: Verify merging leads will NOT happen with same company domain but different email [CRM-14069]`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.leadMergeMigTest);
    run = newLeadMergingRun(TC);
    const leadPage = new LeadPageMig(page);
    const vlog = new MergeVerifyLog();
    let homePage!: HomePageMig;
    const email1 = companyEmail(run, 'Lead1');
    const email2 = companyEmail(run, 'Lead2');
    const lead1Name = recordName(run, 'TEST Lead 1');
    const lead2Name = recordName(run, 'TEST Lead 2');
    let lead1!: CreatedRecord;
    let lead2!: CreatedRecord;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      homePage = await loginAndOpenLeadsOnMig(page);
    });

    await test.step(STEP.c1, async () => {
      console.log(`\n--- ${STEP.c1} ---`);
      lead1 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead1Name, email: email1, companyName: 'Company Name Lead 1', street: '123street', country: 'Belgium', state: 'Flanders', salesTeam: null, salesperson: null, createdManually: true, tags: ['Can_Merge'], leadForm: ''
      }, 'Condition #1 - Lead #1');
    });

    await test.step(STEP.c2, async () => {
      console.log(`\n--- ${STEP.c2} ---`);
      lead2 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead2Name, email: email2, companyName: 'Company Name Lead 2', contactName: 'Contact Name Lead 2', street: '123street', country: 'United States', state: 'Texas', salesTeam: null, salesperson: null, createdManually: false, leadForm: 'License'
      }, 'Condition #2 - Lead #2');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await watchNoMergeWindowOnMig(page, leadPage, [{ url: lead1.url, name: lead1Name }, { url: lead2.url, name: lead2Name }]);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await openRecordByUrl(page, leadPage, lead1.url);
    });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s3, [
      { label: STEP.s3_1, kind: 'tags', expected: ['Can_Merge'], not: ['Product Registration'] },
      { label: STEP.s3_2, kind: 'company', expected: 'Company Name Lead 1' },
      { label: STEP.s3_3, kind: 'address', expected: '123street' },
      { label: STEP.s3_4, kind: 'address', expected: 'Belgium' },
      { label: STEP.s3_5, kind: 'address', expected: 'Flanders' },
      { label: STEP.s3_6, kind: 'salesTeamObserve' },
      { label: STEP.s3_7, kind: 'email', expected: email1 },
    ]);

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s4, [
      { label: STEP.s4_1, kind: 'leadFormBe', expected: '' },
      { label: STEP.s4_2, kind: 'activeTrue' },
      { label: STEP.s4_3, kind: 'isWon', expected: 'Pending' },
      { label: STEP.s4_4, kind: 'lostReason', expected: '' },
    ], () => leadPage.clickCRMDeveloperTab());

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await openRecordByUrl(page, leadPage, lead2.url);
    });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s6, [
      { label: STEP.s6_1, kind: 'tags', expected: ['Product Registration'] },
      { label: STEP.s6_2, kind: 'company', expected: 'Company Name Lead 2' },
      { label: STEP.s6_3, kind: 'address', expected: '123street' },
      { label: STEP.s6_4, kind: 'address', expected: 'United States' },
      { label: STEP.s6_5, kind: 'address', expected: 'Texas' },
      { label: STEP.s6_6, kind: 'salesTeamObserve' },
      { label: STEP.s6_7, kind: 'email', expected: email2 },
    ]);

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s7, [
      { label: STEP.s7_1, kind: 'leadFormBe', expected: 'License' },
      { label: STEP.s7_2, kind: 'activeTrue' },
      { label: STEP.s7_3, kind: 'isWon', expected: 'Pending' },
      { label: STEP.s7_4, kind: 'lostReason', expected: '' },
    ], () => leadPage.clickCRMDeveloperTab());

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      vlog.print('Lead #1 and Lead #2 (same domain, different e-mails) were NOT merged - both Active with their own values');
    });
  });
});
