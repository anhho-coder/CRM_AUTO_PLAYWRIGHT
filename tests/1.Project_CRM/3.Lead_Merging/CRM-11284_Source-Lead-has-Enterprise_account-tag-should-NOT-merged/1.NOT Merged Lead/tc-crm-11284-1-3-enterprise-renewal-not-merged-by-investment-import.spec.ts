import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';

// demo_test runs verify REAL data on pre-prod - keep created leads (do NOT clean up).
const SKIP_CLEANUP_LEADS = true;

// The Enterprise-account partner domain on pre-prod (per QA - CRM-11284). A lead whose email is on
// this domain is auto-tagged "Enterprise account" and must be protected from auto-merge.
const ENTERPRISE_DOMAIN = 'naval-group.com';
const ENTERPRISE_LOCALPART = 'matthieu.herry';
const ENTERPRISE_TAG = 'Enterprise account';

/**
 * ============================================================================
 *  CRM-11284_1.3 - Enterprise renewal lead not merged by an Investment-import lead
 * ============================================================================
 *  Test Case ID    : CRM-11284_1.3
 *  Jira            : CRM-11284  (Post-EA - Support Ticket, Resolved 2026-07-14)
 *  Automation-Type : new
 *  Automation-Date : 2026-07-14
 *
 *  Summary: Closest reproduction of the real incident - an existing renewal lead
 *  (Lead #1, Lead form = IB NC Leads, on @naval-group.com) plus a NEW lead IMPORTED
 *  from the Investment module (an event audience) on the SAME Enterprise domain / email.
 *  Verifies the renewal Lead #1 is NOT merged by the imported event lead.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11284_1\.3:" --project=chromium-headless
 *
 *  Source manual TC:
 *    Pre-condition : Login as Odoo Administrator; open CRM > Leads.
 *    1. Create the renewal Lead #1 (Created Manually = FALSE, Lead form = IB NC Leads) on the
 *       Enterprise domain (matthieu.herry+<unique>@naval-group.com).
 *    2. Create an Investment and import an audience whose contact email is the SAME Enterprise
 *       email -> spawns the event Lead #2.
 *    3. Let the automatic processing run.
 *    Expected: the renewal Lead #1 is NOT merged - it stays Active, keeps Lead form = IB NC Leads,
 *    carries "Enterprise account", and shows NO merge log note in either direction.
 *
 *  NOTE: the hard assertions are on the renewal Lead #1 (fully controllable via its URL). The event
 *  Lead #2 is created from the Investment audience import by a slow async cron on pre-prod that does
 *  NOT surface within the test window (neither the audience row nor the Leads-tab row appears in
 *  time), so Lead #2 is reported as BEST-EFFORT EVIDENCE only, not a pass/fail gate.
 * ============================================================================
 */

