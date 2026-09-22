import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Contact screen verification - Timezone derived from the Address
 * Test Case ID: TC.Performance.3.3.10
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.3\\.21:" --project=SalesReport_Performance
 *
 * Objective: Verify the Timezone of a Contact follows the Country and the State of its Address
 *
 * Product rule under test: the Timezone is NOT a free choice - Odoo derives it from the Country
 * and the State entered in the Address block. A Contact addressed in Connecticut, United States
 * is therefore stored on America/New_York even when the user picks another timezone on the form.
 *
 * The spec proves the rule the hard way: it deliberately picks Europe/London at creation and then
 * asserts the saved Contact reports America/New_York. A test that simply read the timezone back
 * would pass on a form that ignored the address entirely.
 *
 * The spec creates its own fresh COMPANY Contact on pre-production, marked with the run token
 * <unique> (a timestamp) so the record can always be found again, then re-reads the saved form
 * and asserts the one aspect this test case owns.
 *
 * Expected values are GROUNDED on the live pre-production Contact form (2026-09-17 / 2026-09-18).
 */

const TC = 'TC.Performance.3.3.10';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Navigating to Contacts',
  s3: 'Step 3: Clicking CREATE and filling the Contact form',
  s4: 'Step 4: Saving the Contact',
  s5: 'Step 5: Verifying the Timezone follows the Country and the State of the Address',
};

test.describe(`${TC} - Timezone derived from the Address`, () => {
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

  test(`${TC}: Verify the Timezone of a Contact follows the Country and the State of its Address`, async ({ page }) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);

    let timezoneOnFormAfterPick = '';
    const unique = `${Date.now()}`;
    const DATA = {
      name: `AUTO ${TC} ${unique}`,
      email: `Test-Contact@company${unique}.com`,
      street: '123street',
      country: 'United States',
      state: 'Connecticut',
      // Deliberately NOT the timezone of the address - the point of the test case.
      timezonePicked: 'Europe/London',
      // What Connecticut, United States resolves to.
      timezoneExpected: 'America/New_York',
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
      // verify:false on purpose - the address is expected to win over the pick, so the widget
      // reverting is the behaviour under test, not a failure to set the field.
      timezoneOnFormAfterPick = await contactPage.selectOptionByName('tz', DATA.timezonePicked, { verify: false });
      console.log(`  - Company type : Company`);
      console.log(`  - Contact Name : ${DATA.name}`);
      console.log(`  - Email        : ${DATA.email}`);
      console.log(`  - Address      : ${DATA.street} / ${DATA.state} / ${DATA.country}`);
      console.log(`  - Timezone     : picked "${DATA.timezonePicked}", form shows "${timezoneOnFormAfterPick}"`);
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
      const timezoneSaved = await contactPage.getFieldDisplayValue('tz');
      const addressBlock = await contactPage.getFieldRowTextByLabel('Address');
      const addressCarriesState = addressBlock.includes(DATA.state);
      const addressCarriesCountry = addressBlock.includes(DATA.country);

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - the Address the Timezone is derived from:');
      console.log(`     Expected : a block carrying "${DATA.state}" and "${DATA.country}"`);
      console.log(`     Actual   : "${addressBlock}"`);
      console.log(`     Result   : ${addressCarriesState && addressCarriesCountry ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the Timezone the saved Contact reports:');
      console.log(`     Expected : ${DATA.timezoneExpected}   (derived from ${DATA.state}, ${DATA.country})`);
      console.log(`     Actual   : ${timezoneSaved}`);
      console.log(`     Result   : ${timezoneSaved === DATA.timezoneExpected ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the Address wins over the Timezone picked on the form:');
      console.log(`     Expected : NOT "${DATA.timezonePicked}"`);
      console.log(`     Actual   : ${timezoneSaved}   (picked "${DATA.timezonePicked}" at creation)`);
      console.log(`     Result   : ${timezoneSaved !== DATA.timezonePicked ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(
        `OVERALL: the Address ${DATA.state}, ${DATA.country} puts the Contact on "${timezoneSaved}" ` +
          `although "${DATA.timezonePicked}" was picked on the form`
      );

      expect(addressBlock, 'the Address block carries the State the Timezone is derived from').toContain(DATA.state);
      expect(addressBlock, 'the Address block carries the Country the Timezone is derived from').toContain(DATA.country);
      expect(timezoneSaved, 'the Timezone the saved Contact reports, derived from its Country and State').toBe(
        DATA.timezoneExpected
      );
      expect(timezoneSaved, 'the Address wins over the Timezone picked on the form').not.toBe(DATA.timezonePicked);
    });
  });
});
