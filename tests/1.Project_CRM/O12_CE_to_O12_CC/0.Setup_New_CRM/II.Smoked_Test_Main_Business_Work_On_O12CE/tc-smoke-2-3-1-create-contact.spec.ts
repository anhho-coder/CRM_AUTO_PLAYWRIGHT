import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { ContactPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { loginToO12CE, O12CE_DATA } from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Create a Contact
 * Test Case ID: CRM-12325_2.3.1
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify a Company Contact can be created through the Contacts form on the O12 CE Migration server
 *   (crm-mig.nakivo.site) - the record saves and keeps the entered Name / Email / Address.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.3.1 "Create Contact". Section II ports it as
 * a FUNCTIONAL smoke (elapsed time printed for reference; the gate is the business outcome).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`); Contacts is opened in its LIST view by URL hash
 *     (menu 110 / action 159) because the Mig sidebar theme hides the sidebar menu link the base
 *     HomePage clicks.
 *   - This instance carries `nakivo_accounting`, so the partner form shows the Accounting fields.
 *     They are NOT a blocker: `res.partner.default_get` on crm-mig returns company defaults for both
 *     `property_account_receivable_id` (7) and `property_account_payable_id` (13), so the form saves
 *     without manual accounting input. (CRM-12325_1.4.1 used an RPC write-path for that reason; this
 *     TC deliberately exercises the real FORM.)
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Navigate to the Contacts page.
 *   3. Click at "CREATE" button.
 *   4. Enter the contact information:
 *      - Company type  = Company
 *      - Contact name  = TEST Contact + current date time
 *      - Email         = Test-Contact@company + current date time .com
 *      - Salesperson   = cleared
 *      - Sales Team    = cleared
 *      - Country       = United States
 *      - State         = Connecticut
 *   5. Press "SAVE" button.
 *
 * Verification Points:
 *   1. The Contact is saved on O12 CE (a record id appears in the form URL).
 *   2. The saved Name is the entered contact name.
 *   3. The saved Email is the entered email.
 *   4. The saved Address keeps the entered State ("Connecticut").
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.3\.1:" --project=chromium
 */

const SKIP_CLEANUP_CONTACT = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.3.1 - O12 CE smoke: create a Contact', () => {

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
    console.log(`Teardown: SKIP_CLEANUP_CONTACT=${SKIP_CLEANUP_CONTACT} - the created Contact is kept on O12 CE`);
  });

  test('CRM-12325_2.3.1: Verify a Contact can be created on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const homePage = new HomePageMig(page);
    const contactPage = new ContactPage(page);

    const TC_ID = 'CRM-12325_2.3.1';
    let contactName = '';
    let emailAddress = '';
    let contactId = '';
    let saveMs = 0;
    let nameReadback = '';
    let emailReadback = '';
    let addressReadback = '';

    await loginToO12CE(page);

    await test.step('Step 2: Navigate to the Contacts page', async () => {
      console.log('\n--- Step 2: Open Contacts (list view) ---');
      await homePage.navigateToContacts();
      console.log('  OK - Contacts list view opened');
    });

    await test.step('Step 3: Click at "CREATE" button', async () => {
      console.log('\n--- Step 3: Click CREATE ---');
      await contactPage.clickCreate();
      console.log('  OK - Contact creation form opened');
    });

    await test.step('Step 4: Enter the contact information', async () => {
      // Digits-only stamp in the DOMAIN: the NAKIVO email validator rejects an underscore there
      // (generateUniqueId() returns "<ms>_<rand>"), and the resulting modal blocks the SAVE click.
      contactName = `TEST Contact ${TC_ID} ${CommonUtils.generateUniqueId()}`;
      emailAddress = CommonUtils.generateContactEmail('Test-Contact', 'company');
      console.log('\n--- Step 4: Enter the contact information ---');
      console.log('  Company type : Company');
      console.log(`  Contact name : ${contactName}`);
      console.log(`  Email        : ${emailAddress}`);
      console.log(`  Country      : ${O12CE_DATA.country}`);
      console.log(`  State        : ${O12CE_DATA.state}`);

      await contactPage.checkCompanyCheckbox();
      await contactPage.fillContactName(contactName);
      await contactPage.fillEmail(emailAddress);
      const salespersonCleared = await contactPage.clearSalesperson();
      console.log(`  Salesperson cleared : ${salespersonCleared}`);
      const salesTeamCleared = await contactPage.clearSalesTeam();
      console.log(`  Sales Team cleared  : ${salesTeamCleared}`);
      await contactPage.selectCountry(O12CE_DATA.country);
      await contactPage.selectState(O12CE_DATA.state);
    });

    await test.step('Step 5: Press "SAVE" button', async () => {
      console.log('\n--- Step 5: Save the Contact ---');
      const start = Date.now();
      await contactPage.clickSave();
      await contactPage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage);
      contactId = await contactPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage);
      saveMs = Date.now() - start;
      console.log(`  Save elapsed : ${(saveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Contact id   : ${contactId}`);
      console.log(`  Contact URL  : ${page.url()}`);

      nameReadback = await contactPage.getContactNameReadonly();
      emailReadback = await contactPage.getEmailReadonly();
      addressReadback = await contactPage.getAddressReadonly();
      console.log(`  Name readback    : "${nameReadback}"`);
      console.log(`  Email readback   : "${emailReadback}"`);
      console.log(`  Address readback : "${addressReadback}"`);
    });

    await test.step('Verification', async () => {
      const savedOk = Number(contactId) > 0;
      const nameOk = nameReadback.includes(contactName);
      const emailOk = emailReadback.includes(emailAddress);
      const stateOk = /Connecticut/i.test(addressReadback);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Contact is saved on O12 CE (record id in the form URL):');
      console.log('     Expected : record id > 0');
      console.log(`     Actual   : id=${contactId}`);
      console.log(`     Result   : ${savedOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The saved Name is the entered contact name:');
      console.log(`     Expected : ${contactName}`);
      console.log(`     Actual   : "${nameReadback}"`);
      console.log(`     Result   : ${nameOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - The saved Email is the entered email:');
      console.log(`     Expected : ${emailAddress}`);
      console.log(`     Actual   : "${emailReadback}"`);
      console.log(`     Result   : ${emailOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - The saved Address keeps the entered State:');
      console.log('     Expected : Address contains "Connecticut"');
      console.log(`     Actual   : "${addressReadback}"`);
      console.log(`     Result   : ${stateOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Save elapsed: ${(saveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${savedOk && nameOk && emailOk && stateOk ? 'PASS' : 'FAIL'} - Contact creation on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Contact saved on O12 CE`);

      expect(savedOk, 'the Contact must be saved on O12 CE (a record id appears in the form URL)').toBeTruthy();
      expect(nameOk, `the saved Contact must keep Name = "${contactName}" (read back: "${nameReadback}")`).toBeTruthy();
      expect(emailOk, `the saved Contact must keep Email = "${emailAddress}" (read back: "${emailReadback}")`).toBeTruthy();
      expect(stateOk, `the saved Contact must keep State = "Connecticut" (Address read back: "${addressReadback}")`).toBeTruthy();
    });
  });
});
