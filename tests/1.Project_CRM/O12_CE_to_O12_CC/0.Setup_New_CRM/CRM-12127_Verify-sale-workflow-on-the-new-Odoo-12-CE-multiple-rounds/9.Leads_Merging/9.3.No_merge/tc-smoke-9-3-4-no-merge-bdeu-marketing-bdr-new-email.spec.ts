import { test } from '@playwright/test';
import { HomePageMig, LeadPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  baselineDetails, newLeadMergingRun, loginAndOpenLeadsOnMig, MergeVerifyLog, teardownLeadMergingRun, sweepLeadMergingRunsAfterAll, LeadMergingRun, CreatedRecord, createLeadOnMig, openRecordByUrl, verifyStep, watchNoMergeWindowOnMig, companyEmail, recordName,
} from '@helpers/lead-merging-mig.helper';

/**
 * ============================================================================================
 *  CRM-12370_9.3.4 - Lead Merging: NO merge - BDEU lead and Marketing - BDR lead with a new email (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_9.3.4
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-30
 *  Run as          : Odoo Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *  Baseline        : CRM-1664_1.1.1 (Jira CRM-9106) - assertions ported unchanged
 *                    tests/1.Project_CRM/3.Lead_Merging/CRM-1664_Marketing_lead_merging/1.Leads-are-NOT-qualified-to-be-merged/1.1.And-adding-a-totally-new-contact-email/tc-crm-1664-1-1-1-no-merge-bdeu-marketing-bdr-new-email.spec.ts
 *  Source version  : CRM-9106 updated 2026-03-20T05:31+0200 - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Two leads share one new company e-mail: Lead #1 on BDEU (License), Lead #2 on Marketing - BDR (Trial Download
 *  QNAP). Verifies they are NOT merged: both stay Active with their own team and Lead form.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_9\.3\.4:" --project=MigSmoke --workers=1
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
 *  - Run marker: every e-mail carries company-crm12370-9-3-4-<runId>, record names "... CRM-12370_9.3.4 <runId>".
 *  - Each verification point is a soft assertion (one 55-min run reports every difference); values unchanged.
 *  - Clean-up: afterEach deletes the records this run created and the partners carrying the run marker;
 *    afterAll sweeps the run marker (deny-list, counted first).
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
 *     - Email textbox = Company email (with template Test@company + current date + current time.com)
 *       (Remember the created email, called Email_Lead#1)
 *     - (in the Address section)
 *       - Company Name textbox = Company Name Lead 1
 *       - Street dropdown list = 123street
 *       - Country dropdown list = Belgium
 *       - State dropdown list = Brussels Capital
 *     - Sales Team dropdown list = BDEU
 *     - Salesperson dropdown list is cleared
 *     - Created manually checkbox = FALSE
 *  3. Click at "CRM Developer" tab at the bottom of page
 *     - Lead form textbox = License
 *  4. Press "SAVE" button
 *  5. Copy URL of Lead#1, called URL_Lead#1
 *
 *  II. Condition#2 to create Lead#2:
 *  1. On "Leads" page, click at "CREATE" button
 *  2. Enter the following information:
 *     - Lead name textbox = TEST Lead 2 + current TC ID
 *     - Email textbox = Email_Lead#1 that created in Condition#1
 *     - (in the Address section)
 *       - Company Name textbox = Company Name Lead 2
 *       - Contact Name textbox = Contact Name Lead 2
 *       - Street dropdown list = 123street
 *       - Country dropdown list = United States
 *       - State dropdown list = Texas (US)
 *     - Sales Team dropdown list = Marketing - BDR
 *     - Salesperson dropdown list is cleared
 *     - Created manually checkbox = FALSE
 *  3. Click at "CRM Developer" tab at the bottom of page
 *     - Lead form textbox = Trial Download QNAP
 *  4. Press "SAVE" button
 *  5. Copy URL of Lead#2, called URL_Lead#2
 *
 *  Steps to reproduce:
 *  1. Wait for 1 minute for Lead Merging happened
 *  2. Open the Lead 1 using URL_Lead#1
 *  3. Verify the following:
 *     3.1. Tag field is "Product Registration"
 *     3.2. Company Name textbox = Company Name Lead 1
 *     3.3. Street dropdown list = 123street
 *     3.4. Country dropdown list = Belgium
 *     3.5. State dropdown list = Brussels Capital
 *     3.6. Sales Team dropdown list = BDEU
 *     3.7. Email textbox = Email_Lead#1 that created previously
 *  4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *     4.1. Lead form textbox = License
 *     4.2. Active checkbox = TRUE
 *     4.3. Is Won = Pending
 *     4.4. Lost Reason = BLANK
 *
 *  6. Open the Lead 2 using URL_Lead#2
 *  7. Verify the following:
 *     7.1. Tag field is "Trial download"
 *     7.2. Company Name textbox = Company Name Lead 1 (auto set due to created Contact)
 *     7.3. Street dropdown list = 123street
 *     7.4. Country dropdown list = United States
 *     7.5. State dropdown list = Texas (US)
 *     7.6. Sales Team dropdown list = Marketing - BDR
 *     7.7. Email textbox = Email_Lead#1 that created previously
 *  8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *     8.1. Lead form textbox = Trial Download QNAP
 *     8.2. Active checkbox = TRUE
 *     8.3. Is Won = Pending
 *     8.4. Lost Reason = BLANK
 * ============================================================================================
 */

