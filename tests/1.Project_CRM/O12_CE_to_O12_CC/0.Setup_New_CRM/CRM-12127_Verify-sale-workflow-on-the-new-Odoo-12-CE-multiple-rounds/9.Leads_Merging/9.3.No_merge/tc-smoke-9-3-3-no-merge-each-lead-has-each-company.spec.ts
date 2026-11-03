import { test } from '@playwright/test';
import { HomePageMig, LeadPageMig, ContactPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { registerMigRecord } from '@helpers/o12ce-main-business.helper';
import {
  baselineDetails, newLeadMergingRun, loginAndOpenLeadsOnMig, MergeVerifyLog, teardownLeadMergingRun, sweepLeadMergingRunsAfterAll, LeadMergingRun, CreatedRecord, createLeadOnMig, openRecordByUrl, verifyStep, watchNoMergeWindowOnMig, companyEmail, recordName,
} from '@helpers/lead-merging-mig.helper';

/**
 * ============================================================================================
 *  CRM-12370_9.3.3 - Lead Merging: NO merge - different emails, each lead belongs to its own company (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_9.3.3
 *  Automation-Type : refactored
 *  Automation-Date : 2026-11-03
 *  Run as          : Odoo Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *  Baseline        : CRM-542_2.2.1 (Jira CRM-8903) - assertions ported unchanged
 *                    tests/1.Project_CRM/3.Lead_Merging/CRM-542_Lead_merging_rules_updated/2.Leads-are-NOT-qualified-to-be-merged/2.2.Multiple-leads-different-company/tc-crm-542-2-2-1-no-merge-each-lead-has-each-company.spec.ts
 *  Source version  : CRM-8903 updated 2026-03-20T05:34+0200 - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Two company contacts on two new domains, then one lead on each domain (IB NC Leads / Download Free Trial).
 *  Verifies the leads are NOT merged and each one is linked to its own company.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_9\.3\.3:" --project=MigSmoke --workers=1
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
 *  - Run marker: every e-mail carries company1-/company2-crm12370-9-3-3-<runId>, record names "... CRM-12370_9.3.3 <runId>".
 *  - Each verification point is a soft assertion (one 55-min run reports every difference); values unchanged.
 *    Steps 3/4/5/7/8/9 each attach one verify-evidence shot (verifyStep); Step 1's watch result is printed in the
 *    VERIFY block as an Observation (not scored) - the manual step states no expected result.
 *  - LM-b1 2026-11-02 stopped in Condition III: "More (10)" raised "record has been modified" twice and the CRM
 *    Developer tab never opened, so no verification step ran. Since 2026-11-03 MigNotebook shows the folded tab by a
 *    click on its Bootstrap tab anchor when More does not open twice.
 *  - Clean-up: afterEach deletes the records this run created and the partners carrying the run marker;
 *    afterAll sweeps the run marker (deny-list, counted first).
 *  - Company contacts are created with ContactPageMig.createCompanyContactMig() (field-by-name): the pre-production
 *    ContactPage flow hung on crm-mig (CRM-12144_2.1, 2026-10-21); Company Type = Company replaces the checkbox.
 *  - Steps 5 and 9 (Log area) added 2026-11-02 from the manual TC CRM-8903 / CRM-14081: the baseline spec has no
 *    test.step for them (it re-checks the log only in the round-2 deferred job), so the port had none either.
 *  - Kept as the baseline spec asserts, although the manual TC (CRM-8903 = CRM-14081) words them differently
 *    (tester's decision 2026-11-02, "same as baseline"):
 *      3.2 / 7.2  manual "Company Name Lead 1/2"   -> asserted: name of Contact #1 / #2 (the linked company)
 *      7.7        manual "Email_Lead#1"            -> asserted: Email_Lead#2 (the header block below shows Email_Lead#2)
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (baseline header, verbatim)
 * --------------------------------------------------------------------------------------------
 *  Pre-condition:
 *  1. After login successful as admin_crm
 *
 *  I. Condition#1 to create Contact#1:
 *  1. Click at "Contacts" button
 *  2. On "Contacts" page, click at "CREATE" button and wait
 *  3. While new "Contacts" page appears, enter the following information:
 *     - At "Company" checkbox above "Contact name" textbox, set "Company" checkbox = TRUE
 *     - "Contact name" textbox = TEST-Contact#1 + Test case ID + current date time millisecond
 *     - "Email" textbox = Company email (Test-company@company + current date + current time + millisecond.com)
 *       (Remember the created email called Email_Contact#1)
 *       (Remember the Email domain call Domain_Email_Contact#1 is where [@company + current date + current time + millisecond.com])
 *     - (in the Address section)
 *       - Street dropdown list = 123street
 *       - Country dropdown list = United States
 *       - State dropdown list = Texas (US)
 *     - "Sales Team" dropdown list is CMR
 *     - "Salesperson" dropdown list is cleared
 *  4. Press "SAVE" button and wait
 *  5. Press "Application" icon on the top-right of screen to return the Home page
 *
 *  II. Condition#2 to create Contact#2:
 *  1. Click at "Contacts" button
 *  2. On "Contacts" page, click at "CREATE" button and wait
 *  3. While new "Contacts" page appears, enter the following information:
 *     - At "Company" checkbox above "Contact name" textbox, set "Company" checkbox = TRUE
 *     - "Contact name" textbox = TEST-Contact#2 + Test case ID + current date time millisecond
 *     - "Email" textbox = Company email (Test-company@company + current date + current time + millisecond.com)
 *       (Remember the created email called Email_Contact#2)
 *       (Remember the Email domain call Domain_Email_Contact#2 is where [@company + current date + current time + millisecond.com])
 *     - (in the Address section)
 *       - Street dropdown list = 123street
 *       - Country dropdown list = United States
 *       - State dropdown list = Texas (US)
 *     - "Sales Team" dropdown list is CMR
 *     - "Salesperson" dropdown list is cleared
 *  4. Press "SAVE" button and wait
 *  5. Press "Application" icon on the top-right of screen to return the Home page
 *
 *  III. Condition#3 to create Lead#1:
 *  1. Click at "CRM" button
 *  2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 *  3. On "Leads" page, click at "CREATE" button
 *  4. Enter the following information:
 *     - Lead name textbox = TEST Lead 1 + current date time
 *     - Email textbox = naming: Lead#1 + Domain_Email_Contact#1 created above
 *       (Remember the created email, called Email_Lead#1)
 *     - (in the Address section)
 *       - Company Name textbox = Company Name Lead 1
 *       - Street dropdown list = 123street
 *       - Country dropdown list = United States
 *       - State dropdown list = Texas (US)
 *     - Sales Team dropdown list is CMR
 *     - Salesperson dropdown list is cleared
 *     - Created manually checkbox is FALSE
 *  5. Click at "CRM Developer" tab at the bottom of page
 *     - Lead form textbox = IB NC Leads
 *  6. Press "SAVE" button
 *  7. Copy URL of Lead#1, called URL_Lead#1
 *  8. Press "Application" icon on the top-right of screen to return the Home page
 *
 *  IV. Condition#4 to create Lead#2:
 *  1. Click at "CRM" button
 *  2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 *  3. On "Leads" page, click at "CREATE" button
 *  4. Enter the following information:
 *     - Lead name textbox = TEST Lead 2 + current date time
 *     - Email textbox = naming: Lead#2 + Domain_Email_Contact#2 created above
 *       (Remember the created email, called Email_Lead#2)
 *     - (in the Address section)
 *       - Company Name textbox = Company Name Lead 2
 *       - Contact Name textbox = Contact Name Lead 2
 *       - Street dropdown list = 123street
 *       - Country dropdown list = United States
 *       - State dropdown list = Texas (US)
 *     - Sales Team dropdown list is CMR
 *     - Salesperson dropdown list is cleared
 *     - Created manually checkbox is FALSE
 *  5. Click at "CRM Developer" tab at the bottom of page
 *     - Lead form textbox = Download Free Trial
 *  6. Press "SAVE" button
 *  7. Copy URL of Lead#2, called URL_Lead#2
 *
 *  Steps to reproduce:
 *  1. Wait for 1 minute to see if the Lead Merging happened or not
 *  2. Open the Lead 1 using URL_Lead#1
 *  3. Verify the following:
 *     3.1. Tag field contains 1 value: "Renewal"
 *     3.2. Company Name textbox = Company Name Lead 1
 *     3.3. Street dropdown list = 123street
 *     3.4. Country dropdown list = United States
 *     3.5. State dropdown list = Texas (US)
 *     3.6. Sales Team dropdown list is CMR
 *     3.7. Email textbox = Email_Lead#1 that created previously
 *  4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *     4.1. Lead form textbox = IB NC Leads
 *     4.2. Active checkbox = TRUE
 *     4.3. Is Won = Pending
 *     4.4. Lost Reason = BLANK
 *  5. On the Log area, verify the following:
 *     5.1. There is NO the text as "[LEAD 2], has been merged into this lead." where [LEAD 2] is Lead Name of Lead#2
 *
 *  6. Open the Lead 2 using URL_Lead#2
 *  7. Verify the following:
 *     7.1. Tag field contains 1 value: "Trial download"
 *     7.2. Company Name textbox = Company Name Lead 2
 *     7.3. Street dropdown list = 123street
 *     7.4. Country dropdown list = United States
 *     7.5. State dropdown list = Texas (US)
 *     7.6. Sales Team dropdown list is CMR
 *     7.7. Email textbox = Email_Lead#2 that created previously
 *     7.8. Contact Name textbox = Contact Name Lead 2
 *  8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *     8.1. Lead form textbox = Download Free Trial
 *     8.2. Active checkbox = TRUE
 *     8.3. Is Won = Pending
 *     8.4. Lost Reason = BLANK
 *  9. On the Log area, verify the following:
 *     9.1. There is NOT the text as "This lead has been merged into [LEAD 1]." where [LEAD 1] is Lead Name of Lead#1
 * ============================================================================================
 */

const TC = 'CRM-12370_9.3.3';
const SKIP_CLEANUP_MIG = false;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  cI_1: 'Condition I - Step 1: Login and navigate to Contacts',
  cI_2: 'Condition I - Step 2: Click CREATE button',
  cI_34: 'Condition I - Steps 3-4: Create Company contact #1',
  cI_5: 'Condition I - Step 5: Press Application icon to return Home',
  cII_1: 'Condition II - Step 1: Navigate to Contacts',
  cII_2: 'Condition II - Step 2: Click CREATE button',
  cII_34: 'Condition II - Steps 3-4: Create Company contact #2',
  cII_5: 'Condition II - Step 5: Press Application icon to return Home',
  cIII_12: 'Condition III - Steps 1-2: Navigate to CRM > Leads',
  cIII: 'Condition III - Steps 3-8: Create Lead #1 with IB NC Leads form',
  cIII_8: 'Condition III - Step 8: Press Application icon to return Home',
  cIV_12: 'Condition IV - Steps 1-2: Navigate to CRM > Leads',
  cIV: 'Condition IV - Steps 3-7: Create Lead #2 with Download Free Trial form',
  s1: 'Step 1: Wait to confirm NO merge happens (crm-mig: watch the whole 35-min window - a merge missed at creation is only made by the 20-min re-scan, once the lead is ~10 min old)',
  s2: 'Step 2: Open the Lead 1 using URL_Lead#1',
  s3: 'Step 3: Verify Lead #1 fields (should remain unchanged)',
  s3_1: 'Step 3.1: Verify Tag field is "Renewal"',
  s3_2: 'Step 3.2: Verify Company Name = Name_Contact#1 (readonly)',
  s3_3: 'Step 3.3: Verify Street = 123street (readonly)',
  s3_4: 'Step 3.4: Verify Country = United States (readonly)',
  s3_5: 'Step 3.5: Verify State = Texas (US) (readonly)',
  s3_6: 'Step 3.6: Verify Sales Team = CMR (readonly)',
  s3_7: 'Step 3.7: Verify Email = Email_Lead#1 (readonly)',
  s4: 'Step 4: Click at "CRM Developer" tab and verify the following',
  s4_1: 'Step 4.1: Verify Lead form textbox = IB NC Leads',
  s4_2: 'Step 4.2: Verify Active checkbox = TRUE',
  s4_3: 'Step 4.3: Verify Is Won = Pending',
  s4_4: 'Step 4.4: Verify Lost Reason = BLANK',
  s5: 'Step 5: On the Log area, verify NO merge message',
  s5_1: 'Step 5.1: Verify NO "[LEAD 2], has been merged into this lead." message',
  s6: 'Step 6: Open the Lead 2 using URL_Lead#2',
  s7: 'Step 7: Verify Lead #2 fields (should remain unchanged)',
  s7_1: 'Step 7.1: Verify Tag field is "Trial download"',
  s7_2: 'Step 7.2: Verify Company Name = Name_Contact#2 (readonly)',
  s7_3: 'Step 7.3: Verify Street = 123street (readonly)',
  s7_4: 'Step 7.4: Verify Country = United States (readonly)',
  s7_5: 'Step 7.5: Verify State = Texas (US) (readonly)',
  s7_6: 'Step 7.6: Verify Sales Team = CMR (readonly)',
  s7_7: 'Step 7.7: Verify Email = Email_Lead#2 (readonly)',
  s7_8: 'Step 7.8: Verify Contact Name = Contact Name Lead 2 (readonly)',
  s8: 'Step 8: Click at "CRM Developer" tab and verify the following',
  s8_1: 'Step 8.1: Verify Lead form textbox = Download Free Trial',
  s8_2: 'Step 8.2: Verify Active checkbox = TRUE',
  s8_3: 'Step 8.3: Verify Is Won = Pending',
  s8_4: 'Step 8.4: Verify Lost Reason = BLANK',
  s9: 'Step 9: On the Log area, verify NO merge message',
  s9_1: 'Step 9.1: Verify NO "This lead has been merged into [LEAD 1]." message',
  verify: 'Verification',
} as const;

