import { test } from '@playwright/test';
import { HomePageMig, LeadPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  baselineDetails, newLeadMergingRun, loginAndOpenLeadsOnMig, MergeVerifyLog, teardownLeadMergingRun, sweepLeadMergingRunsAfterAll, LeadMergingRun, CreatedRecord, createLeadOnMig, openRecordByUrl, verifyStep, watchNoMergeWindowOnMig, companyEmail, recordName,
} from '@helpers/lead-merging-mig.helper';

/**
 * ============================================================================================
 *  CRM-12370_9.4.1 - Lead Merging Rule 7: different Sales Teams must NOT merge (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_9.4.1
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-30
 *  Run as          : Odoo Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *  Baseline        : CRM-9059_7.1.4 (Jira CRM-11429) - assertions ported unchanged
 *                    tests/1.Project_CRM/3.Lead_Merging/CRM-9059_(Rule7)_Lead.Salesteam-or-Lead.Salesperson-is-not-empty-for-both-leads-not-be-merged/A.Sales-Team/tc-crm-9059-7-1-4-salesteam-different-NO-merge.spec.ts
 *  Source version  : CRM-11429 updated 2026-07-07T13:35+0300 - re-check before trusting this spec
 *  Bug (SKIPPED)   : CRM-14069 - skipped on the tester's request 2026-11-03; un-skip when CRM-14069 is fixed.
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Two merge-eligible leads (team-standard recipe) share one company e-mail; Lead #1 is on BDEU, Lead #2 on CMR.
 *  Rule 7: both teams set and different -> NOT merged; both stay Active with their own team.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_9\.4\.1:" --project=MigSmoke --workers=1
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
 *  - Run marker: every e-mail carries company-crm12370-9-4-1-<runId>, record names "... CRM-12370_9.4.1 <runId>".
 *  - Each verification point is a soft assertion (one 55-min run reports every difference); values unchanged.
 *  - Clean-up: afterEach deletes the records this run created and the partners carrying the run marker;
 *    afterAll sweeps the run marker (deny-list, counted first).
 *  - Data: Sales Teams and Salespersons exist on crm-mig with the pre-production names and memberships
 *    (read 2026-10-30: Thomas Semerich + Mark Jawad = BDEU, team CMR / BDEU) - nothing substituted.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (baseline header, verbatim)
 * --------------------------------------------------------------------------------------------
 *  Pre-condition:
 *  1. After login successful, click at "CRM" button
 *  2. On "CRM" page, select "Leads" item then "Leads" sub-item
 *
 *  I. Condition#1 to create Lead#1:
 *  1. On "Leads" page, click at "CREATE" button
 *  2. Enter the following information:
 *     - Lead name textbox = TEST Lead 1 + current TC ID
 *     - Email textbox = Company email (Test@company + timestamp .com) (Email_Lead#1)
 *     - Company Name textbox = Company Name Lead 1
 *     - Street dropdown list = 123street
 *     - Country dropdown list = Belgium
 *     - State dropdown list = Flanders
 *     - Sales Team dropdown list = BDEU
 *     - Salesperson dropdown list is cleared
 *     - Created manually checkbox = TRUE
 *     - Tags = "Can_Merge"
 *  3. Click "CRM Developer" tab: Lead form textbox = BLANK
 *  4. Press "SAVE"; copy URL_Lead#1
 *
 *  II. Condition#2 to create Lead#2:
 *  1. On "Leads" page, click at "CREATE" button
 *  2. Enter the following information:
 *     - Lead name textbox = TEST Lead 2 + current TC ID
 *     - Email textbox = Email_Lead#1 (same email)
 *     - Company Name textbox = Company Name Lead 2
 *     - Contact Name textbox = Contact Name Lead 2
 *     - Street dropdown list = 123street
 *     - Country dropdown list = United States
 *     - State dropdown list = Texas (US)
 *     - Sales Team dropdown list = CMR (DIFFERENT from Lead#1)
 *     - Salesperson dropdown list is cleared
 *     - Created manually checkbox = FALSE
 *  3. Click "CRM Developer" tab: Lead form textbox = License
 *  4. Press "SAVE"; copy URL_Lead#2
 *
 *  Steps to reproduce (EXPECTED behaviour when Rule 7 works - the leads must NOT merge):
 *  1. Wait for the async merge window for Lead Merging to happen
 *  2. Open the Lead 1 using URL_Lead#1
 *  3. Verify the following:
 *     3.1. Tag field contains "Can_Merge" (Lead#1 keeps its own tag)
 *     3.2. Company Name textbox = Company Name Lead 1
 *     3.3. Street dropdown list = 123street
 *     3.4. Country dropdown list = Belgium
 *     3.5. State dropdown list = Flanders
 *     3.6. Sales Team dropdown list = BDEU
 *     3.7. Email textbox = Email_Lead#1
 *  4. Click "CRM Developer" tab and verify:
 *     4.1. Lead form textbox = BLANK
 *     4.2. Active checkbox = TRUE
 *     4.3. Is Won = Pending
 *     4.4. Lost Reason = BLANK
 *  5. On the Log area: NO "[LEAD 2], has been merged into this lead." message (no merge happened)
 *  6. Open the Lead 2 using URL_Lead#2
 *  7. Verify the following:
 *     7.1. Tag field is empty (Lead#2 carried no tag)
 *     7.2. Company Name textbox = Company Name Lead 2 (Lead#2 keeps its own - no merge)
 *     7.3. Street dropdown list = 123street
 *     7.4. Country dropdown list = United States
 *     7.5. State dropdown list = Texas (US)
 *     7.6. Sales Team dropdown list = CMR
 *     7.7. Email textbox = Email_Lead#1
 *  8. Click "CRM Developer" tab and verify:
 *     8.1. Lead form textbox = License
 *     8.2. Active checkbox = TRUE (NOT archived - no merge)
 *     8.3. Is Won = Pending (NOT Lost)
 *     8.4. Lost Reason = BLANK (NOT Duplicate)
 *  9. On the Log area: NO "This lead has been merged into [LEAD 1]." message (no merge happened)
 *
 *  NOTE: This test is SKIPPED due to known defect CRM-9059 (Rule 7 merge-guard is broken: leads with
 *  different non-empty Sales Team currently still merge). Un-skip once CRM-9059 is fixed.
 * ============================================================================================
 */

