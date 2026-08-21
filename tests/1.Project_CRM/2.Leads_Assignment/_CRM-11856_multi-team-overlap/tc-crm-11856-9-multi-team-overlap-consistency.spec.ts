import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Routing migration (CRM-11856) - Multi-team overlap CONSISTENCY experiment on the CURRENT app (O12 EE)
 * Test Case ID: CRM-11856_9.1 / CRM-11856_9.2
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Construct ONE lead per run that matches MORE THAN ONE team (Country = Vietnam + Nakivo Customer =
 *   TRUE + Activated Partner = TRUE -> matches BOTH "THD" and "Install Base"/IBSA). After the async
 *   assignment cron, read its Sales Team + Salesperson and print a parseable RESULT line. Run this
 *   test 5 times (--repeat-each=5); then read the 5 RESULT lines from the run output and TALLY whether
 *   Sales Team + Salesperson are CONSISTENT across the 5.
 *   NOTE (per request): OBSERVATION experiment - it does NOT assert a specific Sales Team / Salesperson
 *   value and does NOT fail if the 5 vary. EE shuffles the team order each run, so variation is the
 *   EXPECTED finding (Dev-confirmed in CRM-12157) - this run confirms it empirically.
 *     - CRM-11856_9.1 reading: each lead lands in one of the overlapping teams (THD or Install Base).
 *     - CRM-11856_9.2 reading: are the 5 identical leads assigned the SAME team/person, or do they vary?
 *
 * ONE lead per run (mirrors the proven THD assignment spec: navigate to Leads ONCE per fresh session -
 * avoids the unreliable between-leads re-navigation that hung the earlier multi-lead loop).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-11856_9\.1:" --project=chromium-headless --repeat-each=5
 *   (single canary: drop --repeat-each; tally by grepping the "RESULT |" lines in the run output)
 *
 * Pre-condition: VPN connected (pre-production.nakivo.site). Assignment is async (~15 min cron).
 */

const RUNS_HINT = 5;

test.describe('CRM-11856_9 - Multi-team overlap consistency (Current App O12 EE)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`WARNING Test failed - reason: ${testInfo.error?.message ?? 'unknown'}`);
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait });
      } catch (e) {
        console.log('  Timeout waiting for spinners, proceeding to screenshot anyway');
      }
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    }
  });

  test('CRM-11856_9.1: Multi-team overlap consistency (covers 9.1 + 9.2) - one constructed overlap lead per run', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.assignmentTestTimeout);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const runIndex = testInfo.repeatEachIndex; // 0-based; distinguishes the 5 repeats

    let leadName = '';
    let leadEmail = '';
    let leadId = '';
    let leadUrl = '';

    await test.step('Step 1: Login as admin_crm', async () => {
      console.log(`Step 1 (run ${runIndex}): Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
    });

    await test.step('Step 2: Open CRM module', async () => {
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    });

    await test.step('Step 3: Create ONE constructed multi-team overlap lead (Vietnam + Nakivo Customer + Activated Partner)', async () => {
      await homePage.navigateToLeads();
      await leadPage.clickCreate();

      leadName = CommonUtils.generateLeadNameWithTestCase(`CRM-11856_9-run${runIndex}`);
      leadEmail = CommonUtils.generateEmail('Test', 'company');

      await leadPage.fillLeadOpportunity(leadName);
      await leadPage.fillEmail(leadEmail);
      await leadPage.selectCountry('Vietnam');
      await leadPage.clearSalesTeam();
      await leadPage.clearSalesperson();
      await leadPage.uncheckCreatedManually();
      await leadPage.fillLeadForm('License');

      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      leadId = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      leadUrl = page.url();

      // Nakivo Customer + Activated Partner are only settable after the first save -> edit + set + save.
      // Set Nakivo Customer + Activated Partner ONLY (NOT Partner) so the lead matches BOTH THD
      // (SEA + customer-partner branch) AND Install Base/IBSA (customer, non-partner) - the overlap.
      await leadPage.clickEdit();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.short);
      await leadPage.checkNakivoCustomer();
      await leadPage.checkActivatedPartner();
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);

      console.log(`  Run ${runIndex}: created overlap lead ${leadId} (${leadName})`);
    });

    let salesTeam = '';
    let salesperson = '';
    await test.step('Step 4: Wait for the async assignment cron (up to 15 min), then read Sales Team + Salesperson', async () => {
      const result = await leadPage.waitForSalesTeamAssignment(
        CommonUtils.waitTimes.assignmentMaxWait,
        config.timeouts.salesTeamAssignment.checkInterval,
      );
      salesTeam = result.salesTeamValue || '';
      salesperson = result.salespersonValue || '';
      console.log(`  Run ${runIndex}: assignment window done in ${result.totalWaitTime}s (assigned=${result.salesTeamAssigned})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `CRM-11856_9 run ${runIndex} - lead ${leadId} assignment`);
    });

    // Machine-parseable line - grep "RESULT |" across the 5 repeats to tally consistency (9.1 / 9.2).
    console.log(`RESULT | run=${runIndex} | leadId=${leadId} | team="${salesTeam || '(unassigned)'}" | person="${salesperson || '(unassigned)'}"`);

    // Observation experiment: assert only that this run created + saved a lead (a real sanity check).
    // NO Sales Team / Salesperson value assertion, NO consistency assertion (per request).
    expect(leadId, 'Expected the overlap lead to be created + saved (id in URL)').toBeTruthy();
  });
});
