import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

// demo_test runs verify REAL data on pre-prod - keep created leads (do NOT clean up).
const SKIP_CLEANUP_LEADS = true;

/**
 * ============================================================================
 *  CRM-11284_2.1 - Normal duplicate leads still auto-merge (control)
 * ============================================================================
 *  Test Case ID    : CRM-11284_2.1
 *  Jira            : CRM-11284  (Post-EA - Support Ticket, Resolved 2026-07-14)
 *  Automation-Type : new
 *  Automation-Date : 2026-07-14
 *
 *  Summary: Positive control for CRM-11284 - two duplicate leads on a NORMAL
 *  (non-Enterprise) company domain still auto-merge. Confirms the merge-eligibility
 *  recipe genuinely merges, so the "1. NOT Merged Lead" cases' "no merge" is attributable
 *  to the Enterprise-account protection and not to an ineligible pair.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11284_2\.1:" --project=chromium-headless
 *
 *  Source manual TC (from Khang Nguyen's conclusion comment, 2026-07-14):
 *    Merge-eligibility recipe (see config/LEAD_MERGING_TEST_RULES.md):
 *      - Lead#1 (older, manual, SURVIVOR): Created Manually = TRUE, Tag = "Can_Merge", Lead form = BLANK
 *      - Lead#2 (newer, other, ABSORBED) : Created Manually = FALSE, Lead form = License
 *      - Both leads share the SAME normal company-domain email.
 *    Pre-condition : Login as Odoo Administrator; open CRM > Leads.
 *    1. Create the older lead (Lead #1) with a normal company-domain email.
 *    2. Create a new lead (Lead #2) with the same normal company-domain email.
 *    3. Let the automatic processing run.
 *    Expected:
 *       - The duplicate leads merge: Lead #2 archived (Active = FALSE, Is Won = Lost,
 *         Lost Reason = Duplicate) into Lead #1, with the merge log notes on both.
 * ============================================================================
 */