const TC = 'CRM-12370_9.4.1';
const SKIP_CLEANUP_MIG = false;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition 1-2: After login successful, click at "CRM" button, then select "Leads" item then "Leads" sub-item (crm-mig: opened by URL hash - the sidebar theme hides the top menu)',
  c1: 'Condition #1 (steps 1-5): Create Lead #1 (Created Manually = TRUE, Tag = Can_Merge, Sales Team = BDEU)',
  c2: 'Condition #2 (steps 1-5): Create Lead #2 (Created Manually = FALSE, Sales Team = CMR)',
  s1: 'Step 1: Wait for the async merge window for Lead Merging happened (crm-mig: watch the whole 35-min window - a merge missed at creation is only made by the 20-min re-scan, once the lead is ~10 min old)',
  s2: 'Step 2: Open the Lead 1 using URL_Lead#1',
  s3: 'Step 3: Verify the following fields on Lead #1',
  s3_1: 'Step 3.1: Tag field contains "Can_Merge"',
  s3_2: 'Step 3.2: Company Name textbox = Company Name Lead 1',
  s3_3: 'Step 3.3: Street dropdown list = 123street',
  s3_4: 'Step 3.4: Country dropdown list = Belgium',
  s3_5: 'Step 3.5: State dropdown list = Flanders',
  s3_6: 'Step 3.6: Sales Team dropdown list = BDEU',
  s3_7: 'Step 3.7: Email textbox = Email_Lead#1',
  s4: 'Step 4: Click at "CRM Developer" tab and verify the following',
  s4_1: 'Step 4.1: Lead form textbox = BLANK',
  s4_2: 'Step 4.2: Active checkbox = TRUE',
  s4_3: 'Step 4.3: Is Won = Pending',
  s4_4: 'Step 4.4: Lost Reason = BLANK',
  s5: 'Step 5: On the Log area, verify NO merge message',
  s5_1: 'Step 5.1: Verify NO "has been merged into this lead" message',
  s6: 'Step 6: Open the Lead 2 using URL_Lead#2',
  s7: 'Step 7: Verify the following fields on Lead #2',
  s7_1: 'Step 7.1: Tag field is empty (Lead #2 carried no tag)',
  s7_2: 'Step 7.2: Company Name textbox = Company Name Lead 2',
  s7_3: 'Step 7.3: Street dropdown list = 123street',
  s7_4: 'Step 7.4: Country dropdown list = United States',
  s7_5: 'Step 7.5: State dropdown list = Texas (US)',
  s7_6: 'Step 7.6: Sales Team dropdown list = CMR',
  s7_7: 'Step 7.7: Email textbox = Email_Lead#1',
  s8: 'Step 8: Click at "CRM Developer" tab and verify the following',
  s8_1: 'Step 8.1: Lead form textbox = License',
  s8_2: 'Step 8.2: Active checkbox = TRUE (not archived - no merge)',
  s8_3: 'Step 8.3: Is Won = Pending (not Lost)',
  s8_4: 'Step 8.4: Lost Reason = BLANK (not Duplicate)',
  s9: 'Step 9: On the Log area, verify NO merge message',
  s9_1: 'Step 9.1: Verify NO "This lead has been merged into" message',
  verify: 'Verification',
} as const;