let run: LeadMergingRun | undefined;

test.describe(`${TC} - NO MERGE: Different Emails and Different Companies`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await teardownLeadMergingRun(page, testInfo, run, SKIP_CLEANUP_MIG);
  });

  test.afterAll(async ({ browser }) => {
    await sweepLeadMergingRunsAfterAll(browser, SKIP_CLEANUP_MIG);
  });

  test(`${TC}: [CRM-8930] Verify that leads do NOT merge when leads have different emails and different companies`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.leadMergeMigTest);
    run = newLeadMergingRun(TC);
    const leadPage = new LeadPageMig(page);
    const vlog = new MergeVerifyLog();
    let homePage!: HomePageMig;
    const contactPage = new ContactPageMig(page);
    const contact1Name = `TEST-Contact#1_${TC}_${run.runId}`;
    const contact1Email = companyEmail(run, 'Test-company', 'company1');
    const contact2Name = `TEST-Contact#2_${TC}_${run.runId}`;
    const contact2Email = companyEmail(run, 'Test-company', 'company2');
    const lead1Email = `Lead#1@${contact1Email.split('@')[1]}`;
    const lead2Email = `Lead#2@${contact2Email.split('@')[1]}`;
    const lead1Name = recordName(run, 'TEST Lead 1');
    const lead2Name = recordName(run, 'TEST Lead 2');
    let lead1!: CreatedRecord;
    let lead2!: CreatedRecord;

    await test.step(STEP.cI_1, async () => {
      console.log(`\n--- ${STEP.cI_1} ---`);
      homePage = await loginAndOpenLeadsOnMig(page);
      await homePage.navigateToContacts();
    });

    await test.step(STEP.cI_2, async () => {
      console.log(`\n--- ${STEP.cI_2} ---`);
      await contactPage.clickCreateMig();
    });

    await test.step(STEP.cI_34, async () => {
      console.log(`\n--- ${STEP.cI_34} ---`);
      const data = {
        name: contact1Name,
        email: contact1Email,
        street: '123street',
        country: 'United States',
        state: 'Texas',
        salesTeam: 'CMR',
      };
      console.log('  - Company checkbox    : TRUE');
      console.log(`  - Contact Name        : ${data.name}`);
      console.log(`  - Email               : ${data.email}`);
      console.log(`  - Street              : ${data.street}`);
      console.log(`  - Country             : ${data.country}`);
      console.log(`  - State               : ${data.state}`);
      console.log(`  - Sales Team          : ${data.salesTeam}`);
      console.log('  - Salesperson         : cleared');
      const id = await contactPage.createCompanyContactMig(data);
      registerMigRecord('res.partner', id, 'Contact #1', { deleteLast: true });
      console.log(`  -> Contact #1 saved: id ${id}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition I - Contact #1 created (ID: ${id})`);
    });

    await test.step(STEP.cI_5, async () => {
      console.log(`\n--- ${STEP.cI_5} ---`);
      await homePage.returnToHome();
    });

    await test.step(STEP.cII_1, async () => {
      console.log(`\n--- ${STEP.cII_1} ---`);
      await homePage.navigateToContacts();
    });

    await test.step(STEP.cII_2, async () => {
      console.log(`\n--- ${STEP.cII_2} ---`);
      await contactPage.clickCreateMig();
    });

    await test.step(STEP.cII_34, async () => {
      console.log(`\n--- ${STEP.cII_34} ---`);
      const data = {
        name: contact2Name,
        email: contact2Email,
        street: '123street',
        country: 'United States',
        state: 'Texas',
        salesTeam: 'CMR',
      };
      console.log('  - Company checkbox    : TRUE');
      console.log(`  - Contact Name        : ${data.name}`);
      console.log(`  - Email               : ${data.email}`);
      console.log(`  - Street              : ${data.street}`);
      console.log(`  - Country             : ${data.country}`);
      console.log(`  - State               : ${data.state}`);
      console.log(`  - Sales Team          : ${data.salesTeam}`);
      console.log('  - Salesperson         : cleared');
      const id = await contactPage.createCompanyContactMig(data);
      registerMigRecord('res.partner', id, 'Contact #2', { deleteLast: true });
      console.log(`  -> Contact #2 saved: id ${id}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition II - Contact #2 created (ID: ${id})`);
    });

    await test.step(STEP.cII_5, async () => {
      console.log(`\n--- ${STEP.cII_5} ---`);
      await homePage.returnToHome();
    });

    await test.step(STEP.cIII_12, async () => {
      console.log(`\n--- ${STEP.cIII_12} ---`);
      await homePage.navigateToLeads();
    });

    await test.step(STEP.cIII, async () => {
      console.log(`\n--- ${STEP.cIII} ---`);
      lead1 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead1Name, email: lead1Email, companyName: 'Company Name Lead 1', street: '123street', country: 'United States', state: 'Texas', salesTeam: 'CMR', salesperson: null, createdManually: false, leadForm: 'IB NC Leads'
      }, 'Condition III - Lead #1');
    });

    await test.step(STEP.cIII_8, async () => {
      console.log(`\n--- ${STEP.cIII_8} ---`);
      await homePage.returnToHome();
    });

    await test.step(STEP.cIV_12, async () => {
      console.log(`\n--- ${STEP.cIV_12} ---`);
      await homePage.navigateToLeads();
    });

    await test.step(STEP.cIV, async () => {
      console.log(`\n--- ${STEP.cIV} ---`);
      lead2 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead2Name, email: lead2Email, companyName: 'Company Name Lead 2', contactName: 'Contact Name Lead 2', street: '123street', country: 'United States', state: 'Texas', salesTeam: 'CMR', salesperson: null, createdManually: false, leadForm: 'Download Free Trial'
      }, 'Condition IV - Lead #2');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const mergedOn = await watchNoMergeWindowOnMig(page, leadPage, [{ url: lead1.url, name: lead1Name }, { url: lead2.url, name: lead2Name }]);
      // the manual step states no expected result - shown, not scored; steps 4/5/8/9 assert the no-merge
      vlog.add({ what: STEP.s1, expected: '', actual: mergedOn ? `merge note seen on ${mergedOn}` : 'no merge note during the window', result: 'OBSERVED' });
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await openRecordByUrl(page, leadPage, lead1.url);
    });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s3, [
      { label: STEP.s3_1, kind: 'tags', expected: ['Renewal'] },
      { label: STEP.s3_2, kind: 'company', expected: contact1Name, meaning: 'the lead linked to Contact #1\'s company' },
      { label: STEP.s3_3, kind: 'address', expected: '123street' },
      { label: STEP.s3_4, kind: 'address', expected: 'United States' },
      { label: STEP.s3_5, kind: 'address', expected: 'Texas' },
      { label: STEP.s3_6, kind: 'salesTeam', expected: 'CMR' },
      { label: STEP.s3_7, kind: 'email', expected: lead1Email.split('@')[0] },
    ]);

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s4, [
      { label: STEP.s4_1, kind: 'leadFormContains', expected: 'IB NC Leads' },
      { label: STEP.s4_2, kind: 'activeTrue' },
      { label: STEP.s4_3, kind: 'isWon', expected: 'Pending' },
      { label: STEP.s4_4, kind: 'lostReason', expected: '' },
    ], () => leadPage.clickCRMDeveloperTab_targetLead());

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s5, [
      { label: STEP.s5_1, kind: 'noSourceMergeMsg', expected: lead2Name, meaning: 'FOUND means Lead #2 was merged into Lead #1' },
    ]);

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await openRecordByUrl(page, leadPage, lead2.url);
    });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s7, [
      { label: STEP.s7_1, kind: 'tags', expected: ['Trial download'] },
      { label: STEP.s7_2, kind: 'company', expected: contact2Name, meaning: 'the lead linked to Contact #2\'s company' },
      { label: STEP.s7_3, kind: 'address', expected: '123street' },
      { label: STEP.s7_4, kind: 'address', expected: 'United States' },
      { label: STEP.s7_5, kind: 'address', expected: 'Texas' },
      { label: STEP.s7_6, kind: 'salesTeam', expected: 'CMR' },
      { label: STEP.s7_7, kind: 'email', expected: lead2Email.split('@')[0] },
      { label: STEP.s7_8, kind: 'contact', expected: 'Contact Name Lead 2' },
    ]);

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s8, [
      { label: STEP.s8_1, kind: 'leadFormContains', expected: 'Download Free Trial' },
      { label: STEP.s8_2, kind: 'activeTrue' },
      { label: STEP.s8_3, kind: 'isWon', expected: 'Pending' },
      { label: STEP.s8_4, kind: 'lostReason', expected: '' },
    ], () => leadPage.clickCRMDeveloperTab());

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s9, [
      { label: STEP.s9_1, kind: 'noTargetMergeMsg', expected: lead1Name, meaning: 'FOUND means Lead #2 was merged into Lead #1' },
    ]);

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      vlog.print('Lead #1 and Lead #2 were NOT merged - each stays Active and linked to its own company');
    });
  });
});
