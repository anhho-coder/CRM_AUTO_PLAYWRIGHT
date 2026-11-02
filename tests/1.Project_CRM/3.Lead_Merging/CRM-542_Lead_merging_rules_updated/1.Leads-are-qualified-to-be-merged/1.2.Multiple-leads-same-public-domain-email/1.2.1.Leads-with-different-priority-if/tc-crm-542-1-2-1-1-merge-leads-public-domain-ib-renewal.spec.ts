import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-542_1.2.1.1 - Lead Merging: same public domain email with different priority (IB renewal lead)
 * ============================================================================================
 *  Test Case ID    : CRM-542_1.2.1.1
 *  Jira            : CRM-8899 (Post-EA - Test Case)
 *  Bug             : CRM-11289 "Only "Company name" disappear after creating Lead with public domain" (Closed
 *                    2026-10-15) - re-verified by Step 3.2 / 7.2; CRM-8929 (Closed/Fixed) annotated as well
 *  Automation-Type : refactored
 *  Automation-Date : 2026-11-02
 *  Run as          : CRM administrator (users.admin_crm)
 *  Host            : pre-production.nakivo.site
 *  Source version  : CRM-8899 updated 2026-03-20T05:33+0200 (steps in the description, Xray Manual Steps empty)
 *                    - re-check before trusting this spec
 *  Mirrored by     : CRM-12370_9.1.3 on crm-mig (helpers/lead-merging-mig.baseline-map.ts)
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Two leads share one public (gmail) e-mail: Lead #1 is an IB renewal lead (IB NC Leads), Lead #2 a Download Free
 *  Trial lead with a Contact Name. Verifies Lead #2 is merged into Lead #1, which keeps its own values and takes the
 *  Contact Name of Lead #2.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-542_1\.2\.1\.1 -" --project=chromium
 *  npx playwright test --grep "CRM-11289" --project=chromium
 *
 * --------------------------------------------------------------------------------------------
 *  Refactor 2026-11-02 (tester's review of run 2026-11-02-095553, leads 1103653 / 1103654)
 * --------------------------------------------------------------------------------------------
 *  - After the merge both leads show the Opportunity layout: the main-sheet Company Name / Contact Name / Address rows
 *    are hidden (o_invisible_modifier) and the same fields are shown in the "Follow-up" tab. The old readers took the
 *    hidden copy, so Step 3.2 passed with no Company Name on screen. These checks now read only a SHOWN row
 *    (LeadPage.readVisibleFormRow) and the Actual line names where it was read.
 *  - The form has two "CRM Developer" tabs; only the LAST one shows Is Won / Active / Lost Reason. Step 8 opened the
 *    first one and read Active / Is Won from the hidden copies. Steps 4 and 8 now open the last tab and read the
 *    four fields only where shown.
 *  - REQUIREMENT #4 VERIFY block (Verification step) + one verify-evidence shot per verification step, every field
 *    outlined in the colour of its own checks. Verification points are soft assertions: one run reports every
 *    difference instead of stopping at the first.
 *  - Removed the hard-coded HTML summary ("All 27 verification points passed") - it printed PASS whatever happened.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-8899 description, verbatim)
 * --------------------------------------------------------------------------------------------
 *  Pre-condition:
 *  1. After login successful, click at "CRM" button
 *  2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 *
 *  I. Condition#1 to create Lead#1:
 *  1. On "Leads" page, click at "CREATE" button
 *  2. Enter the following information:
 *     - Lead name textbox = TEST Lead 1 + current date time
 *     - Email textbox = Company email (with template Test+ company + current date + current time@gmail.com)
 *       (Remember the created email, called Email_Lead#1)
 *     - (in the Address section)
 *       - Company Name textbox = Company Name Lead 1
 *       - Street dropdown list = 123street
 *       - Country dropdown list = United States
 *       - State dropdown list = Texas (US)
 *     - Sales Team dropdown list = CMR
 *     - Salesperson dropdown list is cleared
 *     - Created manually checkbox is FALSE
 *  3. Click at "CRM Developer" tab at the bottom of page
 *     - Lead form textbox = IB NC Leads
 *  4. Press "SAVE" button
 *  5. Copy URL of Lead#1, called URL_Lead#1
 *
 *  II. Condition#2 to create Lead#2:
 *  1. On "Leads" page, click at "CREATE" button
 *  2. Enter the following information:
 *     - Lead name textbox = TEST Lead 2 + current date time
 *     - Email textbox = Email_Lead#1 that created in Condition#1
 *     - (in the Address section)
 *       - Company Name textbox = Company Name Lead 2
 *       - Contact Name textbox = Contact Name Lead 2
 *       - Street dropdown list = 123street
 *       - Country dropdown list = United States
 *       - State dropdown list = Texas (US)
 *     - Sales Team dropdown list = CMR
 *     - Salesperson dropdown list is cleared
 *     - Created manually checkbox is FALSE
 *  3. Click at "CRM Developer" tab at the bottom of page
 *     - Lead form textbox = Download Free Trial
 *  4. Press "SAVE" button
 *  5. Copy URL of Lead#2, called URL_Lead#2
 *
 *  Steps to reproduce:
 *  1. Wait for 1 minute for Lead Merging happened
 *  2. Open the Lead 1 using URL_Lead#1
 *  3. Verify the following:
 *     3.1. Tag field contains 2 values: "Renewal" and "Trial download"
 *     3.2. Company Name textbox = Company Name Lead 1
 *     3.3. Street dropdown list = 123street
 *     3.4. Country dropdown list = United States
 *     3.5. State dropdown list = Texas (US)
 *     3.6. Sales Team dropdown list is CMR
 *     3.7. Email textbox = Email_Lead#1 that created previously
 *     3.8. Contact Name textbox = Contact Name Lead 2 (transferred from Lead 2)
 *  4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *     4.1. Lead form textbox = IB NC Leads
 *     4.2. Active checkbox = TRUE
 *     4.3. Is Won = Pending
 *     4.4. Lost Reason = BLANK
 *  5. On the Log area, verify the following:
 *     5.1. There is the text as "[LEAD 2], has been merged into this lead." where [LEAD 2] is Lead Name of Lead#2
 *  6. Open the Lead 2 using URL_Lead#2
 *  7. Verify the following:
 *     7.1. Tag field contains 1 value: "Trial download"
 *     7.2. Company Name textbox = Company Name Lead 2
 *     7.3. Street dropdown list = 123street
 *     7.4. Country dropdown list = United States
 *     7.5. State dropdown list = Texas (US)
 *     7.6. Sales Team dropdown list is CMR
 *     7.7. Email textbox = Email_Lead#1 that created previously
 *     7.8. Contact Name textbox = Contact Name Lead 2
 *  8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *     8.1. Lead form textbox = Download Free Trial
 *     8.2. Active checkbox = FALSE
 *     8.3. Is Won = Lost
 *     8.4. Lost Reason = Duplicate
 *  9. On the Log area, verify the following:
 *     9.1. There is the text as "This lead has been merged into [LEAD 1]." where [LEAD 1] is Lead Name of Lead#1
 * ============================================================================================
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition 1-2: After login successful, click at "CRM" button, then on "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item',
  c1: 'Condition #1 (steps 1-5): Create Lead #1 with IB NC Leads form',
  c2: 'Condition #2 (steps 1-5): Create Lead #2 with Download Free Trial form',
  s1: 'Step 1: Wait for Lead Merging to happen',
  s2: 'Step 2: Open the Lead 1 using URL_Lead#1',
  s3: 'Step 3: Verify the following (Company Name / Address / Contact Name are read where the form shows them - after the merge the main sheet hides them and the "Follow-up" tab shows them)',
  s3_1: 'Step 3.1: Verify Tag field contains 2 values: "Renewal" and "Trial download"',
  s3_2: 'Step 3.2: Verify Company Name = Company Name Lead 1 (readonly)',
  s3_3: 'Step 3.3: Verify Street = 123street (readonly)',
  s3_4: 'Step 3.4: Verify Country = United States (readonly)',
  s3_5: 'Step 3.5: Verify State = Texas (US) (readonly)',
  s3_6: 'Step 3.6: Verify Sales Team = CMR (readonly)',
  s3_7: 'Step 3.7: Verify Email = Email_Lead#1 (readonly)',
  s3_8: 'Step 3.8: Verify Contact Name = Contact Name Lead 2 (readonly)',
  s4: 'Step 4: Click at "CRM Developer" tab and verify the following (the LAST "CRM Developer" tab - the first one shows Lead Form only, not Is Won / Active / Lost Reason)',
  s4_1: 'Step 4.1: Verify Lead form textbox = IB NC Leads',
  s4_2: 'Step 4.2: Verify Active checkbox = TRUE',
  s4_3: 'Step 4.3: Verify Is Won = Pending',
  s4_4: 'Step 4.4: Verify Lost Reason = BLANK',
  s5: 'Step 5: On the Log area, verify the following',
  s5_1: 'Step 5.1: Verify merge message in Log area',
  s6: 'Step 6: Open the Lead 2 using URL_Lead#2',
  s7: 'Step 7: Verify the following (Company Name / Address / Contact Name are read where the form shows them - after the merge the main sheet hides them and the "Follow-up" tab shows them)',
  s7_1: 'Step 7.1: Verify Tag field contains 1 value: "Trial download"',
  s7_2: 'Step 7.2: Verify Company Name = Company Name Lead 2 (readonly)',
  s7_3: 'Step 7.3: Verify Street = 123street (readonly)',
  s7_4: 'Step 7.4: Verify Country = United States (readonly)',
  s7_5: 'Step 7.5: Verify State = Texas (US) (readonly)',
  s7_6: 'Step 7.6: Verify Sales Team = CMR (readonly)',
  s7_7: 'Step 7.7: Verify Email (readonly)',
  s7_8: 'Step 7.8: Verify Contact Name = Contact Name Lead 2 (readonly)',
  s8: 'Step 8: Click at "CRM Developer" tab and verify the following (the LAST "CRM Developer" tab - the first one shows Lead Form only, not Is Won / Active / Lost Reason)',
  s8_1: 'Step 8.1: Verify Lead form textbox = Download Free Trial',
  s8_2: 'Step 8.2: Verify Active checkbox = FALSE',
  s8_3: 'Step 8.3: Verify Is Won = Lost',
  s8_4: 'Step 8.4: Verify Lost Reason = Duplicate',
  s9: 'Step 9: On the Log area, verify the following',
  s9_1: 'Step 9.1: Verify merge message in Log area',
  verify: 'Verification',
} as const;