test.describe('CRM-11284_2.1 - Normal duplicate leads still auto-merge (control)', () => {

  // Per-test list of created lead URLs, cleaned up in afterEach.
  let createdLeadUrls: string[] = [];

  test.beforeEach(async ({ page, context }) => {
    createdLeadUrls = [];
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});

    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('❌ TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const loadingSpinner = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await loadingSpinner.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    }

    if (!SKIP_CLEANUP_LEADS) {
      for (const url of createdLeadUrls) {
        if (!url) continue;
        try {
          await CommonUtils.deleteRecordByUrl(page, url, testInfo);
        } catch (e) {
          console.log(`  ⚠ Cleanup skipped for ${url}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11284_2.1: Normal duplicate leads still auto-merge (control - non-Enterprise domain)', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);

    const tcId = 'CRM-11284_2.1';
    // Normal (non-Enterprise) company domain, unique per run, shared by both leads.
    const sharedEmail = CommonUtils.generateEmail('Test', 'company');
    const lead1Name = `TEST Lead 1 ${tcId}`;
    const lead2Name = `TEST Lead 2 ${tcId}`;
    let lead1Url = '';
    let lead2Url = '';

    // Gathered actuals.
    let l1MergeMsg = false, l2MergeMsg = false;
    let l1Active = true, l2Active = false;
    let l2IsWon = '', l2LostReason = '';

    // PRE-CONDITION I: Login, open CRM > Leads, create Lead #1 (older, normal domain)
    await test.step('Pre-condition I: Login as Odoo Administrator, open CRM > Leads, and create Lead #1 (older) on a normal company domain', async () => {
      console.log(`\n=== ${tcId} : PRE-CONDITION I - LEAD #1 (older, normal domain) ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Logged in as ${users.admin_crm.displayName}`);

      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await homePage.navigateToLeads();
      console.log('✓ Navigated to CRM > Leads');

      console.log(`Shared normal-domain email (Email_Lead#1): ${sharedEmail}`);
      const created = await createMergeEligibleLead(leadPage, page, {
        leadName: lead1Name,
        email: sharedEmail,
        companyName: 'Company Name Lead 1',
        country: 'Belgium',
        state: 'Flanders',
        createdManually: true,
        tag: 'Can_Merge',
        leadForm: '',
      });
      lead1Url = created.url;
      createdLeadUrls.push(lead1Url);
      console.log(`✓ Lead #1 saved (ID ${created.id}) - URL_Lead#1: ${lead1Url}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Lead #1 created (normal domain)');
    });

    // PRE-CONDITION II: create Lead #2 (newer, same normal domain email)
    await test.step('Pre-condition II: Create a new lead (Lead #2) with the same normal company-domain email', async () => {
      console.log(`\n=== ${tcId} : PRE-CONDITION II - LEAD #2 (newer, same normal email) ===`);
      const created = await createMergeEligibleLead(leadPage, page, {
        leadName: lead2Name,
        email: sharedEmail,
        companyName: 'Company Name Lead 2',
        contactName: 'Contact Name Lead 2',
        country: 'United States',
        state: 'Texas',
        createdManually: false,
        leadForm: 'License',
      });
      lead2Url = created.url;
      createdLeadUrls.push(lead2Url);
      console.log(`✓ Lead #2 saved (ID ${created.id}) - URL_Lead#2: ${lead2Url}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Lead #2 created (same normal email)');
    });

    // STEP 1: let the automatic processing run (async merge window)
    await test.step('Step 1: Let the automatic processing run (wait for the async merge window)', async () => {
      console.log(`\n=== ${tcId} : STEP 1 - WAIT FOR AUTOMATIC PROCESSING (expect merge) ===`);
      await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);
      console.log('✓ Observation window elapsed');
    });

    // STEP 2: open Lead #1 (survivor) and read its final state
    await test.step('Step 2: Open Lead #1 (survivor) and read its final state (merge log, Active)', async () => {
      console.log(`\n=== ${tcId} : STEP 2 - READ LEAD #1 (survivor) ===`);
      await page.goto(lead1Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      l1MergeMsg = await leadPage.hasSourceLeadMergeMessage(lead2Name);
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      l1Active = await leadPage.isActiveChecked();
      console.log(`  - Lead #1 "<Lead2>, has been merged into this lead" log present: ${l1MergeMsg}`);
      console.log(`  - Lead #1 Active : ${l1Active}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Lead #1 final state (survivor)');
    });

    // STEP 3: open Lead #2 (absorbed) and read its final state
    await test.step('Step 3: Open Lead #2 (absorbed) and read its final state (merge log, Active, Is Won, Lost Reason)', async () => {
      console.log(`\n=== ${tcId} : STEP 3 - READ LEAD #2 (absorbed) ===`);
      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      l2MergeMsg = await leadPage.hasTargetLeadMergeMessage(lead1Name);
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      l2Active = await leadPage.isActiveChecked();
      l2IsWon = (await leadPage.getIsWonValue()).trim();
      l2LostReason = (await leadPage.getLostReasonValueViaTextContent()).trim();
      console.log(`  - Lead #2 "This lead has been merged into <Lead1>" log present: ${l2MergeMsg}`);
      console.log(`  - Lead #2 Active      : ${l2Active}`);
      console.log(`  - Lead #2 Is Won      : ${l2IsWon}`);
      console.log(`  - Lead #2 Lost Reason : ${l2LostReason}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Lead #2 final state (absorbed)');
    });

    // STEP 4 (Verification): the duplicate leads merged
    await test.step('Step 4: Verify the duplicate leads merged (Lead #2 archived into Lead #1)', async () => {
      const overallPass =
        l1MergeMsg === true && l2MergeMsg === true &&
        l1Active === true && l2Active === false &&
        l2IsWon === 'Lost' && l2LostReason === 'Duplicate';

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - Lead #1 shows "<Lead2>, has been merged into this lead":');
      console.log(`     Expected : FOUND`);
      console.log(`     Actual   : ${l1MergeMsg ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result   : ${l1MergeMsg === true ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Lead #1 survives (Active = TRUE):');
      console.log(`     Expected : TRUE`);
      console.log(`     Actual   : ${l1Active}`);
      console.log(`     Result   : ${l1Active === true ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Lead #2 shows "This lead has been merged into <Lead1>":');
      console.log(`     Expected : FOUND`);
      console.log(`     Actual   : ${l2MergeMsg ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result   : ${l2MergeMsg === true ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - Lead #2 archived (Active = FALSE):');
      console.log(`     Expected : FALSE`);
      console.log(`     Actual   : ${l2Active}`);
      console.log(`     Result   : ${l2Active === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - Lead #2 Is Won = Lost:');
      console.log(`     Expected : Lost`);
      console.log(`     Actual   : ${l2IsWon}`);
      console.log(`     Result   : ${l2IsWon === 'Lost' ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #6 - Lead #2 Lost Reason = Duplicate:');
      console.log(`     Expected : Duplicate`);
      console.log(`     Actual   : ${l2LostReason}`);
      console.log(`     Result   : ${l2LostReason === 'Duplicate' ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - normal duplicate leads ${overallPass ? 'merged as expected (control)' : 'did NOT merge as expected'}`);
      console.log('===============================================\n');

      expect(l1MergeMsg, 'Lead #1 must show the "merged into this lead" log note').toBeTruthy();
      expect(l1Active, 'Lead #1 (survivor) must stay Active').toBeTruthy();
      expect(l2MergeMsg, 'Lead #2 must show the "this lead has been merged into" log note').toBeTruthy();
      expect(l2Active, 'Lead #2 (absorbed) must be archived (Active = FALSE)').toBeFalsy();
      expect(l2IsWon, 'Lead #2 Is Won must be Lost').toBe('Lost');
      expect(l2LostReason, 'Lead #2 Lost Reason must be Duplicate').toBe('Duplicate');
    });
  });
});

/**
 * Create a merge-eligible Lead via the CRM > Leads form and return its id + URL.
 * Logs each entered field on its own line (one field per line) for reviewable evidence.
 * Assumes the Leads list is already open. Keeps strict POM (only LeadPage methods).
 */
async function createMergeEligibleLead(
  leadPage: LeadPage,
  page: import('@playwright/test').Page,
  opts: {
    leadName: string;
    email: string;
    companyName: string;
    contactName?: string;
    country: string;
    state: string;
    createdManually: boolean;
    tag?: string;
    leadForm: string;
  }
): Promise<{ id: string; url: string }> {
  await leadPage.clickCreate();

  await leadPage.fillLeadOpportunity(opts.leadName);
  console.log(`  - Lead name       : ${opts.leadName}`);

  await leadPage.fillEmail(opts.email);
  console.log(`  - Email           : ${opts.email}`);

  await leadPage.fillCompanyName(opts.companyName);
  console.log(`  - Company Name    : ${opts.companyName}`);

  if (opts.contactName) {
    await leadPage.fillContactName(opts.contactName);
    console.log(`  - Contact Name    : ${opts.contactName}`);
  }

  await leadPage.fillStreet('123street');
  console.log(`  - Street          : 123street`);

  await leadPage.selectCountry(opts.country);
  console.log(`  - Country         : ${opts.country}`);

  await leadPage.selectState(opts.state);
  console.log(`  - State           : ${opts.state}`);

  const teamCleared = await leadPage.clearSalesTeam();
  console.log(`  - Sales Team      : ${teamCleared ? 'Cleared' : 'Field not found, skipped'}`);

  const personCleared = await leadPage.clearSalesperson();
  console.log(`  - Salesperson     : ${personCleared ? 'Cleared' : 'Field not found, skipped'}`);

  if (opts.createdManually) {
    await leadPage.checkCreatedManually();
    console.log(`  - Created Manually: TRUE`);
  } else {
    await leadPage.uncheckCreatedManually();
    console.log(`  - Created Manually: FALSE`);
  }

  if (opts.tag) {
    await leadPage.addTag(opts.tag);
    console.log(`  - Tag             : ${opts.tag}`);
  }

  await leadPage.fillLeadForm(opts.leadForm);
  console.log(`  - Lead Form       : ${opts.leadForm === '' ? 'BLANK' : opts.leadForm}`);

  await leadPage.clickSave();
  await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);

  const id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
  const url = page.url();
  return { id, url };
}
