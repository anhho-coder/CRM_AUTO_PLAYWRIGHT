import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { ContactPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
  registerMigRecord,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Contact screen verification - Checkbox defaults
 * Test Case ID: CRM-12325_2.3.25
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 *
 * Objective: Verify the state of every checkbox of the Contact information area on a newly created Contact
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.3.25
 * (tests/1.Project_CRM/1.SalesReport_Performance/3.Contact). Section II ports the pre-production
 * Contact screen-verification set to the O12 CE Migration server: the same fact is verified, on the
 * O12 CE Contact form.
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Login as Admin (`users.admin_crm_mig`) - the only account provisioned on the Migration server.
 *   - Contacts is opened by URL hash (HomePageMig) because the Mig sidebar theme hides the navbar link.
 *   - The run marker is "TEST ..." instead of "AUTO ..." so the crm-mig leftover sweep finds the record
 *     again (the sweep matches name LIKE 'TEST' AND name LIKE '<TC id>').
 *   - Test timeout raised to config.timeouts.test (15 min): login + create + save costs ~6 min on crm-mig.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Navigate to the Contacts page.
 *   3. Click at "CREATE" button and enter the contact information.
 *   4. Press "SAVE" button.
 *   5. Verifying the checkbox states on the saved form.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. The Contact it makes carries
 * the marker "TEST CRM-12325_2.3.25 <timestamp>" so the afterAll sweep can find it again even when the test dies
 * mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\\.3\\.25:" --project=MigSmoke
 */

const TC = 'CRM-12325_2.3.25';

const SKIP_CLEANUP_CONTACT = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken record for hand-debugging - the 16:00 leftover-data check then reports it.

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to the O12 CE Migration server',
  s2: 'Step 2: Navigating to Contacts',
  s3: 'Step 3: Clicking CREATE and filling the Contact form',
  s4: 'Step 4: Saving the Contact',
  s5: 'Step 5: Verifying the checkbox states on the saved form',
};

test.describe(`${TC} - Checkbox defaults`, () => {
  let contactUrl = '';

  test.beforeEach(async ({ context, page }) => {
    contactUrl = '';
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    if (contactUrl) console.log(`Contact created by this run: ${contactUrl}`);
    await teardownMigRecords(page, SKIP_CLEANUP_CONTACT);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never
  // got to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, TC);
  });

  test(`${TC}: Verify the state of every checkbox of the Contact information area on a newly created Contact`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const homePage = new HomePageMig(page);
    const contactPage = new ContactPage(page);
    let contactId = '';

    const unique = `${Date.now()}`;
    const DATA = {
      name: `TEST ${TC} ${unique}`,
      email: `Test-Contact@company${unique}.com`,
      street: '123street',
      country: 'United States',
      state: 'Connecticut',
    };

    // STEP.s1 - loginToO12CE opens its own test.step and prints the matching banner.
    await loginToO12CE(page);

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await homePage.navigateToContacts();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
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
      console.log(`\n--- ${STEP.s4} ---`);
      await contactPage.clickSave();
      await contactPage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage);
      contactId = await contactPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage);
      // Queue it for the crm-mig teardown - this spec creates the Contact itself.
      registerMigRecord('res.partner', contactId, `Contact ${TC}`);
      contactUrl = page.url();
      console.log(`  Contact id  : ${contactId}`);
      console.log(`  Contact URL : ${contactUrl}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Contact saved on O12 CE`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
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

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Checkbox defaults`);
    });
  });
});