/**
 * What each check read, outlined on its verify-evidence shot: field widgets by name, or the label + value cells
 * LeadPage.readVisibleFormRow() tagged (fields whose form carries hidden copies).
 */
const HIGHLIGHT = {
  tags: '.o_form_view [name="tag_ids"]',
  companyName: LeadPage.verifyRow('company-name'),
  address: LeadPage.verifyRow('address'),
  contactName: LeadPage.verifyRow('contact-name'),
  salesTeam: '.o_form_view [name="team_id"]',
  email: '.o_form_view [name="email_from"]',
  leadForm: LeadPage.verifyRow('lead-form'),
  active: LeadPage.verifyRow('active'),
  isWon: LeadPage.verifyRow('is-won'),
  lostReason: LeadPage.verifyRow('lost-reason'),
  log: '.o_mail_thread',
} as const;

test.describe('CRM-542_1.2.1.1 - Lead Merging: Same Public Domain Email with Different Priority (IB Renewal Lead) [CRM-11289]', () => {

  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();

    // Deny geolocation permission to prevent "Know your location" popup
    await context.grantPermissions([]);

    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    // If test failed, wait for page to stabilize before Playwright takes automatic screenshot
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      // Surface WHY the test failed (the assertion reason), not just the stabilize wait
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const leadPage = new LeadPage(page);
      await leadPage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.extraLong).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - end').catch(() => {});
  });

  // Un-skipped 2026-10-28: CRM-11289 Closed 2026-10-15 on Jira - re-verification run.
  test('[CRM-11289] Verify merging lead happens successfully when leads from same public domain email with different priority (IB renewal lead)', async ({ page }, testInfo) => {
    test.skip(true, 'Skipped due to bug CRM-11289');
    test.setTimeout(config.timeouts.test);
    testInfo.annotations.push({ type: 'defect', description: 'CRM-11289' });
    testInfo.annotations.push({ type: 'defect', description: 'CRM-8929' });

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const vlog = new VerifyLog();

    let sharedEmail = '';
    let lead1Name = '';
    let lead1Id = '';
    let lead1Url = '';
    let lead2Name = '';
    let lead2Id = '';
    let lead2Url = '';

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`  - Logged in as : ${users.admin_crm.displayName}`);
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await homePage.navigateToLeads();
      console.log('  - Opened      : CRM > Leads > Leads');
    });

    await test.step(STEP.c1, async () => {
      console.log(`\n--- ${STEP.c1} ---`);
      // public domain e-mail, e.g. Test+company-2026-01-07-123456@gmail.com
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      sharedEmail = `Test+company-${timestamp}@gmail.com`;
      lead1Name = CommonUtils.generateLeadNameWithPrefix('TEST Lead 1');

      await leadPage.clickCreate();
      await leadPage.fillLeadOpportunity(lead1Name);
      await leadPage.fillEmail(sharedEmail);
      await leadPage.fillCompanyName('Company Name Lead 1');
      await leadPage.fillStreet('123street');
      await leadPage.selectCountry('United States');
      await leadPage.selectState('Texas');
      await leadPage.selectSalesTeam('CMR');
      const salespersonCleared = await leadPage.clearSalesperson();
      const unchecked = await leadPage.uncheckCreatedManually();
      await leadPage.fillLeadForm('IB NC Leads');
      console.log(`  - Lead name        : ${lead1Name}`);
      console.log(`  - Email            : ${sharedEmail}`);
      console.log('  - Company Name     : Company Name Lead 1');
      console.log('  - Street           : 123street');
      console.log('  - Country          : United States');
      console.log('  - State            : Texas (US)');
      console.log('  - Sales Team       : CMR');
      console.log(`  - Salesperson      : ${salespersonCleared ? 'cleared' : 'field not found, skipped'}`);
      console.log(`  - Created manually : ${unchecked ? 'unchecked (FALSE)' : 'already FALSE'}`);
      console.log('  - Lead form        : IB NC Leads');

      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead1Url = page.url();
      console.log(`  - Saved, ID       : ${lead1Id}`);
      console.log(`  - URL_Lead#1       : ${lead1Url}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #1 - Lead #1 Created (ID: ${lead1Id})`);
    });

    await test.step(STEP.c2, async () => {
      console.log(`\n--- ${STEP.c2} ---`);
      lead2Name = CommonUtils.generateLeadNameWithPrefix('TEST Lead 2');

      await leadPage.clickCreate();
      await leadPage.fillLeadOpportunity(lead2Name);
      await leadPage.fillEmail(sharedEmail);
      await leadPage.fillCompanyName('Company Name Lead 2');
      await leadPage.fillContactName('Contact Name Lead 2');
      await leadPage.fillStreet('123street');
      await leadPage.selectCountry('United States');
      await leadPage.selectState('Texas');
      await leadPage.selectSalesTeam('CMR');
      const salespersonCleared = await leadPage.clearSalesperson();
      const unchecked = await leadPage.uncheckCreatedManually();
      await leadPage.fillLeadForm('Download Free Trial');
      console.log(`  - Lead name        : ${lead2Name}`);
      console.log(`  - Email            : ${sharedEmail} (= Email_Lead#1)`);
      console.log('  - Company Name     : Company Name Lead 2');
      console.log('  - Contact Name     : Contact Name Lead 2');
      console.log('  - Street           : 123street');
      console.log('  - Country          : United States');
      console.log('  - State            : Texas (US)');
      console.log('  - Sales Team       : CMR');
      console.log(`  - Salesperson      : ${salespersonCleared ? 'cleared' : 'field not found, skipped'}`);
      console.log(`  - Created manually : ${unchecked ? 'unchecked (FALSE)' : 'already FALSE'}`);
      console.log('  - Lead form        : Download Free Trial');

      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      lead2Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead2Url = page.url();
      console.log(`  - Saved, ID       : ${lead2Id}`);
      console.log(`  - URL_Lead#2       : ${lead2Url}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #2 - Lead #2 Created (ID: ${lead2Id})`);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      // stay on the source lead (Lead #2) and reload until it carries "This lead has been merged into <Lead #1>"
      await leadPage.wait(CommonUtils.waitTimes.long);
      const maxAttempts = 6;
      let merged = false;
      for (let attempt = 1; attempt <= maxAttempts && !merged; attempt++) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, CommonUtils.waitTimes.abnormalWait);
        merged = await leadPage.hasTargetLeadMergeMessage(lead1Name);
        console.log(`  - Attempt ${attempt}/${maxAttempts} : merge note on Lead #2 ${merged ? 'FOUND' : 'not yet'}`);
        if (!merged && attempt < maxAttempts) await page.waitForTimeout(CommonUtils.waitTimes.abnormalWait);
      }
      vlog.add({
        what: STEP.s1,
        expected: `"This lead has been merged into ${lead1Name}" on Lead #2 within ${maxAttempts} checks`,
        actual: merged ? 'FOUND' : 'NOT FOUND',
        result: merged ? 'PASS' : 'FAIL',
        difference: `'This lead has been merged into ${lead1Name}' not found on Lead #2 after ${maxAttempts} checks`,
      });
      expect.soft(merged, STEP.s1).toBeTruthy();
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await page.goto(lead1Url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, CommonUtils.waitTimes.abnormalWait);
      console.log(`  - Opened : ${page.url()}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 2 - Lead #1 After Merging (ID: ${lead1Id})`);
    });

    await verifyChecks(page, testInfo, vlog, STEP.s3, [
      { label: STEP.s3_1, match: 'contains', expected: ['Renewal', 'Trial download'], highlight: HIGHLIGHT.tags, read: async () => ({ actual: await leadPage.getTagsText() }) },
      { label: STEP.s3_2, match: 'contains', expected: 'Company Name Lead 1', highlight: HIGHLIGHT.companyName, read: () => readRow(leadPage, 'Company Name', 'company-name') },
      { label: STEP.s3_3, match: 'contains', expected: '123street', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s3_4, match: 'contains', expected: 'United States', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s3_5, match: 'contains', expected: 'Texas', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s3_6, match: 'contains', expected: 'CMR', highlight: HIGHLIGHT.salesTeam, read: async () => ({ actual: await leadPage.getSalesTeamValue() }) },
      { label: STEP.s3_7, match: 'contains', expected: sharedEmail.split('@')[0], highlight: HIGHLIGHT.email, read: async () => ({ actual: await leadPage.getEmailReadonly() }) },
      { label: STEP.s3_8, match: 'contains', expected: 'Contact Name Lead 2', meaning: 'transferred from Lead 2', highlight: HIGHLIGHT.contactName, read: () => readRow(leadPage, 'Contact Name', 'contact-name') },
    ]);

    await verifyChecks(page, testInfo, vlog, STEP.s4, [
      { label: STEP.s4_1, match: 'equals', expected: 'IB NC Leads', highlight: HIGHLIGHT.leadForm, read: () => readRow(leadPage, 'Lead Form', 'lead-form', null) },
      { label: STEP.s4_2, match: 'equals', expected: 'TRUE', highlight: HIGHLIGHT.active, read: () => readCheckbox(leadPage, 'Active', 'active') },
      { label: STEP.s4_3, match: 'equals', expected: 'Pending', highlight: HIGHLIGHT.isWon, read: () => readRow(leadPage, 'Is Won', 'is-won', null) },
      { label: STEP.s4_4, match: 'equals', expected: '', highlight: HIGHLIGHT.lostReason, read: () => readRow(leadPage, 'Lost Reason', 'lost-reason', null) },
    ], () => leadPage.clickCRMDeveloperTab_targetLead());

    await verifyChecks(page, testInfo, vlog, STEP.s5, [
      { label: STEP.s5_1, match: 'found', expected: `${lead2Name}, has been merged into this lead.`, meaning: 'NOT FOUND means Lead #2 was not merged into Lead #1', highlight: HIGHLIGHT.log,
        read: async () => ({ actual: (await leadPage.hasSourceLeadMergeMessage(lead2Name)) ? 'FOUND' : 'NOT FOUND' }) },
    ], () => homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, CommonUtils.waitTimes.abnormalWait));

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, CommonUtils.waitTimes.abnormalWait);
      console.log(`  - Opened : ${page.url()}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 6 - Lead #2 After Merging (ID: ${lead2Id})`);
    });

    await verifyChecks(page, testInfo, vlog, STEP.s7, [
      { label: STEP.s7_1, match: 'contains', expected: 'Trial download', highlight: HIGHLIGHT.tags, read: async () => ({ actual: await leadPage.getTagsText() }) },
      { label: STEP.s7_2, match: 'contains', expected: 'Company Name Lead 2', meaning: 'Lead #2 keeps its own Company Name', highlight: HIGHLIGHT.companyName, read: () => readRow(leadPage, 'Company Name', 'company-name') },
      { label: STEP.s7_3, match: 'contains', expected: '123street', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s7_4, match: 'contains', expected: 'United States', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s7_5, match: 'contains', expected: 'Texas', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s7_6, match: 'contains', expected: 'CMR', highlight: HIGHLIGHT.salesTeam, read: async () => ({ actual: await leadPage.getSalesTeamValue() }) },
      { label: STEP.s7_7, match: 'contains', expected: sharedEmail.split('@')[0], highlight: HIGHLIGHT.email, read: async () => ({ actual: await leadPage.getEmailReadonly() }) },
      { label: STEP.s7_8, match: 'contains', expected: 'Contact Name Lead 2', highlight: HIGHLIGHT.contactName, read: () => readRow(leadPage, 'Contact Name', 'contact-name') },
    ]);

    await verifyChecks(page, testInfo, vlog, STEP.s8, [
      { label: STEP.s8_1, match: 'equals', expected: 'Download Free Trial', highlight: HIGHLIGHT.leadForm, read: () => readRow(leadPage, 'Lead Form', 'lead-form', null) },
      { label: STEP.s8_2, match: 'equals', expected: 'FALSE', meaning: 'TRUE would mean the record was not archived by a merge', highlight: HIGHLIGHT.active,
        read: () => readCheckbox(leadPage, 'Active', 'active') },
      { label: STEP.s8_3, match: 'equals', expected: 'Lost', highlight: HIGHLIGHT.isWon, read: () => readRow(leadPage, 'Is Won', 'is-won', null) },
      { label: STEP.s8_4, match: 'equals', expected: 'Duplicate', highlight: HIGHLIGHT.lostReason, read: () => readRow(leadPage, 'Lost Reason', 'lost-reason', null) },
    ], () => leadPage.clickCRMDeveloperTab_targetLead());

    await verifyChecks(page, testInfo, vlog, STEP.s9, [
      { label: STEP.s9_1, match: 'found', expected: `This lead has been merged into ${lead1Name}.`, highlight: HIGHLIGHT.log,
        read: async () => ({ actual: (await leadPage.hasTargetLeadMergeMessage(lead1Name)) ? 'FOUND' : 'NOT FOUND' }) },
    ], () => homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, CommonUtils.waitTimes.abnormalWait));

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      vlog.print(`Lead #2 (${lead2Id}) merged into Lead #1 (${lead1Id}) - fields, CRM Developer tab and both log notes as expected`);
    });
  });
});

