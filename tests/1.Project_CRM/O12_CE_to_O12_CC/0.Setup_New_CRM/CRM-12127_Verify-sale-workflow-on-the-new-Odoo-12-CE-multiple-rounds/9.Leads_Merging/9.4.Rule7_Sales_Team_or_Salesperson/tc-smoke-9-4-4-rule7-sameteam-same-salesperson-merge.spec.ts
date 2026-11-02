import { test } from '@playwright/test';
import { HomePageMig, LeadPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  baselineDetails, newLeadMergingRun, loginAndOpenLeadsOnMig, MergeVerifyLog, teardownLeadMergingRun, sweepLeadMergingRunsAfterAll, LeadMergingRun, CreatedRecord, createLeadOnMig, openRecordByUrl, pollForMergeOnMig, verifyStep, companyEmail, recordName,
} from '@helpers/lead-merging-mig.helper';

/**
 * ============================================================================================
 *  CRM-12370_9.4.4 - Lead Merging Rule 7: same Sales Team and same Salesperson MERGE (control) (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_9.4.4
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-30
 *  Run as          : Odoo Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *  Baseline        : CRM-9059_7.3.4 (Jira CRM-11437) - assertions ported unchanged
 *                    tests/1.Project_CRM/3.Lead_Merging/CRM-9059_(Rule7)_Lead.Salesteam-or-Lead.Salesperson-is-not-empty-for-both-leads-not-be-merged/C.Combined/tc-crm-9059-7-3-4-sameteam-same-salesperson-MERGE.spec.ts
 *  Source version  : CRM-11437 updated 2026-07-07T13:36+0300 - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Control case of Rule 7: two merge-eligible leads share one company e-mail, Sales Team BDEU and Salesperson
 *  Thomas Semerich on both. Verifies Lead #2 is merged into Lead #1.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_9\.4\.4:" --project=MigSmoke --workers=1
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
 *  - Run marker: every e-mail carries company-crm12370-9-4-4-<runId>, record names "... CRM-12370_9.4.4 <runId>".
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
 *     - Salesperson dropdown list = Thomas Semerich
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
 *     - Sales Team dropdown list = BDEU
 *     - Salesperson dropdown list = Thomas Semerich
 *     - Created manually checkbox = FALSE
 *  3. Click "CRM Developer" tab: Lead form textbox = License
 *  4. Press "SAVE"; copy URL_Lead#2
 *
 *  Steps to reproduce:
 *  1. Wait for the async merge window for Lead Merging to happen
 *  2. Open the Lead 1 using URL_Lead#1
 *  3. Verify the following:
 *     3.1. Tag field contains "Can_Merge"
 *     3.2. Company Name textbox = Company Name Lead 1
 *     3.3. Street dropdown list = 123street
 *     3.4. Country dropdown list = Belgium
 *     3.5. State dropdown list = Flanders
 *     3.6. Sales Team dropdown list has a value or not
 *     3.7. Email textbox = Email_Lead#1
 *  4. Click "CRM Developer" tab and verify:
 *     4.1. Lead form textbox = BLANK
 *     4.2. Active checkbox = TRUE
 *     4.3. Is Won = Pending
 *     4.4. Lost Reason = BLANK
 *  5. On the Log area: "[LEAD 2], has been merged into this lead."
 *  6. Open the Lead 2 using URL_Lead#2
 *  7. Verify the following:
 *     7.1. Tag field is empty (Lead#2 carried no tag)
 *     7.2. Company Name textbox = Company Name Lead 1 (auto set due to created Contact)
 *     7.3. Street dropdown list = 123street
 *     7.4. Country dropdown list = United States
 *     7.5. State dropdown list = Texas (US)
 *     7.6. Sales Team dropdown list has a value or not
 *     7.7. Email textbox = Email_Lead#1
 *  8. Click "CRM Developer" tab and verify:
 *     8.1. Lead form textbox = License
 *     8.2. Active checkbox = FALSE
 *     8.3. Is Won = Lost
 *     8.4. Lost Reason = Duplicate
 *  9. On the Log area: "This lead has been merged into [LEAD 1]."
 * ============================================================================================
 */

