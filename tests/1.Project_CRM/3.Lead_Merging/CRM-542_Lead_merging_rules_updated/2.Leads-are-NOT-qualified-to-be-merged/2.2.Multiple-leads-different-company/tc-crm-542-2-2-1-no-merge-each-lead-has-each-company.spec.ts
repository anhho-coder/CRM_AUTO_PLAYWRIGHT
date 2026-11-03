import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { recordNoMergeForDeferredVerify } from '@helpers/deferred-verify-merge.helper';

/**
 * ============================================================================================
 *  CRM-542_2.2.1 - Lead Merging: NO merge - different emails, each lead belongs to its own company
 * ============================================================================================
 *  Test Case ID    : CRM-542_2.2.1
 *  Jira            : CRM-8903 (Post-EA - Test Case)
 *  Bug             : CRM-8930 - declaration-level test.skip, set by the tester
 *  Automation-Type : refactored
 *  Automation-Date : 2026-11-03
 *  Run as          : CRM administrator (users.admin_crm)
 *  Host            : pre-production.nakivo.site
 *  Source version  : CRM-8903 updated 2026-03-20T05:34+0200 - re-check before trusting this spec
 *  Mirrored by     : CRM-12370_9.3.3 on crm-mig (helpers/lead-merging-mig.baseline-map.ts)
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
 *  npx playwright test --grep "CRM-542_2\.2\.1 -" --project=chromium
 *  npx playwright test --grep "CRM-8930" --project=chromium
 *
 * --------------------------------------------------------------------------------------------
 *  Refactor 2026-11-03 (same pattern as CRM-542_1.2.1.1, 2026-11-02) - the assertions are unchanged
 * --------------------------------------------------------------------------------------------
 *  - REQUIREMENT #4 VERIFY block (Verification step) + one verify-evidence shot per verification step (3, 4, 5, 7,
 *    8, 9), every field outlined in the colour of its own checks. Verification points are soft assertions: one run
 *    reports every difference instead of stopping at the first.
 *  - Company Name / Address / Contact Name and the CRM Developer fields are read only where the form SHOWS them
 *    (LeadPage.readVisibleFormRow); the Actual line names where. Steps 4 and 8 open the LAST "CRM Developer" tab - the
 *    first one shows Lead Form only, Active / Is Won / Lost Reason exist in the last one (pre-prod 1103654, 2026-11-02).
 *  - Removed the hard-coded "Final Summary" HTML (it printed PASS whatever happened).
 *  - Kept as this spec asserts, although the manual TC CRM-8903 words them differently:
 *      3.2 / 7.2  manual "Company Name Lead 1/2"   -> asserted: name of Contact #1 / #2 (the linked company)
 *      7.7        manual "Email_Lead#1"            -> asserted: Email_Lead#2
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-8903, verbatim)
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
  s1: 'Step 1: Wait to confirm NO merge happens',
  s2: 'Step 2: Open the Lead 1 using URL_Lead#1',
  s3: 'Step 3: Verify Lead #1 fields (should remain unchanged)',
  s3_1: 'Step 3.1: Verify Tag field is "Renewal"',
  s3_2: 'Step 3.2: Verify Company Name = Name_Contact#1 (readonly)',
  s3_3: 'Step 3.3: Verify Street = 123street (readonly)',
  s3_4: 'Step 3.4: Verify Country = United States (readonly)',
  s3_5: 'Step 3.5: Verify State = Texas (US) (readonly)',
  s3_6: 'Step 3.6: Verify Sales Team = CMR (readonly)',
  s3_7: 'Step 3.7: Verify Email = Email_Lead#1 (readonly)',
  s4: 'Step 4: Click at "CRM Developer" tab and verify the following (the LAST "CRM Developer" tab - the first one shows Lead Form only, not Is Won / Active / Lost Reason)',
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
  s8: 'Step 8: Click at "CRM Developer" tab and verify the following (the LAST "CRM Developer" tab - the first one shows Lead Form only, not Is Won / Active / Lost Reason)',
  s8_1: 'Step 8.1: Verify Lead form textbox = Download Free Trial',
  s8_2: 'Step 8.2: Verify Active checkbox = TRUE',
  s8_3: 'Step 8.3: Verify Is Won = Pending',
  s8_4: 'Step 8.4: Verify Lost Reason = BLANK',
  s9: 'Step 9: On the Log area, verify NO merge message',
  s9_1: 'Step 9.1: Verify NO "This lead has been merged into [LEAD 1]." message',
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

test.describe('CRM-542_2.2.1 - NO MERGE: Different Emails and Different Companies', () => {

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

  test.skip('CRM-542_2.2.1 [CRM-8930]: Verify that leads do NOT merge when leads have different emails and different companies', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);
    const leadPage = new LeadPage(page);
    const vlog = new VerifyLog();

    await homePage.setViewport(1920, 1080);

    const tcId = 'CRM-542_2.2.1';
    let contact1Name = '';
    let contact1Domain = '';
    let contact2Name = '';
    let contact2Domain = '';
    let lead1Name = '';
    let lead1Email = '';
    let lead1Id = '';
    let lead1Url = '';
    let lead2Name = '';
    let lead2Email = '';
    let lead2Id = '';
    let lead2Url = '';

    /** Conditions I / II - steps 3-4: one company contact, saved; returns its id. */
    const createCompanyContact = async (name: string, email: string, label: string): Promise<string> => {
      console.log('  - Company checkbox    : TRUE');
      console.log(`  - Contact Name        : ${name}`);
      console.log(`  - Email               : ${email}`);
      console.log('  - Street              : 123street');
      console.log('  - Country             : United States');
      console.log('  - State               : Texas (US)');
      console.log('  - Sales Team          : CMR');
      console.log('  - Salesperson         : cleared');
      await contactPage.checkCompanyCheckbox();
      await contactPage.fillContactName(name);
      await contactPage.fillEmail(email);
      await contactPage.fillStreet('123street');
      await contactPage.selectCountry('United States');
      await contactPage.selectState('Texas');
      await contactPage.selectSalesTeam('CMR');
      await contactPage.clearSalesperson();
      await contactPage.clickSave();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      // the id reaches the URL only after the save answers (read at once, run 2026-11-03 logged an empty id)
      const id = await contactPage.waitForIdInUrlAndExtract(config.timeouts.urlWait).catch(() => '');
      console.log(`  -> ${label} saved: id ${id || '(not in the URL)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${label} Created (ID: ${id})`);
      return id;
    };

    /** Conditions III / IV - steps 3-6(7): one lead, saved; returns its id and URL. */
    const createLead = async (
      input: { name: string; email: string; companyName: string; contactName?: string; leadForm: string },
      label: string,
    ): Promise<{ id: string; url: string }> => {
      await leadPage.clickCreate();
      await leadPage.fillLeadOpportunity(input.name);
      await leadPage.fillEmail(input.email);
      await leadPage.fillCompanyName(input.companyName);
      if (input.contactName) await leadPage.fillContactName(input.contactName);
      await leadPage.fillStreet('123street');
      await leadPage.selectCountry('United States');
      await leadPage.selectState('Texas');
      await leadPage.selectSalesTeam('CMR');
      const salespersonCleared = await leadPage.clearSalesperson();
      const unchecked = await leadPage.uncheckCreatedManually();
      await leadPage.fillLeadForm(input.leadForm);
      console.log(`  - Lead name           : ${input.name}`);
      console.log(`  - Email               : ${input.email}`);
      console.log(`  - Company Name        : ${input.companyName}`);
      if (input.contactName) console.log(`  - Contact Name        : ${input.contactName}`);
      console.log('  - Street              : 123street');
      console.log('  - Country             : United States');
      console.log('  - State               : Texas (US)');
      console.log('  - Sales Team          : CMR');
      console.log(`  - Salesperson         : ${salespersonCleared ? 'cleared' : 'field not found, skipped'}`);
      console.log(`  - Created manually    : ${unchecked ? 'unchecked (FALSE)' : 'already FALSE'}`);
      console.log(`  - Lead form (CRM Dev) : ${input.leadForm}`);
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      const id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      const url = page.url();
      console.log(`  -> ${label} saved: id ${id}`);
      console.log(`     URL: ${url}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${label} Created (ID: ${id})`);
      return { id, url };
    };

    /** Steps 2 / 6: open a lead by its URL and wait for the form. */
    const openLead = async (url: string): Promise<void> => {
      console.log(`  - Opening     : ${url}`);
      await homePage.goto(url, { waitUntil: 'domcontentloaded' });
      await homePage.wait(CommonUtils.waitTimes.long);
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, CommonUtils.waitTimes.abnormalWait);
      console.log(`  - Opened      : ${page.url()}`);
    };

    await test.step(STEP.cI_1, async () => {
      console.log(`\n--- ${STEP.cI_1} ---`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`  - Logged in as : ${users.admin_crm.displayName}`);
      await homePage.navigateToContactsFromHome();
      console.log('  - Opened      : Contacts');
    });

    await test.step(STEP.cI_2, async () => {
      console.log(`\n--- ${STEP.cI_2} ---`);
      await contactPage.clickCreate();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    });

    await test.step(STEP.cI_34, async () => {
      console.log(`\n--- ${STEP.cI_34} ---`);
      const timestamp1 = CommonUtils.generateTimestamp();
      contact1Name = `TEST-Contact#1_${tcId}_${timestamp1}`;
      contact1Domain = `@company${timestamp1}.com`;
      await createCompanyContact(contact1Name, `Test-company${contact1Domain}`, 'Condition I - Contact #1');
      console.log(`  - Domain_Email_Contact#1 : ${contact1Domain}`);
    });

    await test.step(STEP.cI_5, async () => {
      console.log(`\n--- ${STEP.cI_5} ---`);
      await homePage.returnToHome();
    });

    await test.step(STEP.cII_1, async () => {
      console.log(`\n--- ${STEP.cII_1} ---`);
      await homePage.navigateToContactsFromHome();
    });

    await test.step(STEP.cII_2, async () => {
      console.log(`\n--- ${STEP.cII_2} ---`);
      await contactPage.clickCreate();
      await contactPage.wait(CommonUtils.waitTimes.standard);
    });

    await test.step(STEP.cII_34, async () => {
      console.log(`\n--- ${STEP.cII_34} ---`);
      await homePage.wait(CommonUtils.waitTimes.short); // a different timestamp than Contact #1
      const timestamp2 = CommonUtils.generateTimestamp();
      contact2Name = `TEST-Contact#2_${tcId}_${timestamp2}`;
      contact2Domain = `@company${timestamp2}.com`;
      await createCompanyContact(contact2Name, `Test-company${contact2Domain}`, 'Condition II - Contact #2');
      console.log(`  - Domain_Email_Contact#2 : ${contact2Domain}`);
    });

    await test.step(STEP.cII_5, async () => {
      console.log(`\n--- ${STEP.cII_5} ---`);
      await homePage.returnToHome();
    });

    await test.step(STEP.cIII_12, async () => {
      console.log(`\n--- ${STEP.cIII_12} ---`);
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await homePage.navigateToLeads();
      console.log('  - Opened      : CRM > Leads > Leads');
    });

    await test.step(STEP.cIII, async () => {
      console.log(`\n--- ${STEP.cIII} ---`);
      lead1Name = `TEST Lead 1 ${CommonUtils.generateTimestamp()}`;
      lead1Email = `Lead#1${contact1Domain}`;
      ({ id: lead1Id, url: lead1Url } = await createLead(
        { name: lead1Name, email: lead1Email, companyName: 'Company Name Lead 1', leadForm: 'IB NC Leads' },
        'Condition III - Lead #1',
      ));
    });

    await test.step(STEP.cIII_8, async () => {
      console.log(`\n--- ${STEP.cIII_8} ---`);
      await homePage.returnToHome();
    });

    await test.step(STEP.cIV_12, async () => {
      console.log(`\n--- ${STEP.cIV_12} ---`);
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await homePage.navigateToLeads();
      console.log('  - Opened      : CRM > Leads > Leads');
    });

    await test.step(STEP.cIV, async () => {
      console.log(`\n--- ${STEP.cIV} ---`);
      lead2Name = `TEST Lead 2 ${CommonUtils.generateTimestamp()}`;
      lead2Email = `Lead#2${contact2Domain}`;
      ({ id: lead2Id, url: lead2Url } = await createLead(
        { name: lead2Name, email: lead2Email, companyName: 'Company Name Lead 2', contactName: 'Contact Name Lead 2', leadForm: 'Download Free Trial' },
        'Condition IV - Lead #2',
      ));
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await leadPage.waitForNoMergeConfirmation();
      // DEFERRED RE-VERIFY (merging): the no-merge checks below only span this window; a wrongly-slow merge could
      // still land AFTER it. Both leads are recorded so the round-2 job re-opens them ~1h later and confirms neither
      // merged (Lead #1 = would-be TARGET, Lead #2 = would-be SOURCE).
      recordNoMergeForDeferredVerify(page, lead1Url, 'target', lead2Name);
      recordNoMergeForDeferredVerify(page, lead2Url, 'source', lead1Name);
      console.log(`  - Waited      : ${CommonUtils.waitTimes.leadMergingNotHappen / 1000} s; Lead #1 / Lead #2 recorded for the round-2 deferred no-merge re-check`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await openLead(lead1Url);
    });

    await verifyChecks(page, testInfo, vlog, STEP.s3, [
      { label: STEP.s3_1, match: 'contains', expected: 'Renewal', highlight: HIGHLIGHT.tags, read: async () => ({ actual: await leadPage.getTagsText() }) },
      { label: STEP.s3_2, match: 'contains', expected: contact1Name, meaning: 'the lead linked to Contact #1\'s company', highlight: HIGHLIGHT.companyName, read: () => readRow(leadPage, 'Company Name', 'company-name') },
      { label: STEP.s3_3, match: 'contains', expected: '123street', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s3_4, match: 'contains', expected: 'United States', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s3_5, match: 'contains', expected: 'Texas', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s3_6, match: 'contains', expected: 'CMR', highlight: HIGHLIGHT.salesTeam, read: async () => ({ actual: await leadPage.getSalesTeamValue() }) },
      { label: STEP.s3_7, match: 'contains', expected: lead1Email.split('@')[0], highlight: HIGHLIGHT.email, read: async () => ({ actual: await leadPage.getEmailReadonly() }) },
    ]);

    await verifyChecks(page, testInfo, vlog, STEP.s4, [
      { label: STEP.s4_1, match: 'contains', expected: 'IB NC Leads', highlight: HIGHLIGHT.leadForm, read: () => readRow(leadPage, 'Lead Form', 'lead-form', null) },
      { label: STEP.s4_2, match: 'equals', expected: 'TRUE', meaning: 'FALSE would mean the lead was archived by a merge', highlight: HIGHLIGHT.active, read: () => readCheckbox(leadPage, 'Active', 'active') },
      { label: STEP.s4_3, match: 'equals', expected: 'Pending', highlight: HIGHLIGHT.isWon, read: () => readRow(leadPage, 'Is Won', 'is-won', null) },
      { label: STEP.s4_4, match: 'equals', expected: '', highlight: HIGHLIGHT.lostReason, read: () => readRow(leadPage, 'Lost Reason', 'lost-reason', null) },
    ], () => leadPage.clickCRMDeveloperTab_targetLead());

    await verifyChecks(page, testInfo, vlog, STEP.s5, [
      { label: STEP.s5_1, match: 'absent', expected: `${lead2Name}, has been merged into this lead.`, meaning: 'FOUND means Lead #2 was merged into Lead #1', highlight: HIGHLIGHT.log,
        read: async () => ({ actual: (await leadPage.hasSourceLeadMergeMessage(lead2Name)) ? 'FOUND' : 'NOT FOUND' }) },
    ], () => homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, CommonUtils.waitTimes.abnormalWait));

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await openLead(lead2Url);
    });

    await verifyChecks(page, testInfo, vlog, STEP.s7, [
      { label: STEP.s7_1, match: 'contains', expected: 'Trial download', highlight: HIGHLIGHT.tags, read: async () => ({ actual: await leadPage.getTagsText() }) },
      { label: STEP.s7_2, match: 'contains', expected: contact2Name, meaning: 'the lead linked to Contact #2\'s company', highlight: HIGHLIGHT.companyName, read: () => readRow(leadPage, 'Company Name', 'company-name') },
      { label: STEP.s7_3, match: 'contains', expected: '123street', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s7_4, match: 'contains', expected: 'United States', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s7_5, match: 'contains', expected: 'Texas', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: STEP.s7_6, match: 'contains', expected: 'CMR', highlight: HIGHLIGHT.salesTeam, read: async () => ({ actual: await leadPage.getSalesTeamValue() }) },
      { label: STEP.s7_7, match: 'contains', expected: lead2Email.split('@')[0], highlight: HIGHLIGHT.email, read: async () => ({ actual: await leadPage.getEmailReadonly() }) },
      { label: STEP.s7_8, match: 'contains', expected: 'Contact Name Lead 2', highlight: HIGHLIGHT.contactName, read: () => readRow(leadPage, 'Contact Name', 'contact-name') },
    ]);

    await verifyChecks(page, testInfo, vlog, STEP.s8, [
      { label: STEP.s8_1, match: 'contains', expected: 'Download Free Trial', highlight: HIGHLIGHT.leadForm, read: () => readRow(leadPage, 'Lead Form', 'lead-form', null) },
      { label: STEP.s8_2, match: 'equals', expected: 'TRUE', meaning: 'FALSE would mean the lead was archived by a merge', highlight: HIGHLIGHT.active, read: () => readCheckbox(leadPage, 'Active', 'active') },
      { label: STEP.s8_3, match: 'equals', expected: 'Pending', highlight: HIGHLIGHT.isWon, read: () => readRow(leadPage, 'Is Won', 'is-won', null) },
      { label: STEP.s8_4, match: 'equals', expected: '', highlight: HIGHLIGHT.lostReason, read: () => readRow(leadPage, 'Lost Reason', 'lost-reason', null) },
    ], () => leadPage.clickCRMDeveloperTab_targetLead());

    await verifyChecks(page, testInfo, vlog, STEP.s9, [
      { label: STEP.s9_1, match: 'absent', expected: `This lead has been merged into ${lead1Name}.`, meaning: 'FOUND means Lead #2 was merged into Lead #1', highlight: HIGHLIGHT.log,
        read: async () => ({ actual: (await leadPage.hasTargetLeadMergeMessage(lead1Name)) ? 'FOUND' : 'NOT FOUND' }) },
    ], () => homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, CommonUtils.waitTimes.abnormalWait));

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      vlog.print(`Lead #1 (${lead1Id}) and Lead #2 (${lead2Id}) were NOT merged - each stays Active and linked to its own company`);
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
  /** contains = every expected substring present; equals = exact value; absent = the read returned NOT FOUND */
  match: 'contains' | 'equals' | 'absent';
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
        } else if (c.match === 'absent') {
          passed = actual === 'NOT FOUND';
          expectedText = `"${exp[0]}" ABSENT`;
          difference = `'${exp[0]}' found but must be absent`;
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
        else if (c.match === 'absent') expect.soft(actual, c.label).toBe('NOT FOUND');
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