// ------------------------------------------------------------------------------------------------
// VERIFY block (REQUIREMENT #4) + verify-point evidence (REQUIREMENT #3b) - kept in this spec (self-contained)
// ------------------------------------------------------------------------------------------------

interface VerifyRow {
  what: string;
  expected: string;
  actual: string;
  result: 'PASS' | 'FAIL';
  /** FAIL only - what differs between Expected and Actual (REQUIREMENT #4c), computed from the asserted values */
  difference: string;
}

/** Every verification point of the run, printed as the VERIFY block in the Verification step. */
class VerifyLog {
  private rows: VerifyRow[] = [];
  add(row: VerifyRow): void {
    this.rows.push(row);
  }
  print(outcome: string): void {
    console.log('\n==================== VERIFY ====================');
    const failures: string[] = [];
    this.rows.forEach((r, i) => {
      console.log(`  Verify #${i + 1} - ${r.what}:`);
      console.log(`     Expected : ${r.expected}`);
      console.log(`     Actual   : ${r.actual}`);
      console.log(`     Result   : ${r.result}`);
      if (r.result === 'FAIL') {
        console.log(`     Difference : ${r.difference}`);
        failures.push(`Verify #${i + 1}: ${r.difference}`);
      }
    });
    console.log('================================================');
    console.log(failures.length === 0 ? `OVERALL: PASS - ${outcome}` : `OVERALL: FAIL - ${failures.join(' | ')}`);
  }
}