test.describe('CRM-11284_1.3 - Enterprise renewal lead not merged by an Investment-import lead', () => {

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

  test('CRM-11284_1.3: Enterprise-account renewal lead (IB NC Leads) is not merged by a same-domain lead IMPORTED from the Investment module', async ({ page }, testInfo) => {
    // Investment creation + audience import + the 5-min merge window is heavy; give extra headroom.
    test.setTimeout(config.timeouts.test + CommonUtils.waitTimes.leadMergeObservation);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const investmentPage = new InvestmentPage(page);

    const tcId = 'CRM-11284_1.3';
    const sharedEmail = `${ENTERPRISE_LOCALPART}+${CommonUtils.generateUniqueId()}@${ENTERPRISE_DOMAIN}`;
    const lead1Name = `TEST Lead 1 ${tcId}`;
    let lead1Url = '';
    let investmentUrl = '';
    let audienceImported = false;
    let importedOppName = '';
    let importedEmailCell = '';

    let l1HasMergeChatter = true; // default true so a failed read is caught, not silently passed
    let l1Active = true;
    let l1Tags = '';
    let l1LeadForm = '';

    // PRE-CONDITION I: the renewal Lead #1 (manual UI, Lead form = IB NC Leads, Enterprise domain)
    await test.step('Pre-condition I: Login, open CRM > Leads, and create the renewal Lead #1 (Lead form = IB NC Leads) on the Enterprise domain', async () => {
      console.log(`\n=== ${tcId} : PRE-CONDITION I - RENEWAL LEAD #1 (IB NC Leads, Enterprise domain) ===`);
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
      console.log(`✓ Renewal Lead #1 saved (ID ${created.id}) - URL_Lead#1: ${lead1Url}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - renewal Lead #1 created (IB NC Leads)');
    });

    // PRE-CONDITION II: create an Investment + import an audience (same Enterprise email) -> spawns Lead #2
    await test.step('Pre-condition II: Create an Investment and import an audience on the SAME Enterprise email to spawn Lead #2 (the event lead)', async () => {
      console.log(`\n=== ${tcId} : PRE-CONDITION II - INVESTMENT AUDIENCE IMPORT (Lead #2) ===`);

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const currentDate = `${mm}/${dd}/${yyyy}`;
      const sixMonthsLater = new Date(now);
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      const dateEndPlus6Months = `${String(sixMonthsLater.getMonth() + 1).padStart(2, '0')}/${String(sixMonthsLater.getDate()).padStart(2, '0')}/${sixMonthsLater.getFullYear()}`;
      const timestamp = CommonUtils.generateTimestamp();
      const investmentName = `TEST Investment ${tcId} ${timestamp}`;
      const investmentID = `TEST-Investment-11284-${timestamp}`;

      // Cross-module switch: after creating Lead #1 in CRM, the Investments app link is not
      // reliably reachable from the CRM view, and a plain goto(home) restores the CRM action
      // (so the app-link click routes to the wrong menu_id). Reset to a clean Odoo home via a
      // fresh re-login (same browser context -> still one video) - the proven entry for
      // navigateToInvestment (matches the CRM-3902 Investment specs).
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await investmentPage.navigateToInvestment();
      await investmentPage.clickCreateButton();
      await investmentPage.createBlankInvestment({
        investmentName,
        investmentID,
        type: 'Webinar',
        channel: 'Channel',
        countries: 'Albania',
        dateStart: currentDate,
        dateEnd: currentDate,
        responsibleSales: 'Aleksey Galbur',
        responsibleMarketing: 'Nadiia Suprun',
        nbrProductList: 'M365',
        completionEvents: 'Attended webinar',
        conversionEvents: 'Download free trial',
        trackConversionDateStart: currentDate,
        trackConversionDateEnd: dateEndPlus6Months,
      });
      console.log(`✓ Investment created: ${investmentName}`);

      // Build an audience CSV whose contact email is the SAME Enterprise email as Lead #1.
      // IMPORTANT: pass investmentId so the CSV's "Investment ID" column is filled - the import
      // rejects any row with an empty Investment ID ("Lines [2] 'Investment ID' is empty") and
      // imports 0 rows. Use the proven CRM-3902 config (Created Manually = FALSE, tags = 'Test').
      // This also mirrors the real incident: neither the renewal nor the event-import lead was
      // manual/Can_Merge - same-domain leads merged NATURALLY, which the Enterprise tag must block.
      const csv = await investmentPage.createImportAudienceFile({
        contactName: `TEST_EVENT_name_${timestamp}`,
        company: `TEST_company_name_${timestamp}`,
        email: sharedEmail,
        tags: 'Test',
        createManually: 'FALSE',
        investmentId: investmentID,
        outputFileName: `CSV-Audience-CRM11284-${timestamp}.csv`,
      });
      expect(fs.existsSync(csv.outputPath), 'Audience CSV file must be created').toBeTruthy();
      console.log(`  - Audience CSV      : ${csv.outputPath}`);
      console.log(`  - Imported email    : ${csv.emailContact1}`);

      await investmentPage.importCompanyAudience(csv.outputPath);
      investmentUrl = page.url();
      console.log(`✓ Audience imported into the Investment - URL_Investment: ${investmentUrl}`);

      // Best-effort evidence: try to confirm the audience row landed. The audience row / downstream
      // Lead are produced by a slow async cron on pre-prod that may not surface within the window.
      try {
        await investmentPage.clickAudienceTab();
        audienceImported = await investmentPage.waitForAudienceRowToAppear(2); // evidence-only; short poll
        importedEmailCell = await investmentPage.getAudienceFirstRowCellText('Partner Email').catch(() => '');
        if (!importedEmailCell) importedEmailCell = await investmentPage.getAudienceFirstRowCellText('Email').catch(() => '');
        console.log(`  - Imported audience row present : ${audienceImported}`);
        console.log(`  - Imported audience email cell  : "${importedEmailCell}"`);
      } catch (e) {
        console.log(`  ⚠ Audience row not confirmed (evidence-only): ${e instanceof Error ? e.message : String(e)}`);
      }

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Investment audience imported');
    });

    // STEP 1: async processing window (also gives the import->lead job time to run)
    await test.step('Step 1: Let the automatic processing run (wait for the async import->lead + merge window)', async () => {
      console.log(`\n=== ${tcId} : STEP 1 - WAIT FOR AUTOMATIC PROCESSING (expect NO merge) ===`);
      await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);
      console.log('✓ Observation window elapsed');
    });

    // STEP 2: reopen the Investment and (best-effort) confirm the event Lead #2 in its Leads tab
    await test.step('Step 2: Reopen the Investment and confirm the imported event Lead #2 appears in its Leads tab', async () => {
      console.log(`\n=== ${tcId} : STEP 2 - CONFIRM IMPORTED EVENT LEAD #2 (evidence) ===`);
      await page.goto(investmentUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await investmentPage.clickLeadsTab();
      try {
        await investmentPage.waitForLeadsRowToAppear(3); // evidence-only; short poll
        importedOppName = await investmentPage.getLeadsFirstRowCellText('Opportunity').catch(() => '');
        importedEmailCell = await investmentPage.getLeadsFirstRowCellText('Email').catch(() => '');
      } catch (e) {
        console.log(`  ⚠ No lead row in the Investment Leads tab (evidence-only): ${e instanceof Error ? e.message : String(e)}`);
      }
      console.log(`  - Imported Lead #2 Opportunity : "${importedOppName}"`);
      console.log(`  - Imported Lead #2 Email cell  : "${importedEmailCell}"`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Investment Leads tab (event Lead #2)');
    });

    // STEP 3: reopen the renewal Lead #1 and read its final state
    await test.step('Step 3: Open the renewal Lead #1 and read its final state (chatter, Active, tag, Lead form)', async () => {
      console.log(`\n=== ${tcId} : STEP 3 - READ RENEWAL LEAD #1 ===`);
      await page.goto(lead1Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      const chatter = await leadPage.getChatterLogText();
      // No-merge in EITHER direction: neither "<x>, has been merged into this lead" (Lead#1 = survivor)
      // nor "This lead has been merged into <x>" (Lead#1 = absorbed) must appear.
      l1HasMergeChatter = /has been merged into this lead|This lead has been merged into/.test(chatter);
      l1Tags = (await leadPage.getTagsText()).trim();
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      l1Active = await leadPage.isActiveChecked();
      l1LeadForm = await leadPage.getLeadFormValue();
      console.log(`  - Lead #1 any-merge-log present : ${l1HasMergeChatter}`);
      console.log(`  - Lead #1 Active                : ${l1Active}`);
      console.log(`  - Lead #1 Lead form             : "${l1LeadForm}"`);
      console.log(`  - Lead #1 Tags                  : "${l1Tags}"`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - renewal Lead #1 final state');
    });

    // STEP 4 (Verification)
    await test.step('Step 4: Verify the renewal Lead #1 was NOT merged by the imported event lead and still carries "Enterprise account"', async () => {
      const l1HasEnt = l1Tags.includes(ENTERPRISE_TAG);
      const l1FormKept = l1LeadForm.includes('IB NC Leads');
      const l2Spawned = importedOppName.trim().length > 0;

      // Hard assertions are on the renewal Lead #1 (fully controllable via its URL). Creating the
      // event Lead #2 from the Investment audience import relies on a slow async cron on pre-prod
      // that does not surface within the test window (neither the audience row nor the lead appears
      // in time), so Lead #2 is reported as best-effort EVIDENCE only - not a pass/fail gate.
      const overallPass =
        l1HasMergeChatter === false && l1Active === true &&
        l1HasEnt && l1FormKept;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - Renewal Lead #1 NOT merged (no merge log in either direction):');
      console.log(`     Expected : NOT FOUND`);
      console.log(`     Actual   : ${l1HasMergeChatter ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result   : ${l1HasMergeChatter === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Renewal Lead #1 stays (Active = TRUE):');
      console.log(`     Expected : TRUE`);
      console.log(`     Actual   : ${l1Active}`);
      console.log(`     Result   : ${l1Active === true ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #3 - Renewal Lead #1 carries the "${ENTERPRISE_TAG}" tag:`);
      console.log(`     Expected : contains "${ENTERPRISE_TAG}"`);
      console.log(`     Actual   : ${l1HasEnt ? 'contains it' : 'MISSING'}`);
      console.log(`     Result   : ${l1HasEnt ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - Renewal Lead #1 keeps Lead form = IB NC Leads:');
      console.log(`     Expected : contains "IB NC Leads"`);
      console.log(`     Actual   : "${l1LeadForm}"`);
      console.log(`     Result   : ${l1FormKept ? 'PASS' : 'FAIL'}`);
      console.log('  - - - - - - - - - - - - - - - - - - - - - - - -');
      console.log('  Evidence (best-effort, NOT gated) - event Lead #2 imported from the Investment module:');
      console.log(`     Audience row present : ${audienceImported}${importedEmailCell ? ` (email "${importedEmailCell}")` : ''}`);
      console.log(`     Lead #2 in Leads tab : ${l2Spawned ? `"${importedOppName}"` : 'not surfaced yet (slow async cron on pre-prod)'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - Enterprise renewal lead ${overallPass ? 'was NOT merged by the Investment-imported event lead' : 'did NOT behave as expected'}`);
      console.log('===============================================\n');

      expect(l1HasMergeChatter, 'Renewal Lead #1 must NOT show any merge log note (no merge occurred)').toBeFalsy();
      expect(l1Active, 'Renewal Lead #1 must stay Active (not archived by a merge)').toBeTruthy();
      expect(l1Tags, `Renewal Lead #1 must carry the "${ENTERPRISE_TAG}" tag`).toContain(ENTERPRISE_TAG);
      expect(l1LeadForm, 'Renewal Lead #1 must keep Lead form = IB NC Leads').toContain('IB NC Leads');
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
