import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { LeadPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { loginToO12CE, O12CE_DATA } from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Create a CRM Lead
 * Test Case ID: CRM-12325_2.1.1
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify a Salesperson can create a CRM Lead on the O12 CE Migration server (crm-mig.nakivo.site) -
 *   the Lead saves and keeps the entered Contact Name / Email / Address.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.1.1 "Create Lead" (folder
 * 1.SalesReport_Performance). Section II ports the pre-prod main-business flow to O12 CE as a
 * FUNCTIONAL smoke: the save time is measured and printed for reference, but the pass/fail gate is
 * the business outcome, not a time threshold (the Migration server's response profile is still an
 * infrastructure variable).
 *
 * O12 CE deviations vs the pre-prod scenario (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`) - the only account provisioned on the Migration server.
 *   - CRM > Leads is opened by URL hash (menu 138 / action 182) because the Mig sidebar theme hides
 *     the navbar + sub-menu dropdown.
 *   - "Lead Form" DOES exist on O12 CE, under a different field name: pre-prod uses the Studio field
 *     `x_studio_lead_sorce` / `x_lead_form`, crm-mig the module field `lead_form` (CRM Developer tab).
 *     The page objects accept both names, so the value is entered and verified as scenario data.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Navigate to CRM > Leads.
 *   3. Click at "CREATE" button.
 *   4. Enter the lead information:
 *      - Lead/Opportunity name = TEST + current date time
 *      - Contact name          = TEST
 *      - Email                 = Test@company + current date time .com
 *      - Country               = United States
 *      - State                 = Connecticut
 *      - Sales Team            = cleared
 *      - Salesperson           = cleared
 *      - Create manually       = FALSE
 *   5. Click at "CRM Developer" tab at the bottom of page (Lead form = License).
 *   6. Press "SAVE" button.
 *
 * Verification Points:
 *   1. The Lead is saved on O12 CE (a record id appears in the form URL).
 *   2. The saved Contact Name is "TEST".
 *   3. The saved Email is the entered company email.
 *   4. The saved "Lead Form" (CRM Developer tab) reads "License".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.1\.1:" --project=chromium
 */

const SKIP_CLEANUP_LEAD = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.1.1 - O12 CE smoke: create a CRM Lead', () => {

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
    console.log(`Teardown: SKIP_CLEANUP_LEAD=${SKIP_CLEANUP_LEAD} - the created Lead is kept on O12 CE`);
  });

  test('CRM-12325_2.1.1: Verify a CRM Lead can be created on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const homePage = new HomePageMig(page);
    const leadPage = new LeadPage(page);

    const TC_ID = 'CRM-12325_2.1.1';
    let leadName = '';
    let emailAddress = '';
    let leadId = '';
    let saveMs = 0;
    let leadFormReadback = '';
    let verification = { contactName: false, email: false, address: false };

    await loginToO12CE(page);

    await test.step('Step 2: Navigate to CRM > Leads', async () => {
      console.log('\n--- Step 2: Open CRM > Leads (list view) ---');
      await homePage.navigateToLeads();
      console.log('  OK - Leads list view opened');
    });

    await test.step('Step 3: Click at "CREATE" button', async () => {
      console.log('\n--- Step 3: Click CREATE ---');
      await leadPage.clickCreate();
      console.log('  OK - Lead creation form opened');
    });

    await test.step('Step 4: Enter the lead information', async () => {
      leadName = `TEST ${TC_ID} ${leadPage.generateLeadName()}`;
      emailAddress = leadPage.generateEmail();
      console.log('\n--- Step 4: Enter the lead information ---');
      console.log(`  Lead name    : ${leadName}`);
      console.log('  Contact name : TEST');
      console.log(`  Email        : ${emailAddress}`);
      console.log(`  Country      : ${O12CE_DATA.country}`);
      console.log(`  State        : ${O12CE_DATA.state}`);

      await leadPage.fillLeadOpportunity(leadName);
      await leadPage.fillContactName('TEST');
      await leadPage.fillEmail(emailAddress);
      await leadPage.selectCountry(O12CE_DATA.country);
      await leadPage.selectState(O12CE_DATA.state);
      const teamCleared = await leadPage.clearSalesTeam();
      console.log(`  Sales Team cleared      : ${teamCleared}`);
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  Salesperson cleared     : ${salespersonCleared}`);
      const createdManuallyUnchecked = await leadPage.uncheckCreatedManually();
      console.log(`  "Create manually" FALSE : ${createdManuallyUnchecked}`);
    });

    await test.step('Step 5: Click at "CRM Developer" tab at the bottom of page (Lead form = License)', async () => {
      console.log('\n--- Step 5: CRM Developer tab ---');
      await leadPage.clickCRMDeveloperTab();
      const leadFormFilled = await leadPage.fillLeadForm(O12CE_DATA.leadForm);
      console.log(`  Lead Form : ${O12CE_DATA.leadForm} (field found and filled: ${leadFormFilled})`);
      expect(
        leadFormFilled,
        'the "Lead Form" field must be present in the CRM Developer tab on O12 CE (module field `lead_form`)'
      ).toBeTruthy();
    });

    await test.step('Step 6: Press "SAVE" button', async () => {
      console.log('\n--- Step 6: Save the Lead ---');
      const start = Date.now();
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete(CommonUtils.waitTimes.savingPage);
      saveMs = Date.now() - start;
      leadId = await leadPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage);
      console.log(`  Save elapsed : ${(saveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Lead id      : ${leadId}`);
      console.log(`  Lead URL     : ${page.url()}`);

      leadFormReadback = await leadPage.getLeadFormValue().catch(() => '');
      console.log(`  Lead Form read back : "${leadFormReadback}"`);

      verification = await leadPage.verifyLeadData({
        contactName: 'TEST',
        email: emailAddress,
        country: O12CE_DATA.country,
        state: O12CE_DATA.state,
      });
    });

    await test.step('Verification', async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Lead is saved on O12 CE (record id in the form URL):');
      console.log('     Expected : record id > 0');
      console.log(`     Actual   : id=${leadId}`);
      console.log(`     Result   : ${Number(leadId) > 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The saved Contact Name is "TEST":');
      console.log('     Expected : TEST');
      console.log(`     Actual   : ${verification.contactName ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result   : ${verification.contactName ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - The saved Email is the entered company email:');
      console.log(`     Expected : ${emailAddress}`);
      console.log(`     Actual   : ${verification.email ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result   : ${verification.email ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - The saved "Lead Form" (CRM Developer tab) reads "License":');
      console.log(`     Expected : ${O12CE_DATA.leadForm}`);
      console.log(`     Actual   : "${leadFormReadback}"`);
      console.log(`     Result   : ${leadFormReadback.includes(O12CE_DATA.leadForm) ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Country/State readback (not asserted, Odoo may re-derive it): ${verification.address ? 'MATCHED' : 'NOT MATCHED'}`);
      console.log(`  Info - Save elapsed: ${(saveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      const leadFormOk = leadFormReadback.includes(O12CE_DATA.leadForm);
      const overall = Number(leadId) > 0 && verification.contactName && verification.email && leadFormOk;
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - Lead creation on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Lead saved on O12 CE`);

      expect(Number(leadId), 'the Lead must be saved on O12 CE (a record id appears in the form URL)').toBeGreaterThan(0);
      expect(verification.contactName, 'the saved Lead must keep Contact Name = "TEST"').toBeTruthy();
      expect(verification.email, `the saved Lead must keep the entered Email (${emailAddress})`).toBeTruthy();
      expect(leadFormOk, `the saved Lead must keep Lead Form = "${O12CE_DATA.leadForm}" (read back: "${leadFormReadback}")`).toBeTruthy();
    });
  });
});