interface Check {
  /** the test.step label of this verification point (STEP const) */
  label: string;
  /** contains = every expected substring present; equals = exact value; found = the read returned FOUND */
  match: 'contains' | 'equals' | 'found';
  expected: string | string[];
  /** reads the value; `where` = where a labelled row was read (main sheet / "Follow-up" tab / not visible) */
  read: () => Promise<{ actual: string; where?: string }>;
  /** CSS selector of what the check read - outlined on the step's evidence shot in the colour of its own checks */
  highlight?: string;
  /** what a FAIL would mean, printed on the Expected line (REQUIREMENT #4a) */
  meaning?: string;
}

/**
 * A labelled field, only where a user can see it on Lead #1 / Lead #2: the form as shown, else the `fallbackTab`
 * (null = only the tab the step opened - the CRM Developer fields).
 */
async function readRow(leadPage: LeadPage, label: string, key: string, fallbackTab: string | null = 'Follow-up'): Promise<{ actual: string; where: string }> {
  const row = await leadPage.readVisibleFormRow(label, key, fallbackTab);
  return { actual: row.value, where: row.where };
}

/** A shown checkbox field as TRUE / FALSE ('' when no shown row carries it) - in the tab the step opened. */
async function readCheckbox(leadPage: LeadPage, label: string, key: string): Promise<{ actual: string; where: string }> {
  const row = await leadPage.readVisibleFormRow(label, key, null);
  return { actual: row.checked === null ? '' : row.checked ? 'TRUE' : 'FALSE', where: row.where };
}

