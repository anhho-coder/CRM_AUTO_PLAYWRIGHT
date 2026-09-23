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
 * O12 CE Main-Business Smoke - Contact screen verification - Action > Duplicate
 * Test Case ID: CRM-12370_3.2.9
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 *
 * Objective: Verify the Duplicate action of a Contact opens a copy of it in edit mode
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.3.11
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
 *   5. Running Action > Duplicate and verifying the copy that opens.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. The Contact it makes carries
 * the marker "TEST CRM-12370_3.2.9 <timestamp>" so the afterAll sweep can find it again even when the test dies
 * mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_3\\.2\\.9:" --project=MigSmoke
 */

const TC = 'CRM-12370_3.2.9';

const SKIP_CLEANUP_CONTACT = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken record for hand-debugging - the 16:00 leftover-data check then reports it.

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to the O12 CE Migration server',
  s2: 'Step 2: Navigating to Contacts',
  s3: 'Step 3: Clicking CREATE and filling the Contact form',
  s4: 'Step 4: Saving the Contact',
  s5: 'Step 5: Running Action > Duplicate and verifying the copy that opens',
};

test.describe(`${TC} - Action > Duplicate`, () => {
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

  test(`${TC}: Verify the Duplicate action of a Contact opens a copy of it in edit mode`, async ({ page }, testInfo) => {
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

      let __verifyPassed = false;
      try {
        expect(menuItems, 'the Action menu of a saved Contact offers Duplicate').toContain('Duplicate');
        expect(editable, 'Duplicate opens the copy in EDIT mode').toBe(true);
        expect(nameOnCopy, 'the Name the duplicated Contact carries').toContain(DATA.name);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Action > Duplicate`, passed: __verifyPassed }).catch(() => {});
      }
    });
  });
});