const TC = 'CRM-12370_9.3.4';
const SKIP_CLEANUP_MIG = false;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition 1-2: After login successful, click at "CRM" button, then select "Leads" item then "Leads" sub-item (crm-mig: opened by URL hash - the sidebar theme hides the top menu)',
  c1: 'Condition #1 (steps 1-5): Create Lead #1 with BDEU team and License form',
  c2: 'Condition #2 (steps 1-5): Create Lead #2 with Marketing - BDR team and Trial Download QNAP form',
  s1: 'Step 1: Wait to confirm NO merge happens (crm-mig: watch the whole 35-min window - a merge missed at creation is only made by the 20-min re-scan, once the lead is ~10 min old)',
  s2: 'Step 2: Open the Lead 1 using URL_Lead#1',
  s3: 'Step 3: Verify Lead #1 fields (should remain unchanged)',
  s3_1: 'Step 3.1: Verify Tag field is "Product Registration"',
  s3_2: 'Step 3.2: Verify Company Name = Company Name Lead 1 (readonly)',
  s3_3: 'Step 3.3: Verify Street = 123street (readonly)',
  s3_4: 'Step 3.4: Verify Country = Belgium (readonly)',
  s3_5: 'Step 3.5: Verify State = Brussels Capital (readonly)',
  s3_6: 'Step 3.6: Verify Sales Team = BDEU (readonly)',
  s3_7: 'Step 3.7: Verify Email = Email_Lead#1 (readonly)',
  s4: 'Step 4: Click at "CRM Developer" tab and verify the following',
  s4_1: 'Step 4.1: Verify Lead form textbox = License',
  s4_2: 'Step 4.2: Verify Active checkbox = TRUE',
  s4_3: 'Step 4.3: Verify Is Won = Pending',
  s4_4: 'Step 4.4: Verify Lost Reason = BLANK',
  s6: 'Step 6: Open the Lead 2 using URL_Lead#2',
  s7: 'Step 7: Verify Lead #2 fields (should remain unchanged)',
  s7_1: 'Step 7.1: Verify Tag field is "Trial download"',
  s7_2: 'Step 7.2: Verify Company Name = Company Name Lead 1 (auto set)',
  s7_3: 'Step 7.3: Verify Street = 123street (readonly)',
  s7_4: 'Step 7.4: Verify Country = United States (readonly)',
  s7_5: 'Step 7.5: Verify State = Texas (US) (readonly)',
  s7_6: 'Step 7.6: Verify Sales Team = Marketing - BDR (readonly)',
  s7_7: 'Step 7.7: Verify Email = Email_Lead#1 (readonly)',
  s8: 'Step 8: Click at "CRM Developer" tab and verify the following',
  s8_1: 'Step 8.1: Verify Lead form textbox = Trial Download QNAP',
  s8_2: 'Step 8.2: Verify Active checkbox = TRUE',
  s8_3: 'Step 8.3: Verify Is Won = Pending',
  s8_4: 'Step 8.4: Verify Lost Reason = BLANK',
  verify: 'Verification',
} as const;

