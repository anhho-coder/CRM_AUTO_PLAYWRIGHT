import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Contact screen verification - MARK HOTSITE button
 * Test Case ID: TC.Performance.1.1.3.10
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.3\\.10:" --project=SalesReport_Performance
 *
 * Objective: Verify the MARK HOTSITE button asks for confirmation before it changes the Contact
 *
 * The spec creates its own fresh COMPANY Contact on pre-production, marked with the run token
 * <unique> (a timestamp) so the record can always be found again, then re-reads the saved form
 * and asserts the one aspect this test case owns.
 *
 * Expected values are GROUNDED on the live pre-production Contact form (2026-09-17).
 */

const TC = 'TC.Performance.1.1.3.10';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Navigating to Contacts',
  s3: 'Step 3: Clicking CREATE and filling the Contact form',
  s4: 'Step 4: Saving the Contact',
  s5: 'Step 5: Pressing MARK HOTSITE and verifying the confirmation dialog',
};

test.describe(`${TC} - MARK HOTSITE button`, () => {
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

  test(`${TC}: Verify the MARK HOTSITE button asks for confirmation before it changes the Contact`, async ({ page }) => {
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
      await contactPage.clickStatusbarButtonByName('action_enable_hot_site_concept');
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);

      const title = await contactPage.getDialogTitle();
      const buttons = await contactPage.getDialogButtons();
      const EXPECTED_BUTTONS = ['OK', 'CANCEL'];

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - MARK HOTSITE opens a confirmation dialog:');
      console.log(`     Expected : "Confirmation"`);
      console.log(`     Actual   : "${title}"`);
      console.log(`     Result   : ${title === 'Confirmation' ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the dialog lets the user confirm or back out:');
      console.log(`     Expected : ${EXPECTED_BUTTONS.join(' | ')}`);
      console.log(`     Actual   : ${buttons.join(' | ')}`);
      console.log(`     Result   : ${JSON.stringify(buttons) === JSON.stringify(EXPECTED_BUTTONS) ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log('OVERALL: MARK HOTSITE asks for confirmation before it changes anything');

      expect(title, 'the title of the dialog MARK HOTSITE opens').toBe('Confirmation');
      expect(buttons, 'the buttons of the MARK HOTSITE confirmation dialog').toEqual(EXPECTED_BUTTONS);

      // Leave the Contact exactly as it was found - the dialog is dismissed, never confirmed.
      await contactPage.cancelDialog();
      const headerAfter = await contactPage.getStatusbarButtons();
      console.log(`  After CANCEL the header still offers: ${headerAfter.join(' | ')}`);
      expect(headerAfter, 'the header buttons after the confirmation is dismissed').toContain('MARK HOTSITE');
    });
  });
});
