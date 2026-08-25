import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { ContactPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { loginToO12CE, O12CE_DATA } from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Edit a Contact
 * Test Case ID: CRM-12325_2.3.2
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify a saved Contact can be edited on the O12 CE Migration server - changing the State from
 *   "Connecticut" to "CA (US)" is persisted after SAVE.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.3.2 "Edit Contact". Section II ports it as a
 * FUNCTIONAL smoke (elapsed time printed for reference; the gate is the persisted change).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`); Contacts opened in its LIST view by URL hash.
 *   - The partner form's Accounting fields default from the company (receivable 7 / payable 13), so
 *     the form saves without manual accounting input.
 *   - Both states exist on the Migration server: "Connecticut (US)" and "CA (US)".
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Navigate to the Contacts page.
 *   3. Click at "CREATE" button and create a new Company contact (name, email, Country = United
 *      States, State = Connecticut, Salesperson cleared, Sales Team cleared), then press "SAVE".
 *   4. Press "EDIT" button.
 *   5. Change the "State" field to "CA (US)".
 *   6. Press "SAVE" button.
 *
 * Verification Points:
 *   1. The Contact is saved on O12 CE (a record id appears in the form URL).
 *   2. After the edit + SAVE, the saved Address shows the State "CA".
 *   3. The Name is unchanged by the edit.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.3\.2:" --project=chromium
 */

const SKIP_CLEANUP_CONTACT = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.3.2 - O12 CE smoke: edit a Contact', () => {

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

  test('CRM-12325_2.3.2: Verify a Contact can be edited on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const homePage = new HomePageMig(page);
    const contactPage = new ContactPage(page);

    const TC_ID = 'CRM-12325_2.3.2';
    let contactName = '';
    let emailAddress = '';
    let contactId = '';
    let editSaveMs = 0;
    let nameReadback = '';
    let addressAfterEdit = '';

    await loginToO12CE(page);

    await test.step('Step 2: Navigate to the Contacts page', async () => {
      console.log('\n--- Step 2: Open Contacts (list view) ---');
      await homePage.navigateToContacts();
      console.log('  OK - Contacts list view opened');
    });

    await test.step('Step 3: Create a new Company contact and press "SAVE"', async () => {
      console.log('\n--- Step 3: Create the Contact under test ---');
      await contactPage.clickCreate();
      // Digits-only stamp in the DOMAIN: the NAKIVO email validator rejects an underscore there
      // (generateUniqueId() returns "<ms>_<rand>"), and the resulting modal blocks the SAVE click.
      contactName = `TEST Contact ${TC_ID} ${CommonUtils.generateUniqueId()}`;
      emailAddress = CommonUtils.generateContactEmail('Test-Contact', 'company');
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

      await contactPage.clickSave();
      await contactPage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage);
      contactId = await contactPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage);
      console.log(`  Contact id  : ${contactId}`);
      console.log(`  Contact URL : ${page.url()}`);
      expect(Number(contactId), 'the Contact must be saved on O12 CE before it can be edited').toBeGreaterThan(0);
    });

    await test.step('Step 4: Press "EDIT" button', async () => {
      console.log('\n--- Step 4: Click EDIT ---');
      await contactPage.clickEdit();
      console.log('  OK - form back in edit mode');
    });

    await test.step(`Step 5: Change the "State" field to "${O12CE_DATA.stateEdited}"`, async () => {
      console.log('\n--- Step 5: Change the State ---');
      console.log(`  From : ${O12CE_DATA.state}`);
      console.log(`  To   : ${O12CE_DATA.stateEdited}`);
      const stateSelected = await contactPage.selectState(O12CE_DATA.stateEdited);
      console.log(`  State re-selected: ${stateSelected}`);
    });

    await test.step('Step 6: Press "SAVE" button', async () => {
      console.log('\n--- Step 6: Save the edited Contact ---');
      const start = Date.now();
      await contactPage.clickSave();
      await contactPage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage);
      await contactPage.waitForEditButton(CommonUtils.waitTimes.savingPage);
      editSaveMs = Date.now() - start;
      nameReadback = await contactPage.getContactNameReadonly();
      addressAfterEdit = await contactPage.getAddressReadonly();
      console.log(`  Save elapsed       : ${(editSaveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Name readback      : "${nameReadback}"`);
      console.log(`  Address after edit : "${addressAfterEdit}"`);
    });

    await test.step('Verification', async () => {
      const savedOk = Number(contactId) > 0;
      const stateOk = /CA\s*\(US\)/i.test(addressAfterEdit);
      const nameOk = nameReadback.includes(contactName);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Contact is saved on O12 CE (record id in the form URL):');
      console.log('     Expected : record id > 0');
      console.log(`     Actual   : id=${contactId}`);
      console.log(`     Result   : ${savedOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - After the edit + SAVE the saved Address shows the State "CA":');
      console.log(`     Expected : Address contains "CA" (selected "${O12CE_DATA.stateEdited}")`);
      console.log(`     Actual   : "${addressAfterEdit}"`);
      console.log(`     Result   : ${stateOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - The Name is unchanged by the edit:');
      console.log(`     Expected : ${contactName}`);
      console.log(`     Actual   : "${nameReadback}"`);
      console.log(`     Result   : ${nameOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Save elapsed after edit: ${(editSaveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${savedOk && stateOk && nameOk ? 'PASS' : 'FAIL'} - Contact edit on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Contact edited on O12 CE`);

      expect(savedOk, 'the Contact must be saved on O12 CE (a record id appears in the form URL)').toBeTruthy();
      expect(stateOk, `the edited Contact must persist State = "${O12CE_DATA.stateEdited}" (Address read back: "${addressAfterEdit}")`).toBeTruthy();
      expect(nameOk, `the edit must not change the Contact Name (expected "${contactName}", read back "${nameReadback}")`).toBeTruthy();
    });
  });
});
