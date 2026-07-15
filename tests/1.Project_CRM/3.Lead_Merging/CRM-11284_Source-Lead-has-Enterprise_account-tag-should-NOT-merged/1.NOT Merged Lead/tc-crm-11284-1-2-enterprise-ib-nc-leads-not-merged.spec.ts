import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

// demo_test runs verify REAL data on pre-prod - keep created leads (do NOT clean up).
const SKIP_CLEANUP_LEADS = true;

// The Enterprise-account partner domain on pre-prod (per QA - CRM-11284). A lead whose email is on
// this domain is auto-tagged "Enterprise account" and must be protected from auto-merge.
const ENTERPRISE_DOMAIN = 'naval-group.com';
const ENTERPRISE_LOCALPART = 'matthieu.herry';
const ENTERPRISE_TAG = 'Enterprise account';

/**
 * ============================================================================
 *  CRM-11284_1.2 - Enterprise lead with Lead form = "IB NC Leads" is protected
 * ============================================================================
 *  Test Case ID    : CRM-11284_1.2
 *  Jira            : CRM-11284  (Post-EA - Support Ticket, Resolved 2026-07-14)
 *  Automation-Type : new
 *  Automation-Date : 2026-07-14
 *
 *  Summary: Variation of CRM-11284_1.1 where Lead #1 (the older/renewal lead) has
 *  Lead form = "IB NC Leads" (the merge-survivor role, per CRM-1992). Both leads are on
 *  the Enterprise-account domain (@naval-group.com). Verifies the pair still does NOT
 *  merge, both stay Active with the "Enterprise account" tag, and Lead #1 keeps its form.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11284_1\.2:" --project=chromium-headless
 *
 *  Source manual TC:
 *    Merge-eligibility recipe (see config/LEAD_MERGING_TEST_RULES.md), Enterprise domain:
 *      - Lead#1 (older, SURVIVOR): Created Manually = FALSE, Lead form = "IB NC Leads"
 *      - Lead#2 (newer, ABSORBED): Created Manually = TRUE, Tag = "Can_Merge", Lead form = BLANK
 *      - Both leads share the SAME email (matthieu.herry+<unique>@naval-group.com).
 *    Pre-condition : Login as Odoo Administrator; open CRM > Leads.
 *    1. Create the older lead (Lead #1) on the Enterprise domain with Lead form = IB NC Leads.
 *    2. Create a new lead (Lead #2) with the same Enterprise email (manual + Can_Merge).
 *    3. Let the automatic processing run.
 *    Expected:
 *       - Still NO merge (Enterprise protection): both Active = TRUE, no merge log on either.
 *       - Both carry the "Enterprise account" tag; Lead #1 keeps Lead form = IB NC Leads.
 * ============================================================================
 */

