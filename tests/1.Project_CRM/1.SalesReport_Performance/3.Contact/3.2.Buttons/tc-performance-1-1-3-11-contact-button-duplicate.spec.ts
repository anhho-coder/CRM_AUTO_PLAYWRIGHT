import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Contact screen verification - Action > Duplicate
 * Test Case ID: TC.Performance.1.1.3.11
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.3\\.11:" --project=SalesReport_Performance
 *
 * Objective: Verify the Duplicate action of a Contact opens a copy of it in edit mode
 *
 * The spec creates its own fresh COMPANY Contact on pre-production, marked with the run token
 * <unique> (a timestamp) so the record can always be found again, then re-reads the saved form
 * and asserts the one aspect this test case owns.
 *
 * Expected values are GROUNDED on the live pre-production Contact form (2026-09-17).
 */

const TC = 'TC.Performance.1.1.3.11';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Navigating to Contacts',
  s3: 'Step 3: Clicking CREATE and filling the Contact form',
  s4: 'Step 4: Saving the Contact',
  s5: 'Step 5: Running Action > Duplicate and verifying the copy that opens',
};

test.describe(`${TC} - Action > Duplicate`, () => {
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

  test(`${TC}: Verify the Duplicate action of a Contact opens a copy of it in edit mode`, async ({ page }) => {
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
      await contactPage.clickFormActionMenu();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const menuItems = await contactPage.getOpenActionMenuOptionLabels();
      console.log(`  Action menu entries: ${menuItems.join(' | ')}`);
      await contactPage.clickOpenActionMenuOption('Duplicate');
      await page.waitForTimeout(CommonUtils.waitTimes.abnormalWait);

      const editable = await contactPage.isFormEditable();
      const nameOnCopy = await contactPage.getFieldDisplayValue('name');
      const carriesOriginal = nameOnCopy.includes(DATA.name);

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - the Action menu offers Duplicate:');
      console.log(`     Expected : the menu contains "Duplicate"`);
      console.log(`     Actual   : ${menuItems.join(' | ')}`);
      console.log(`     Result   : ${menuItems.includes('Duplicate') ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Duplicate opens the copy in EDIT mode:');
      console.log(`     Expected : true`);
      console.log(`     Actual   : ${editable}`);
      console.log(`     Result   : ${editable === true ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the copy carries the name of the Contact it was copied from:');
      console.log(`     Expected : a name containing "${DATA.name}"`);
      console.log(`     Actual   : "${nameOnCopy}"`);
      console.log(`     Result   : ${carriesOriginal ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log('OVERALL: Action > Duplicate opens a copy of the Contact in edit mode');

      expect(menuItems, 'the Action menu of a saved Contact offers Duplicate').toContain('Duplicate');
      expect(editable, 'Duplicate opens the copy in EDIT mode').toBe(true);
      expect(nameOnCopy, 'the Name the duplicated Contact carries').toContain(DATA.name);
    });
  });
});
