import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { LeadPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
  registerMigRecord,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Lead data verification - Invalid e-mail refused (manual path)
 * Test Case ID: CRM-12370_1.4.1
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Objective: Verify a manually created Lead cannot be saved with an e-mail containing a space
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the pre-production TC's
 * assertions, unchanged. Only the login account, the navigation path, the field NAMES (Studio field
 * -> O12 CE module field) and the poll durations are adapted. Where O12 CE behaves differently this
 * TC FAILS - that failure IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.1.19
 * (tests/1.Project_CRM/1.SalesReport_Performance/1.Lead). Section II ports the pre-production
 * Lead data-verification set to the O12 CE Migration server: the same business fact is verified,
 * against the O12 CE form and its own field names.
 *
 * O12 CE deviations vs the pre-production scenario (grounded on crm-mig over XML-RPC, 2026-09-17):
 *   - Login as Admin (`users.admin_crm_mig`) - the only account provisioned on the Migration server.
 *   - CRM > Leads is opened by URL hash (HomePageMig) because the Mig sidebar theme hides the navbar.
 *   - "Lead Form" is the O12 CE module field `lead_form` (CRM Developer tab); pre-production uses the Studio field `x_studio_lead_sorce`, which does NOT exist on crm-mig.
 *   - This TC keeps the pre-production expectation unchanged: the e-mail constraint is custom-module behaviour the migration is meant to carry over. If O12 CE does not raise "The email is invalid!", this TC fails and THAT failure is the migration finding - it must not be softened into a pass.
 *   - Nothing is created when the save is refused, so the teardown has nothing to delete; the afterAll sweep still runs.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Navigate to CRM > Leads.
 *   3. Click at "CREATE" button.
 *   4. Enter the lead information (Lead/Opportunity, Company Name, Contact Name, Email, Street, Country, State, Sales Team, Salesperson, Create manually = TRUE), with an e-mail containing a space.
 *   5. Click at "CRM Developer" tab at the bottom of page and set the Lead Form.
 *   6. Press "SAVE" button and read the Validation Error.
 *   7. Verifying the Lead is refused.
 *
 * Verification Points:
 *   1. The save raises the Validation Error "The email is invalid!".
 *   2. No Lead record is created (no id in the URL).
 *   3. The form stays in edit mode.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. Every record it makes
 * carries the marker "TEST CRM-12370_1.4.1 <timestamp>" so the afterAll sweep can find it again even when
 * the test dies mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_1\\.4\\.1:" --project=MigSmoke
 */

const TC = 'CRM-12370_1.4.1';

const SKIP_CLEANUP_LEAD = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken record for hand-debugging - the 16:00 leftover-data check then reports it.

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to the O12 CE Migration server',
  s2: 'Step 2: Navigating to CRM > Leads',
  s3: 'Step 3: Clicking CREATE and filling the Lead form',
  s4: 'Step 4: Saving the manually created Lead with an invalid e-mail',
  s5: 'Step 5: Verifying the Lead is refused',
};

test.describe(`${TC} - Invalid e-mail refused (manual path)`, () => {
  let leadUrl = '';

  test.beforeEach(async ({ context, page }) => {
    leadUrl = '';
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
    if (leadUrl) console.log(`Lead created by this run: ${leadUrl}`);
    await teardownMigRecords(page, SKIP_CLEANUP_LEAD);
  });

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never
  // got to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, TC);
  });

  test(`${TC}: Verify a manually created Lead cannot be saved with an e-mail containing a space`, async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const homePage = new HomePageMig(page);
    const leadPage = new LeadPage(page);

    const unique = `${Date.now()}`;
    const DATA = {
      opportunity: `TEST ${TC} ${unique}`,
      companyName: `TEST ${TC} Company ${unique}`,
      contactName: `Contact Name ${TC}`,
      email: `TEST Company@company${unique}.com`,
      street: '123street',
      country: 'United States',
      state: 'Texas',
      leadForm: 'Download Free Trial',
    };
    let leadId = '';

    // STEP.s1 - the helper prints its own banner and opens the Mig session.
    await loginToO12CE(page);

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await homePage.navigateToLeads();
      console.log('  OK - Leads list view opened');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await leadPage.clickCreate();
      await leadPage.waitForLeadFormToLoad();

      await leadPage.fillLeadOpportunity(DATA.opportunity);
      await leadPage.fillCompanyName(DATA.companyName);
      await leadPage.fillContactName(DATA.contactName);
      await leadPage.fillEmail(DATA.email);
      await leadPage.fillStreet(DATA.street);
      await leadPage.selectCountry(DATA.country);
      await leadPage.selectState(DATA.state);
      await leadPage.clearSalesTeam();
      await leadPage.clearSalesperson();
      await leadPage.checkCreatedManually();
      await leadPage.clickCRMDeveloperTab();
      await leadPage.fillLeadForm(DATA.leadForm);
      await leadPage.clickMainTabToExitCRMDeveloper();

      console.log(`  - Lead/Opportunity : ${DATA.opportunity}`);
      console.log(`  - Company Name     : ${DATA.companyName}`);
      console.log(`  - Contact Name     : ${DATA.contactName || '(left empty)'}`);
      console.log(`  - Email            : ${DATA.email}`);
      console.log(`  - Address          : ${DATA.street} / ${DATA.state || '(none)'} / ${DATA.country}`);
      console.log(`  - Lead Form        : ${DATA.leadForm}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await leadPage.clickSave();
      // No waitForSaveComplete here: the scenario expects the save to be REFUSED, so the form stays
      // in edit mode and a Validation Error dialog is raised instead of a record id appearing.
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      console.log(`  URL after SAVE : ${page.url()}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      const dialog = page.locator('.modal-content').first();
      const dialogShown = await dialog
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true)
        .catch(() => false);
      const dialogText = dialogShown
        ? ((await dialog.innerText({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) || '')
            .replace(/\s+/g, ' ')
            .trim()
        : '';
      const url = page.url();
      const savedId = url.match(/[?#&]id=(\d+)/);
      const stillEditable = await page.locator('.o_form_editable').count();
      console.log('==================== VERIFY ====================');
      console.log('  Create manually     : checked (TRUE)');
      console.log(`  e-mail used         : "${DATA.email}"`);
      console.log(`  dialog shown        : ${dialogShown}`);
      console.log(`  dialog text         : ${dialogText || '(none)'}`);
      console.log(`  URL after SAVE      : ${url}`);
      console.log(`  record id in URL    : ${savedId ? savedId[1] : '(none)'}`);
      console.log(`  form still editable : ${stillEditable > 0}`);
      console.log('===============================================');
      expect(dialogText, 'the save must raise the e-mail Validation Error').toContain(
        'The email is invalid!'
      );
      expect(savedId, 'no Lead record must be created').toBeNull();
      expect(stillEditable, 'the form must stay in edit mode').toBeGreaterThan(0);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Invalid e-mail refused (manual path)`);
    });
  });
});