let run: LeadMergingRun | undefined;

test.describe(`${TC} - NO MERGE: BDEU and Marketing - BDR Teams with New Email`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await teardownLeadMergingRun(page, testInfo, run, SKIP_CLEANUP_MIG);
  });

  test.afterAll(async ({ browser }) => {
    await sweepLeadMergingRunsAfterAll(browser, SKIP_CLEANUP_MIG);
  });

  test(`${TC}: Verify that leads do NOT merge when BDEU team and Marketing - BDR team have same new email`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.leadMergeMigTest);
    run = newLeadMergingRun(TC);
    const leadPage = new LeadPageMig(page);
    const vlog = new MergeVerifyLog();
    let homePage!: HomePageMig;
    const sharedEmail = companyEmail(run);
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
        name: lead1Name, email: sharedEmail, companyName: 'Company Name Lead 1', street: '123street', country: 'Belgium', state: 'Brussels Capital', salesTeam: 'BDEU', salesperson: null, createdManually: false, leadForm: 'License'
      }, 'Condition #1 - Lead #1');
    });

    await test.step(STEP.c2, async () => {
      console.log(`\n--- ${STEP.c2} ---`);
      lead2 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead2Name, email: sharedEmail, companyName: 'Company Name Lead 2', contactName: 'Contact Name Lead 2', street: '123street', country: 'United States', state: 'Texas', salesTeam: 'Marketing - BDR', salesperson: null, createdManually: false, leadForm: 'Trial Download QNAP'
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
      { label: STEP.s3_1, kind: 'tags', expected: ['Product Registration'] },
      { label: STEP.s3_2, kind: 'company', expected: 'Company Name Lead 1' },
      { label: STEP.s3_3, kind: 'address', expected: '123street' },
      { label: STEP.s3_4, kind: 'address', expected: 'Belgium' },
      { label: STEP.s3_5, kind: 'address', expected: 'Brussels Capital' },
      { label: STEP.s3_6, kind: 'salesTeam', expected: 'BDEU' },
      { label: STEP.s3_7, kind: 'email', expected: sharedEmail.split('@')[0] },
    ]);

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s4, [
      { label: STEP.s4_1, kind: 'leadFormContains', expected: 'License' },
      { label: STEP.s4_2, kind: 'activeTrue' },
      { label: STEP.s4_3, kind: 'isWon', expected: 'Pending' },
      { label: STEP.s4_4, kind: 'lostReason', expected: '' },
    ], () => leadPage.clickCRMDeveloperTab_targetLead());

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await openRecordByUrl(page, leadPage, lead2.url);
    });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s7, [
      { label: STEP.s7_1, kind: 'tags', expected: ['Trial download'] },
      { label: STEP.s7_2, kind: 'company', expected: 'Company Name Lead 1' },
      { label: STEP.s7_3, kind: 'address', expected: '123street' },
      { label: STEP.s7_4, kind: 'address', expected: 'United States' },
      { label: STEP.s7_5, kind: 'address', expected: 'Texas' },
      { label: STEP.s7_6, kind: 'salesTeam', expected: 'Marketing - BDR' },
      { label: STEP.s7_7, kind: 'email', expected: sharedEmail.split('@')[0] },
    ]);

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s8, [
      { label: STEP.s8_1, kind: 'leadFormContains', expected: 'Trial Download QNAP' },
      { label: STEP.s8_2, kind: 'activeTrue' },
      { label: STEP.s8_3, kind: 'isWon', expected: 'Pending' },
      { label: STEP.s8_4, kind: 'lostReason', expected: '' },
    ], () => leadPage.clickCRMDeveloperTab());

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      vlog.print('Lead #1 (BDEU) and Lead #2 (Marketing - BDR) were NOT merged - both Active with their own team and form');
    });
  });
});
