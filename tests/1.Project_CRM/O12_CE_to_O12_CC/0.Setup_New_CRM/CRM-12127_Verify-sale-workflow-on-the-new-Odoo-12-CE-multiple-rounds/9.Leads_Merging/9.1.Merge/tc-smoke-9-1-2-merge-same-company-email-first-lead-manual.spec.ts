import { test } from '@playwright/test';
import { HomePageMig, LeadPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  baselineDetails, newLeadMergingRun, loginAndOpenLeadsOnMig, MergeVerifyLog, teardownLeadMergingRun, sweepLeadMergingRunsAfterAll, LeadMergingRun, CreatedRecord, createLeadOnMig, openRecordByUrl, pollForMergeOnMig, verifyStep, companyEmail, recordName,
} from '@helpers/lead-merging-mig.helper';

/**
 * ============================================================================================
 *  CRM-12370_9.1.2 - Lead Merging: same company email with same priority (Deal Registration) (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_9.1.2
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-30
 *  Run as          : Odoo Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *  Baseline        : CRM-2178_1.1.2.1 (Jira CRM-9153) - assertions ported unchanged
 *                    tests/1.Project_CRM/3.Lead_Merging/CRM-2178_Lead_merging_rules_update_Sept-23/1.Leads_are_qualified_to_be_merged/1.1.Multiple-leads-with-the-same-company-email/1.1.2.Leads-with-same-priority-if/tc-crm-2178-1-1-2-1-merge-leads-same-company-email-first-lead-is-manual.spec.ts
 *  Source version  : CRM-9153 updated 2026-03-20T05:34+0200 - re-check before trusting this spec
 *  Bug (SKIPPED)   : CRM-14070 - skipped on the tester's request 2026-11-03; un-skip when CRM-14070 is fixed.
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Two leads share one company e-mail and the same priority: Lead #1 manual with Can_Merge and a blank Lead form,
 *  Lead #2 not manual (License) with a registered deal. Verifies Lead #2 is merged into Lead #1 and the Deal
 *  registration lands on Lead #1.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_9\.1\.2:" --project=MigSmoke --workers=1
 *  npx playwright test --grep "CRM-14070" --project=MigSmoke --workers=1
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
 *  - Run marker: every e-mail carries company-crm12370-9-1-2-<runId>, record names "... CRM-12370_9.1.2 <runId>".
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
 *     - Email textbox = Email_Lead#1 that created in Condition#1
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
 *  5. Press "EDIT" button and wait
 *  6. Click at "Deal registration" tab then do the following:
 *     - "Registered deal" checkbox = TRUE
 *     - "Deal registration start date" = Current Date
 *     - "Deal registration end date" = Current Date
 *  7. Press "SAVE" button again
 *  8. Copy URL of Lead#2, called URL_Lead#2
 *
 *  Steps to reproduce:
 *  1. Wait for 1 minute for Lead Merging happened
 *  2. Open the Lead 1 using URL_Lead#1
 *  3. Verify the following:
 *     3.1. Tag field contains 2 values: "Can_Merge", "Product Registration"
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
 *  5. On the Log area, verify the following:
 *     5.1. There is the text as "[LEAD 2], has been merged into this lead." where [LEAD 2] is Lead Name of Lead#2
 *     5.2. Click at "Deal registration" tab and verify the following:
 *          - "Registered deal" checkbox = TRUE
 *          - "Deal registration start date" = Current Date
 *          - "Deal registration end date" = Current Date
 *  6. Open the Lead 2 using URL_Lead#2
 *  7. Verify the following:
 *     7.1. Tag field contains "Product Registration"
 *     7.2. Company Name textbox = Company Name Lead 1 <-- which auto set due to created Contact
 *     7.3. Street dropdown list = 123street
 *     7.4. Country dropdown list = United States
 *     7.5. State dropdown list = Texas (US)
 *     7.6. Sales Team dropdown list has a value or not
 *     7.7. Email textbox = Email_Lead#1 that created previously
 *  8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *     8.1. Lead form textbox = License
 *     8.2. Active checkbox = FALSE
 *     8.3. Is Won = Lost
 *     8.4. Lost Reason = Duplicate
 *  9. On the Log area, verify the following:
 *     9.1. There is the text as "This lead has been merged into [LEAD 1]." where [LEAD 1] is Lead Name of Lead#1
 * ============================================================================================
 */

