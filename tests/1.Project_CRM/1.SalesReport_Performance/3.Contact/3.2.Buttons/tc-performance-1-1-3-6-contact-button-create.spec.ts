import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Contact screen verification - CREATE button
 * Test Case ID: TC.Performance.1.1.3.6
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.3\\.6:" --project=SalesReport_Performance
 *
 * Objective: Verify the CREATE button opens a blank Contact form
 *
 * The spec creates its own fresh COMPANY Contact on pre-production, marked with the run token
 * <unique> (a timestamp) so the record can always be found again, then re-reads the saved form
 * and asserts the one aspect this test case owns.
 *
 * Expected values are GROUNDED on the live pre-production Contact form (2026-09-17).
 */

const TC = 'TC.Performance.1.1.3.6';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Navigating to Contacts',
  s3: 'Step 3: Clicking CREATE and filling the Contact form',
  s4: 'Step 4: Saving the Contact',
  s5: 'Step 5: Pressing CREATE and verifying a blank Contact form opens',
};

test.describe(`${TC} - CREATE button`, () => {
  // Pre-production is the team's test bed and the specs in this folder keep the Contacts they
  // create (same convention as the Lead / Deal Element / Quotation siblings) - no teardown.
  let contactUrl = '';

  test.beforeEach(async ({ context }) => {
    contactUrl = '';
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
      await page
        .locator('.o_loading, .oe_loading, [class*="loading"]')
        .waitFor({ state: 'hidden', timeout: 5000 })
        .catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    }
    if (contactUrl) console.log(`Contact created by this run: ${contactUrl}`);
  });

  test(`${TC}: Verify the CREATE button opens a blank Contact form`, async ({ page }) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);

    const unique = `${Date.now()}`;
    const DATA = {
      name: `AUTO ${TC} ${unique}`,
      email: `Test-Contact@company${unique}.com`,
      street: '123street',
      country: 'United States',
      state: 'Connecticut',
    };

    await test.step(STEP.s1, async () => {
      console.log(STEP.s1);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
    });

    await test.step(STEP.s2, async () => {
      console.log(STEP.s2);
      await homePage.navigateToContacts();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    });

    await test.step(STEP.s3, async () => {
      console.log(STEP.s3);
      await contactPage.clickCreate();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      await contactPage.checkCompanyCheckbox();
      await contactPage.fillContactName(DATA.name);
      await contactPage.fillEmail(DATA.email);
      await contactPage.fillStreet(DATA.street);
      await contactPage.selectCountry(DATA.country);
      await contactPage.selectState(DATA.state);
      console.log(`  - Company type : Company`);
      console.log(`  - Contact Name : ${DATA.name}`);
      console.log(`  - Email        : ${DATA.email}`);
      console.log(`  - Address      : ${DATA.street} / ${DATA.state} / ${DATA.country}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(STEP.s4);
      await contactPage.clickSave();
      await contactPage.waitForSaveComplete();
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      contactUrl = page.url();
      console.log(`  Contact saved: ${contactUrl}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(STEP.s5);
      await contactPage.clickCreateOnFormView();
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);

      const editable = await contactPage.isFormEditable();
      const nameOnForm = await contactPage.getFieldDisplayValue('name');
      const emailOnForm = await contactPage.getFieldDisplayValue('email');
      const cp = await contactPage.getControlPanelButtons();
      const EXPECTED_CP = ['SAVE', 'DISCARD'];

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - CREATE opens a form in EDIT mode:');
      console.log(`     Expected : true`);
      console.log(`     Actual   : ${editable}`);
      console.log(`     Result   : ${editable === true ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the new form carries NO data from the Contact just saved:');
      console.log(`     Expected : Name = "" and Email = ""`);
      console.log(`     Actual   : Name = "${nameOnForm}" and Email = "${emailOnForm}"`);
      console.log(`     Result   : ${nameOnForm === '' && emailOnForm === '' ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the control panel of the new form:');
      console.log(`     Expected : ${EXPECTED_CP.join(' | ')}`);
      console.log(`     Actual   : ${cp.join(' | ')}`);
      console.log(`     Result   : ${JSON.stringify(cp) === JSON.stringify(EXPECTED_CP) ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log('OVERALL: CREATE opens a blank Contact form in edit mode');

      expect(editable, 'the CREATE button opens the Contact form in EDIT mode').toBe(true);
      expect(nameOnForm, 'the Name field of the blank CREATE form').toBe('');
      expect(emailOnForm, 'the Email field of the blank CREATE form').toBe('');
      expect(cp, 'the control-panel buttons of the blank CREATE form').toEqual(EXPECTED_CP);
    });
  });
});