const TC = 'CRM-12370_9.4.4';
const SKIP_CLEANUP_MIG = false;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition 1-2: After login successful, click at "CRM" button, then select "Leads" item then "Leads" sub-item (crm-mig: opened by URL hash - the sidebar theme hides the top menu)',
  c1: 'Condition #1 (steps 1-5): Create Lead #1 (Created Manually = TRUE, Tag = Can_Merge)',
  c2: 'Condition #2 (steps 1-5): Create Lead #2 (Created Manually = FALSE)',
  s1: 'Step 1: Wait for the async merge window for Lead Merging happened (crm-mig: poll up to 35 min - a merge missed at creation is only made by the 20-min re-scan, once the lead is ~10 min old)',
  s2: 'Step 2: Open the Lead 1 using URL_Lead#1',
  s3: 'Step 3: Verify the following fields on Lead #1',
  s3_1: 'Step 3.1: Tag field contains "Can_Merge"',
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
  s5: 'Step 5: On the Log area, verify the following',
  s5_1: 'Step 5.1: Verify merge message in Log area',
  s6: 'Step 6: Open the Lead 2 using URL_Lead#2',
  s7: 'Step 7: Verify the following fields on Lead #2',
  s7_1: 'Step 7.1: Tag field is empty (Lead #2 carried no tag)',
  s7_2: 'Step 7.2: Company Name textbox = Company Name Lead 1',
  s7_3: 'Step 7.3: Street dropdown list = 123street',
  s7_4: 'Step 7.4: Country dropdown list = United States',
  s7_5: 'Step 7.5: State dropdown list = Texas (US)',
  s7_6: 'Step 7.6: Sales Team dropdown list has a value or not',
  s7_7: 'Step 7.7: Email textbox = Email_Lead#1',
  s8: 'Step 8: Click at "CRM Developer" tab and verify the following',
  s8_1: 'Step 8.1: Lead form textbox = License',
  s8_2: 'Step 8.2: Active checkbox = FALSE',
  s8_3: 'Step 8.3: Is Won = Lost',
  s8_4: 'Step 8.4: Lost Reason = Duplicate',
  s9: 'Step 9: On the Log area, verify the following',
  s9_1: 'Step 9.1: Verify merge message in Log area',
  verify: 'Verification',
} as const;

let run: LeadMergingRun | undefined;

test.describe(`${TC} - Lead Merging Rule 7: same Sales Team + same Salesperson on both (MERGE)`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await teardownLeadMergingRun(page, testInfo, run, SKIP_CLEANUP_MIG);
  });

  test.afterAll(async ({ browser }) => {
    await sweepLeadMergingRunsAfterAll(browser, SKIP_CLEANUP_MIG);
  });

  test(`${TC}: Verify leads MERGE with same company email, same Sales Team and same Salesperson on both`, baselineDetails(TC), async ({ page }, testInfo) => {
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
        name: lead1Name, email: sharedEmail, companyName: 'Company Name Lead 1', street: '123street', country: 'Belgium', state: 'Flanders', salesTeam: 'BDEU', salesperson: 'Thomas Semerich', createdManually: true, tags: ['Can_Merge'], leadForm: ''
      }, 'Condition #1 - Lead #1');
    });

    await test.step(STEP.c2, async () => {
      console.log(`\n--- ${STEP.c2} ---`);
      lead2 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead2Name, email: sharedEmail, companyName: 'Company Name Lead 2', contactName: 'Contact Name Lead 2', street: '123street', country: 'United States', state: 'Texas', salesTeam: 'BDEU', salesperson: 'Thomas Semerich', createdManually: false, leadForm: 'License'
      }, 'Condition #2 - Lead #2');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const merged = await pollForMergeOnMig(page, leadPage, { url: lead2.url, name: lead2Name }, lead1Name);
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
      { label: STEP.s3_6, kind: 'salesTeamObserve' },
      { label: STEP.s3_7, kind: 'email', expected: sharedEmail },
    ]);

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s4, [
      { label: STEP.s4_1, kind: 'leadFormBe', expected: '' },
      { label: STEP.s4_2, kind: 'activeTrue' },
      { label: STEP.s4_3, kind: 'isWon', expected: 'Pending' },
      { label: STEP.s4_4, kind: 'lostReason', expected: '' },
    ], () => leadPage.clickCRMDeveloperTab());

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s5, [
      { label: STEP.s5_1, kind: 'sourceMergeMsg', expected: lead2Name, meaning: 'NOT FOUND means Lead #2 was not merged into Lead #1' },
    ]);

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await openRecordByUrl(page, leadPage, lead2.url);
    });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s7, [
      { label: STEP.s7_1, kind: 'tagsObserve' },
      { label: STEP.s7_2, kind: 'company', expected: 'Company Name Lead 1', meaning: 'auto set due to created Contact' },
      { label: STEP.s7_3, kind: 'address', expected: '123street' },
      { label: STEP.s7_4, kind: 'address', expected: 'United States' },
      { label: STEP.s7_5, kind: 'address', expected: 'Texas' },
      { label: STEP.s7_6, kind: 'salesTeamObserve' },
      { label: STEP.s7_7, kind: 'email', expected: sharedEmail },
    ]);

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s8, [
      { label: STEP.s8_1, kind: 'leadFormBe', expected: 'License' },
      { label: STEP.s8_2, kind: 'activeFalse', meaning: 'TRUE would mean the record was not archived by a merge' },
      { label: STEP.s8_3, kind: 'isWon', expected: 'Lost' },
      { label: STEP.s8_4, kind: 'lostReason', expected: 'Duplicate' },
    ], () => leadPage.clickCRMDeveloperTab());

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s9, [
      { label: STEP.s9_1, kind: 'targetMergeMsg', expected: lead1Name },
    ]);

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      vlog.print('same Sales Team + same Salesperson: Lead #2 merged into Lead #1 - as in the baseline');
    });
  });
});
