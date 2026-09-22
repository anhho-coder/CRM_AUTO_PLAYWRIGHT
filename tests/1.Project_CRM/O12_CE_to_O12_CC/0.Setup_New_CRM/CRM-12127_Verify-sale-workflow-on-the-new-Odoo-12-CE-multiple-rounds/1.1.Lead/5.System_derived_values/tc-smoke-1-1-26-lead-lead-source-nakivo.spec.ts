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
 * O12 CE Main-Business Smoke - Lead data verification - Lead Source - Nakivo (Lead created without an owner)
 * Test Case ID: CRM-12370_1.1.26
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Objective: Verify a Lead created without an owner is never classified Partner and reads Nakivo once the job has run
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the pre-production TC's
 * assertions, unchanged. Only the login account, the navigation path, the field NAMES (Studio field
 * -> O12 CE module field) and the poll durations are adapted. Where O12 CE behaves differently this
 * TC FAILS - that failure IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.1.26
 * (tests/1.Project_CRM/1.SalesReport_Performance/1.Lead). Section II ports the pre-production
 * Lead data-verification set to the O12 CE Migration server: the same business fact is verified,
 * against the O12 CE form and its own field names.
 *
 * O12 CE deviations vs the pre-production scenario (grounded on crm-mig over XML-RPC, 2026-09-17):
 *   - Login as Admin (`users.admin_crm_mig`) - the only account provisioned on the Migration server.
 *   - CRM > Leads is opened by URL hash (HomePageMig) because the Mig sidebar theme hides the navbar.
 *   - "Lead Form" is the O12 CE module field `lead_form` (CRM Developer tab); pre-production uses the Studio field `x_studio_lead_sorce`, which does NOT exist on crm-mig.
 *   - The derivation itself is alive on crm-mig - 1,786 leads created since 01-Jun-2026 carry lead_source = "nakivo" and 1,837 "partner". What a smoke run cannot guarantee is the TIMING: the O12 CE assignment crons run every 2-4 hours (ir.cron 192 / 195), so the value may still be empty when the test ends. The TC asserts the invariant that holds either way - an unowned Lead is never "Partner" - and reports which branch the run saw.
 *   - Pre-production additionally asserts the assignment job filled the Sales Team and Salesperson and logged the change; on O12 CE those belong to the assignment suite, not to this smoke.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Navigate to CRM > Leads.
 *   3. Click at "CREATE" button.
 *   4. Enter the lead information (Lead/Opportunity, Company Name, Contact Name, Email, Street, Country, State, Sales Team, Salesperson, Create manually).
 *   5. Click at "CRM Developer" tab at the bottom of page and set the Lead Form.
 *   6. Press "SAVE" button.
 *   7. Verifying the Lead Source derived for a Lead created without an owner.
 *
 * Verification Points:
 *   1. The unowned Lead is saved.
 *   2. Its Lead Source is never "Partner".
 *   3. Its Lead Source is either empty (job not run yet) or exactly "Nakivo".
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. Every record it makes
 * carries the marker "TEST CRM-12370_1.1.26 <timestamp>" so the afterAll sweep can find it again even when
 * the test dies mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_1\\.1\\.26:" --project=MigSmoke
 */

const TC = 'CRM-12370_1.1.26';

const SKIP_CLEANUP_LEAD = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken record for hand-debugging - the 16:00 leftover-data check then reports it.

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to the O12 CE Migration server',
  s2: 'Step 2: Navigating to CRM > Leads',
  s3: 'Step 3: Clicking CREATE and filling the Lead form',
  s4: 'Step 4: Saving the Lead',
  s5: 'Step 5: Verifying the Lead Source derived for a Lead created without an owner',
};

test.describe(`${TC} - Lead Source - Nakivo (Lead created without an owner)`, () => {
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

  test(`${TC}: Verify a Lead created without an owner is never classified Partner and reads Nakivo once the job has run`, async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const homePage = new HomePageMig(page);
    const leadPage = new LeadPage(page);

    const unique = `${Date.now()}`;
    const DATA = {
      opportunity: `TEST ${TC} ${unique}`,
      companyName: `TEST ${TC} Company ${unique}`,
      contactName: `Contact Name ${TC}`,
      email: `test-company@company${unique}.com`,
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
      await leadPage.uncheckCreatedManually();
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
      await leadPage.waitForSaveComplete(CommonUtils.waitTimes.savingPage);
      leadId = await leadPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage);
      // Queue it for the crm-mig teardown - this spec creates the Lead itself, not via the chain helper.
      registerMigRecord('crm.lead', leadId, `Lead ${TC}`);
      leadUrl = page.url();
      console.log(`  Lead id  : ${leadId}`);
      console.log(`  Lead URL : ${leadUrl}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      // Poll duration is the only adaptation (wall-clock): 3 min instead of 8.
      const DERIVATION_POLL_MS = 180000;
      const leadSource = await leadPage.waitForFieldValue('lead_source', 'Nakivo', DERIVATION_POLL_MS);
      const note = await leadPage.findChatterMessage(/^Sales Team:/);
      const salesTeam = await leadPage.readFieldValue('team_id');
      const salesperson = await leadPage.readFieldValue('user_id');
      console.log('==================== VERIFY ====================');
      console.log(`  Sales Team assigned  : "${salesTeam}"`);
      console.log(`  Salesperson assigned : "${salesperson}"`);
      console.log(`  Lead Source          : expected "Nakivo" | actual "${leadSource}"`);
      console.log(`  assignment note      : ${note ? note.replace(/\n/g, ' | ') : '(none)'}`);
      console.log('===============================================');
      expect(salesTeam, 'the assignment job must fill the Sales Team').not.toBe('');
      expect(salesperson, 'the assignment job must fill the Salesperson').not.toBe('');
      expect(leadSource, 'an unowned Lead must be classified Nakivo').toBe('Nakivo');
      expect(note, 'the assignment job must log what it wrote').not.toBeNull();
      const noteFields = leadPage.parseLogNoteFields(note as string);
      expect(
        leadPage.splitTrackedChange(noteFields['Lead Source']).to,
        'the logged Lead Source must be Nakivo'
      ).toBe('Nakivo');

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Lead Source - Nakivo (Lead created without an owner)`);
    });
  });
});