const TC = 'CRM-12370_9.1.2';
const SKIP_CLEANUP_MIG = false;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition 1-2: After login successful, click at "CRM" button, then select "Leads" item then "Leads" sub-item (crm-mig: opened by URL hash - the sidebar theme hides the top menu)',
  c1: 'Condition #1 (steps 1-5): Create Lead #1 (Created Manually = TRUE, Tag = Can_Merge, Lead Form = BLANK)',
  c2: 'Condition #2 (steps 1-8): Create Lead #2 (Created Manually = FALSE, Lead Form = License, Deal Registration)',
  s1: 'Step 1: Wait for 1 minute for Lead Merging happened (crm-mig: poll up to 35 min - a merge missed at creation is only made by the 20-min re-scan, once the lead is ~10 min old)',
  s2: 'Step 2: Open the Lead 1 using URL_Lead#1',
  s3: 'Step 3: Verify the following fields on Lead #1',
  s3_1: 'Step 3.1: Tag field contains 2 values: "Can_Merge", "Product Registration"',
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
  s5_2: 'Step 5.2: Click at "Deal registration" tab and verify',
  s5_2a: 'Step 5.2: "Registered deal" checkbox = TRUE',
  s5_2b: 'Step 5.2: "Deal registration start date" = Current Date',
  s5_2c: 'Step 5.2: "Deal registration end date" = Current Date',
  s6: 'Step 6: Open the Lead 2 using URL_Lead#2',
  s7: 'Step 7: Verify the following fields on Lead #2',
  s7_1: 'Step 7.1: Tag field contains "Product Registration"',
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

test.describe(`${TC} - Lead Merging: Same Company Email with Same Priority`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await teardownLeadMergingRun(page, testInfo, run, SKIP_CLEANUP_MIG);
  });

  test.afterAll(async ({ browser }) => {
    await sweepLeadMergingRunsAfterAll(browser, SKIP_CLEANUP_MIG);
  });

  // Skipped due to bug CRM-14070 - declaration-level skip, so no browser starts and no record is created;
  // un-skip when CRM-14070 is fixed.
  test.skip(`${TC}: Verify merging leads with same company email and same priority [CRM-14070]`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.leadMergeMigTest);
    run = newLeadMergingRun(TC);
    const leadPage = new LeadPageMig(page);
    const vlog = new MergeVerifyLog();
    let homePage!: HomePageMig;
    const sharedEmail = companyEmail(run);
    const today = CommonUtils.formatDate();
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
        name: lead1Name, email: sharedEmail, companyName: 'Company Name Lead 1', street: '123street', country: 'Belgium', state: 'Flanders', salesTeam: null, salesperson: null, createdManually: true, tags: ['Can_Merge'], leadForm: ''
      }, 'Condition #1 - Lead #1');
    });

    await test.step(STEP.c2, async () => {
      console.log(`\n--- ${STEP.c2} ---`);
      lead2 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead2Name, email: sharedEmail, companyName: 'Company Name Lead 2', contactName: 'Contact Name Lead 2', street: '123street', country: 'United States', state: 'Texas', salesTeam: null, salesperson: null, createdManually: false, leadForm: 'License', dealRegistration: { start: today, end: today }
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
      { label: STEP.s3_1, kind: 'tags', expected: ['Can_Merge', 'Product Registration'] },
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

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s5_2, [
      { label: STEP.s5_2a, kind: 'registeredDeal', meaning: 'FALSE means the Deal registration was not cloned from Lead #2' },
      { label: STEP.s5_2b, kind: 'dealStart', expected: today },
      { label: STEP.s5_2c, kind: 'dealEnd', expected: today },
    ], () => leadPage.clickDealRegistrationTab());

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await openRecordByUrl(page, leadPage, lead2.url);
    });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s7, [
      { label: STEP.s7_1, kind: 'tags', expected: ['Product Registration'] },
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
      vlog.print('Lead #2 merged into Lead #1 and its Deal registration cloned - as in the baseline');
    });
  });
});