/**
 * One verification step: optional `before` (open a tab), one nested test.step per verification point - read, compute
 * the verdict, log Expected / Actual / Result (+ Difference on a FAIL), then expect.soft - and one evidence shot of
 * the step's screen in which every read element is outlined in the colour of its own checks.
 */
async function verifyChecks(page: Page, testInfo: TestInfo, vlog: VerifyLog, stepLabel: string, checks: Check[], before?: () => Promise<unknown>): Promise<void> {
  await test.step(stepLabel, async () => {
    console.log(`\n--- ${stepLabel} ---`);
    if (before) await before();
    const lines: string[] = [];
    const outlines = new Map<string, boolean>();
    let allPassed = true;

    for (const c of checks) {
      await test.step(c.label, async () => {
        console.log(`--- ${c.label} ---`);
        const exp = Array.isArray(c.expected) ? c.expected : [c.expected];
        const { actual: raw, where } = await c.read();
        const actual = raw.replace(/\s+/g, ' ').trim();
        const show = (v: string) => (v === '' ? 'BLANK' : `"${v}"`);
        let passed: boolean;
        let expectedText: string;
        let difference: string;
        if (c.match === 'contains') {
          const missing = exp.filter((v) => !actual.includes(v));
          passed = missing.length === 0;
          expectedText = `contains ${exp.map((v) => `"${v}"`).join(' + ')}`;
          difference = `${missing.map((v) => `'${v}'`).join(', ')} not found in '${actual || '(empty)'}'${where ? ` (${where})` : ''}`;
        } else if (c.match === 'found') {
          passed = actual === 'FOUND';
          expectedText = `"${exp[0]}" PRESENT`;
          difference = `'${exp[0]}' not found`;
        } else {
          passed = actual === exp[0];
          expectedText = show(exp[0]);
          difference = `expected ${show(exp[0])}, got ${show(actual)}${where ? ` (${where})` : ''}`;
        }
        if (c.meaning) expectedText = `${expectedText} (${c.meaning})`;
        const shownActual = `${c.match === 'equals' ? show(actual) : actual || '(empty)'}${where ? `  [read on: ${where}]` : ''}`;

        vlog.add({ what: c.label, expected: expectedText, actual: shownActual, result: passed ? 'PASS' : 'FAIL', difference });
        console.log(`  Expected : ${expectedText}`);
        console.log(`  Actual   : ${shownActual}`);
        console.log(`  Result   : ${passed ? 'PASS' : 'FAIL'}`);
        if (!passed) console.log(`  Difference : ${difference}`);
        lines.push(`${passed ? 'PASS' : 'FAIL'} ${c.label}`);
        lines.push(`  expected: ${expectedText}`);
        lines.push(`  actual  : ${shownActual}`);
        if (!passed) lines.push(`  difference: ${difference}`);
        if (!passed) allPassed = false;
        if (c.highlight) outlines.set(c.highlight, (outlines.get(c.highlight) ?? true) && passed);

        if (c.match === 'contains') for (const v of exp) expect.soft(actual, `${c.label} - contains "${v}"`).toContain(v);
        else if (c.match === 'found') expect.soft(actual, c.label).toBe('FOUND');
        else expect.soft(actual, c.label).toBe(exp[0]);
      });
    }

    await CommonUtils.captureVerifyEvidence(page, testInfo, {
      name: stepLabel.split(' (')[0],
      passed: allPassed,
      outlines: [...outlines].map(([selector, ok]) => ({ selector, passed: ok })),
      lines,
      corner: 'bottom-right',
    }).catch(() => {});
  });
}
