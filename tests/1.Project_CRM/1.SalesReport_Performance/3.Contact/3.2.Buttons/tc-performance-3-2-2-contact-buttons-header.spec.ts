import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Contact screen verification - Header buttons
 * Test Case ID: TC.Performance.3.2.2
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.3\\.4:" --project=SalesReport_Performance
 *
 * Objective: Verify the number, the names and the order of the header buttons on a saved Contact
 *
 * The spec creates its own fresh COMPANY Contact on pre-production, marked with the run token
 * <unique> (a timestamp) so the record can always be found again, then re-reads the saved form
 * and asserts the one aspect this test case owns.
 *
 * Expected values are GROUNDED on the live pre-production Contact form (2026-09-17).
 */

const TC = 'TC.Performance.3.2.2';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Navigating to Contacts',
  s3: 'Step 3: Clicking CREATE and filling the Contact form',
  s4: 'Step 4: Saving the Contact',
  s5: 'Step 5: Verifying the header buttons of the saved Contact',
};

test.describe(`${TC} - Header buttons`, () => {
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

  test(`${TC}: Verify the number, the names and the order of the header buttons on a saved Contact`, async ({ page }) => {
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
      const EXPECTED = [
        { label: 'CREATE OPPORTUNITY', name: 'action_create_new_opportunity' },
        { label: 'MARK HOTSITE', name: 'action_enable_hot_site_concept' },
      ];
      const actual = await contactPage.getStatusbarButtonMap();

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - the header buttons a saved Contact offers:');
      console.log(`     Expected : ${EXPECTED.map((e) => e.label).join(' | ')}`);
      console.log(`     Actual   : ${actual.map((e) => e.label).join(' | ')}`);
      console.log(`     Result   : ${JSON.stringify(actual.map((e) => e.label)) === JSON.stringify(EXPECTED.map((e) => e.label)) ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the Odoo action each header button calls:');
      EXPECTED.forEach((e, i) => {
        console.log(`     ${i + 1}. "${e.label}" -> expected ${e.name} | actual ${actual[i] ? actual[i].name : '(missing)'}`);
      });
      console.log(`     Result   : ${JSON.stringify(actual.map((e) => e.name)) === JSON.stringify(EXPECTED.map((e) => e.name)) ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: the saved Contact offers ${actual.length} header buttons`);

      expect(actual.length, 'the NUMBER of header buttons on a saved Contact').toBe(EXPECTED.length);
      expect(actual.map((e) => e.label), 'the header button NAMES and their ORDER').toEqual(EXPECTED.map((e) => e.label));
      expect(actual.map((e) => e.name), 'the Odoo action each header button calls').toEqual(EXPECTED.map((e) => e.name));
    });
  });
});
