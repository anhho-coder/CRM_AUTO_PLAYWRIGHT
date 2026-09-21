import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Contact screen verification - Checkbox defaults
 * Test Case ID: TC.Performance.1.1.3.25
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.3\\.25:" --project=SalesReport_Performance
 *
 * Objective: Verify the state of every checkbox of the Contact information area on a newly created Contact
 *
 * The spec creates its own fresh COMPANY Contact on pre-production, marked with the run token
 * <unique> (a timestamp) so the record can always be found again, then re-reads the saved form
 * and asserts the one aspect this test case owns.
 *
 * Expected values are GROUNDED on the live pre-production Contact form (2026-09-17).
 */

const TC = 'TC.Performance.1.1.3.25';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Navigating to Contacts',
  s3: 'Step 3: Clicking CREATE and filling the Contact form',
  s4: 'Step 4: Saving the Contact',
  s5: 'Step 5: Verifying the checkbox states on the saved form',
};

test.describe(`${TC} - Checkbox defaults`, () => {
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

  test(`${TC}: Verify the state of every checkbox of the Contact information area on a newly created Contact`, async ({ page }) => {
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
      const EXPECTED: Array<{ label: string; field: string; checked: boolean }> = [
        { label: 'Send License Upfront', field: 'send_license_upfront', checked: false },
        { label: 'Is a Nakivo Customer', field: 'nakivo_customer', checked: false },
        { label: 'Certificate Required', field: 'certificate_required', checked: false },
        { label: 'Active MSP', field: 'x_studio_active_cspsp', checked: false },
        { label: 'Nakivo Logo On Website', field: 'nakivo_logo_on_website', checked: false },
        { label: 'Is created manually', field: 'is_create_manual', checked: true },
        { label: 'Show on website', field: 'show_on_website', checked: true },
      ];

      const actual: Array<{ label: string; field: string; checked: boolean | null }> = [];
      for (const e of EXPECTED) {
        actual.push({ label: e.label, field: e.field, checked: await contactPage.isFieldChecked(e.field) });
      }

      console.log('==================== VERIFY ====================');
      EXPECTED.forEach((e, i) => {
        const got = actual[i].checked;
        console.log(`  Verify #${i + 1} - ${e.label} (${e.field}):`);
        console.log(`     Expected : ${e.checked}`);
        console.log(`     Actual   : ${got === null ? 'FIELD NOT ON THE FORM' : got}`);
        console.log(`     Result   : ${got === e.checked ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      console.log('OVERALL: a Contact created by hand is flagged "Is created manually" and "Show on website"');

      expect(actual.map((a) => ({ field: a.field, checked: a.checked })),
        'the checkbox states of a newly created Contact').toEqual(
        EXPECTED.map((e) => ({ field: e.field, checked: e.checked })));
    });
  });
});
