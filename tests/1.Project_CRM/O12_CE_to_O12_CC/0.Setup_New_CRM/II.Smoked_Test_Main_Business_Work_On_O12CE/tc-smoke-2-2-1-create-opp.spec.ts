import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  O12CE_DATA,
  O12ceOpportunity,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Create a CRM Opportunity
 * Test Case ID: CRM-12325_2.2.1
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify a Salesperson can create a CRM Opportunity on the O12 CE Migration server
 *   (crm-mig.nakivo.site) - the Opp saves and the async Company/Contact partner creation completes.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.2.1 "Create Opp". Section II ports the
 * pre-prod main-business flow to O12 CE as a FUNCTIONAL smoke (elapsed times are printed for
 * reference; the gate is the business outcome).
 *
 * O12 CE deviations vs the pre-prod scenario (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`) - the only account provisioned on the Migration server.
 *   - CRM > Pipeline is opened directly in its LIST view by URL hash (action 185, view_type=list) -
 *     the Mig sidebar theme hides the navbar and the view-switcher path used on pre-prod.
 *   - "Lead Form" DOES exist on O12 CE as the module field `lead_form` (pre-prod: Studio field
 *     `x_studio_lead_sorce`); the page objects accept both names, so the value is entered normally.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Open "CRM" and switch to the Opportunities list view.
 *   3. On the "Opp" page, click at "CREATE" button.
 *   4. Enter the opportunity information (Opp name, Contact name, Email, Country = United States,
 *      State = Connecticut, Sales Team cleared, Salesperson cleared, Create manually = FALSE).
 *   5. Click at "CRM Developer" tab at the bottom of page (Lead form = License).
 *   6. Press "SAVE" button.
 *   7. Refresh page to see the "Contact" field is entered.
 *
 * Verification Points:
 *   1. The Opportunity is saved on O12 CE (a record id appears in the form URL).
 *   2. The async Company AND Contact partner fields are populated on the saved Opportunity.
 *   3. The saved Address keeps the entered State ("Connecticut").
 *   4. The saved "Lead Form" (CRM Developer tab) reads "License".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.2\.1:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.2.1 - O12 CE smoke: create a CRM Opportunity', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    console.log(`Teardown: SKIP_CLEANUP_OPP=${SKIP_CLEANUP_OPP} - the created Opportunity is kept on O12 CE`);
  });

  test('CRM-12325_2.2.1: Verify a CRM Opportunity can be created on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);

    const TC_ID = 'CRM-12325_2.2.1';
    let opp: O12ceOpportunity | null = null;
    let addressAfterSave = '';
    let salesTeamAfterSave = '';
    let salespersonAfterSave = '';
    const startedAt = Date.now();

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);

    await test.step('Read back the saved Opportunity fields', async () => {
      console.log('\n--- Read back the saved Opportunity ---');
      addressAfterSave = await opportunityPage.getAddressReadonly();
      salesTeamAfterSave = await opportunityPage.getSalesTeamValue().catch(() => '');
      salespersonAfterSave = await opportunityPage.getSalespersonValue().catch(() => '');
      console.log(`  Address     : "${addressAfterSave}"`);
      console.log(`  Sales Team  : "${salesTeamAfterSave}"`);
      console.log(`  Salesperson : "${salespersonAfterSave}"`);
    });

    await test.step('Verification', async () => {
      const savedOk = Number(opp?.oppId) > 0;
      const partnersOk = !!opp?.companyValue && !!opp?.contactValue;
      const stateOk = /Connecticut/i.test(addressAfterSave);
      const leadFormOk = (opp?.leadForm ?? '').includes(O12CE_DATA.leadForm);
      const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Opportunity is saved on O12 CE (record id in the form URL):');
      console.log('     Expected : record id > 0');
      console.log(`     Actual   : id=${opp?.oppId}`);
      console.log(`     Result   : ${savedOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The async Company AND Contact partner fields are populated:');
      console.log('     Expected : Company and Contact both non-empty');
      console.log(`     Actual   : Company="${opp?.companyValue}" | Contact="${opp?.contactValue}"`);
      console.log(`     Result   : ${partnersOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - The saved Address keeps the entered State:');
      console.log('     Expected : Address contains "Connecticut"');
      console.log(`     Actual   : "${addressAfterSave}"`);
      console.log(`     Result   : ${stateOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - The saved "Lead Form" (CRM Developer tab) reads "License":');
      console.log(`     Expected : ${O12CE_DATA.leadForm}`);
      console.log(`     Actual   : "${opp?.leadForm}"`);
      console.log(`     Result   : ${leadFormOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Sales Team / Salesperson after save (async routing may fill them later): "${salesTeamAfterSave}" / "${salespersonAfterSave}"`);
      console.log(`  Info - Total elapsed for the whole flow: ${totalSeconds}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${savedOk && partnersOk && stateOk && leadFormOk ? 'PASS' : 'FAIL'} - Opportunity creation on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Opportunity saved on O12 CE`);

      expect(savedOk, 'the Opportunity must be saved on O12 CE (a record id appears in the form URL)').toBeTruthy();
      expect(partnersOk, `the async Company/Contact creation must complete on O12 CE (Company="${opp?.companyValue}", Contact="${opp?.contactValue}")`).toBeTruthy();
      expect(stateOk, `the saved Opportunity must keep State = "Connecticut" (Address read back: "${addressAfterSave}")`).toBeTruthy();
      expect(leadFormOk, `the saved Opportunity must keep Lead Form = "${O12CE_DATA.leadForm}" (read back: "${opp?.leadForm}")`).toBeTruthy();
    });
  });
});