let run: LeadMergingRun | undefined;

test.describe(`${TC} - Lead Merging Rule 7: Sales Team different (NO merge)`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await teardownLeadMergingRun(page, testInfo, run, SKIP_CLEANUP_MIG);
  });

  test.afterAll(async ({ browser }) => {
    await sweepLeadMergingRunsAfterAll(browser, SKIP_CLEANUP_MIG);
  });

  // Skipped due to bug CRM-14069 - declaration-level skip, so no browser starts and no record is created;
  // un-skip when CRM-14069 is fixed.
  test.skip(`${TC}: [CRM-9059] Verify leads do NOT merge with same company email and DIFFERENT Sales Team [CRM-14069]`, baselineDetails(TC), async ({ page }, testInfo) => {
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
        name: lead1Name, email: sharedEmail, companyName: 'Company Name Lead 1', street: '123street', country: 'Belgium', state: 'Flanders', salesTeam: 'BDEU', salesperson: null, createdManually: true, tags: ['Can_Merge'], leadForm: ''
      }, 'Condition #1 - Lead #1');
    });

    await test.step(STEP.c2, async () => {
      console.log(`\n--- ${STEP.c2} ---`);
      lead2 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead2Name, email: sharedEmail, companyName: 'Company Name Lead 2', contactName: 'Contact Name Lead 2', street: '123street', country: 'United States', state: 'Texas', salesTeam: 'CMR', salesperson: null, createdManually: false, leadForm: 'License'
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
      { label: STEP.s3_1, kind: 'tags', expected: ['Can_Merge'] },
      { label: STEP.s3_2, kind: 'company', expected: 'Company Name Lead 1' },
      { label: STEP.s3_3, kind: 'address', expected: '123street' },
      { label: STEP.s3_4, kind: 'address', expected: 'Belgium' },
      { label: STEP.s3_5, kind: 'address', expected: 'Flanders' },
      { label: STEP.s3_6, kind: 'salesTeam', expected: 'BDEU' },
      { label: STEP.s3_7, kind: 'email', expected: sharedEmail },
    ]);

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s4, [
      { label: STEP.s4_1, kind: 'leadFormBe', expected: '' },
      { label: STEP.s4_2, kind: 'activeTrue' },
      { label: STEP.s4_3, kind: 'isWon', expected: 'Pending' },
      { label: STEP.s4_4, kind: 'lostReason', expected: '' },
    ], () => leadPage.clickCRMDeveloperTab());

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s5, [
      { label: STEP.s5_1, kind: 'noSourceMergeMsg', expected: lead2Name, meaning: 'FOUND means Rule 7 did not stop the merge' },
    ]);

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await openRecordByUrl(page, leadPage, lead2.url);
    });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s7, [
      { label: STEP.s7_1, kind: 'tagsObserve' },
      { label: STEP.s7_2, kind: 'company', expected: 'Company Name Lead 2' },
      { label: STEP.s7_3, kind: 'address', expected: '123street' },
      { label: STEP.s7_4, kind: 'address', expected: 'United States' },
      { label: STEP.s7_5, kind: 'address', expected: 'Texas' },
      { label: STEP.s7_6, kind: 'salesTeam', expected: 'CMR' },
      { label: STEP.s7_7, kind: 'email', expected: sharedEmail },
    ]);

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s8, [
      { label: STEP.s8_1, kind: 'leadFormBe', expected: 'License' },
      { label: STEP.s8_2, kind: 'activeTrue' },
      { label: STEP.s8_3, kind: 'isWon', expected: 'Pending' },
      { label: STEP.s8_4, kind: 'lostReason', expected: '' },
    ], () => leadPage.clickCRMDeveloperTab());

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s9, [
      { label: STEP.s9_1, kind: 'noTargetMergeMsg', expected: lead1Name, meaning: 'FOUND means Rule 7 did not stop the merge' },
    ]);

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      vlog.print('Rule 7: the two leads were NOT merged - both Active with their own Sales Team / Salesperson');
    });
  });
});