test.describe('CRM-11284_1.2 - Enterprise lead (IB NC Leads) is protected from auto-merge', () => {

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

  test('CRM-11284_1.2: Enterprise-account lead with Lead form = IB NC Leads is protected - leads do NOT auto-merge and both carry the "Enterprise account" tag', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);

    const tcId = 'CRM-11284_1.2';
    const sharedEmail = `${ENTERPRISE_LOCALPART}+${CommonUtils.generateUniqueId()}@${ENTERPRISE_DOMAIN}`;
    const lead1Name = `TEST Lead 1 ${tcId}`;
    const lead2Name = `TEST Lead 2 ${tcId}`;
    let lead1Url = '';
    let lead2Url = '';

    let l1Active = true, l2Active = true;
    let l1MergeMsg = false, l2MergeMsg = false;
    let l1Tags = '', l2Tags = '';
    let l1LeadForm = '';

    // PRE-CONDITION I: Lead #1 (older, Enterprise domain, non-manual, Lead form = IB NC Leads)
    await test.step('Pre-condition I: Login as Odoo Administrator, open CRM > Leads, and create Lead #1 (older) on the Enterprise domain with Lead form = IB NC Leads', async () => {
      console.log(`\n=== ${tcId} : PRE-CONDITION I - LEAD #1 (older, Enterprise domain, IB NC Leads) ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Logged in as ${users.admin_crm.displayName}`);

      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await homePage.navigateToLeads();
      console.log('✓ Navigated to CRM > Leads');

      console.log(`Shared Enterprise-domain email (Email_Lead#1): ${sharedEmail}`);
      const created = await createMergeEligibleLead(leadPage, page, {
        leadName: lead1Name,
        email: sharedEmail,
        companyName: 'Company Name Lead 1',
        country: 'Belgium',
        state: 'Flanders',
        createdManually: false,
        leadForm: 'IB NC Leads',
      });
      lead1Url = created.url;
      createdLeadUrls.push(lead1Url);
      console.log(`✓ Lead #1 saved (ID ${created.id}) - URL_Lead#1: ${lead1Url}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Lead #1 created (IB NC Leads, Enterprise domain)');
    });

    // PRE-CONDITION II: Lead #2 (newer, manual + Can_Merge + blank form, same Enterprise email)
    await test.step('Pre-condition II: Create a new lead (Lead #2) with the same Enterprise email (manual + Can_Merge + blank form)', async () => {
      console.log(`\n=== ${tcId} : PRE-CONDITION II - LEAD #2 (newer, manual + Can_Merge) ===`);
      const created = await createMergeEligibleLead(leadPage, page, {
        leadName: lead2Name,
        email: sharedEmail,
        companyName: 'Company Name Lead 2',
        contactName: 'Contact Name Lead 2',
        country: 'United States',
        state: 'Texas',
        createdManually: true,
        tag: 'Can_Merge',
        leadForm: '',
      });
      lead2Url = created.url;
      createdLeadUrls.push(lead2Url);
      console.log(`✓ Lead #2 saved (ID ${created.id}) - URL_Lead#2: ${lead2Url}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Lead #2 created (same Enterprise email)');
    });

    // STEP 1: async processing window
    await test.step('Step 1: Let the automatic processing run (wait for the async tag + merge window)', async () => {
      console.log(`\n=== ${tcId} : STEP 1 - WAIT FOR AUTOMATIC PROCESSING (expect NO merge) ===`);
      await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);
      console.log('✓ Observation window elapsed');
    });

    // STEP 2: read Lead #1 (survivor role)
    await test.step('Step 2: Open Lead #1 and read its final state (tag, Active, Lead form, merge log)', async () => {
      console.log(`\n=== ${tcId} : STEP 2 - READ LEAD #1 ===`);
      await page.goto(lead1Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      l1Tags = (await leadPage.getTagsText()).trim();
      l1MergeMsg = await leadPage.hasSourceLeadMergeMessage(lead2Name);
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      l1Active = await leadPage.isActiveChecked();
      l1LeadForm = await leadPage.getLeadFormValue();
      console.log(`  - Lead #1 Tags      : "${l1Tags}"`);
      console.log(`  - Lead #1 Active    : ${l1Active}`);
      console.log(`  - Lead #1 Lead form : "${l1LeadForm}"`);
      console.log(`  - Lead #1 merge-into-this-lead log present: ${l1MergeMsg}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Lead #1 final state');
    });

    // STEP 3: read Lead #2 (absorbed role)
    await test.step('Step 3: Open Lead #2 and read its final state (tag, Active, merge log)', async () => {
      console.log(`\n=== ${tcId} : STEP 3 - READ LEAD #2 ===`);
      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      l2Tags = (await leadPage.getTagsText()).trim();
      l2MergeMsg = await leadPage.hasTargetLeadMergeMessage(lead1Name);
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      l2Active = await leadPage.isActiveChecked();
      console.log(`  - Lead #2 Tags   : "${l2Tags}"`);
      console.log(`  - Lead #2 Active : ${l2Active}`);
      console.log(`  - Lead #2 merged-into-other log present: ${l2MergeMsg}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Lead #2 final state');
    });

    // STEP 4 (Verification)
    await test.step('Step 4: Verify both leads stay (no merge), both carry "Enterprise account", and Lead #1 keeps Lead form = IB NC Leads', async () => {
      const l1HasEnt = l1Tags.includes(ENTERPRISE_TAG);
      const l2HasEnt = l2Tags.includes(ENTERPRISE_TAG);
      const l1FormKept = l1LeadForm.includes('IB NC Leads');

      const overallPass =
        l1MergeMsg === false && l2MergeMsg === false &&
        l1Active === true && l2Active === true &&
        l1HasEnt && l2HasEnt && l1FormKept;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - Lead #1 NOT merged (no "merged into this lead" log):');
      console.log(`     Expected : NOT FOUND`);
      console.log(`     Actual   : ${l1MergeMsg ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result   : ${l1MergeMsg === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Lead #2 NOT merged (no "this lead has been merged into" log):');
      console.log(`     Expected : NOT FOUND`);
      console.log(`     Actual   : ${l2MergeMsg ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result   : ${l2MergeMsg === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Lead #1 stays (Active = TRUE):');
      console.log(`     Expected : TRUE`);
      console.log(`     Actual   : ${l1Active}`);
      console.log(`     Result   : ${l1Active === true ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - Lead #2 stays (Active = TRUE):');
      console.log(`     Expected : TRUE`);
      console.log(`     Actual   : ${l2Active}`);
      console.log(`     Result   : ${l2Active === true ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #5 - Lead #1 carries the "${ENTERPRISE_TAG}" tag:`);
      console.log(`     Expected : contains "${ENTERPRISE_TAG}"`);
      console.log(`     Actual   : ${l1HasEnt ? 'contains it' : 'MISSING'}`);
      console.log(`     Result   : ${l1HasEnt ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #6 - Lead #2 carries the "${ENTERPRISE_TAG}" tag:`);
      console.log(`     Expected : contains "${ENTERPRISE_TAG}"`);
      console.log(`     Actual   : ${l2HasEnt ? 'contains it' : 'MISSING'}`);
      console.log(`     Result   : ${l2HasEnt ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #7 - Lead #1 keeps Lead form = IB NC Leads:');
      console.log(`     Expected : contains "IB NC Leads"`);
      console.log(`     Actual   : "${l1LeadForm}"`);
      console.log(`     Result   : ${l1FormKept ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - Enterprise IB-NC-Leads lead ${overallPass ? 'was protected from auto-merge; both tagged "' + ENTERPRISE_TAG + '"' : 'did NOT behave as expected'}`);
      console.log('===============================================\n');

      expect(l1MergeMsg, 'Lead #1 must NOT show a "merged into this lead" log note').toBeFalsy();
      expect(l2MergeMsg, 'Lead #2 must NOT show a "this lead has been merged into" log note').toBeFalsy();
      expect(l1Active, 'Lead #1 must stay Active (not archived by a merge)').toBeTruthy();
      expect(l2Active, 'Lead #2 must stay Active (not archived by a merge)').toBeTruthy();
      expect(l1Tags, `Lead #1 must carry the "${ENTERPRISE_TAG}" tag`).toContain(ENTERPRISE_TAG);
      expect(l2Tags, `Lead #2 must carry the "${ENTERPRISE_TAG}" tag`).toContain(ENTERPRISE_TAG);
      expect(l1LeadForm, 'Lead #1 must keep Lead form = IB NC Leads').toContain('IB NC Leads');
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
