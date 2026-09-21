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
 * O12 CE Main-Business Smoke - Lead data verification - Tag applied by the system
 * Test Case ID: CRM-12325_2.1.24
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Objective: Verify the system tags a Lead from its Lead Form when the user chooses no tag
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the pre-production TC's
 * assertions, unchanged. Only the login account, the navigation path, the field NAMES (Studio field
 * -> O12 CE module field) and the poll durations are adapted. Where O12 CE behaves differently this
 * TC FAILS - that failure IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.1.24
 * (tests/1.Project_CRM/1.SalesReport_Performance/1.Lead). Section II ports the pre-production
 * Lead data-verification set to the O12 CE Migration server: the same business fact is verified,
 * against the O12 CE form and its own field names.
 *
 * O12 CE deviations vs the pre-production scenario (grounded on crm-mig over XML-RPC, 2026-09-17):
 *   - Login as Admin (`users.admin_crm_mig`) - the only account provisioned on the Migration server.
 *   - CRM > Leads is opened by URL hash (HomePageMig) because the Mig sidebar theme hides the navbar.
 *   - "Lead Form" is the O12 CE module field `lead_form` (CRM Developer tab); pre-production uses the Studio field `x_studio_lead_sorce`, which does NOT exist on crm-mig.
 *   - Grounded on crm-mig lead 879682: Lead Form "Download Free Trial" with no user-chosen tag ends with tag_ids = [763] = "Trial download" - the same derivation as pre-production.
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
 *   7. Verifying the tag applied by the system.
 *
 * Verification Points:
 *   1. The chatter logs "Tags CREATE changed" naming "Trial download".
 *   2. The saved Lead carries exactly the tag the system applied.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. Every record it makes
 * carries the marker "TEST CRM-12325_2.1.24 <timestamp>" so the afterAll sweep can find it again even when
 * the test dies mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\\.1\\.24:" --project=MigSmoke
 */

const TC = 'CRM-12325_2.1.24';

const SKIP_CLEANUP_LEAD = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken record for hand-debugging - the 16:00 leftover-data check then reports it.

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to the O12 CE Migration server',
  s2: 'Step 2: Navigating to CRM > Leads',
  s3: 'Step 3: Clicking CREATE and filling the Lead form',
  s4: 'Step 4: Saving the Lead',
  s5: 'Step 5: Verifying the tag applied by the system',
};

test.describe(`${TC} - Tag applied by the system`, () => {
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

  test(`${TC}: Verify the system tags a Lead from its Lead Form when the user chooses no tag`, async ({ page }, testInfo) => {
    // 15 min, not the 10-min default: login + create + save alone cost ~6 min on crm-mig, which
    // leaves a 10-min budget too thin for any polling step (measured 2026-09-17).
    test.setTimeout(config.timeouts.test);
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
      // The tag the Lead Form drives is applied by a queue job, and the "Tags CREATE changed" note
      // can be written BEFORE the tag itself lands (measured 2026-09-17: the note arrived with an
      // empty "New:" value). Poll the form before concluding, so a slow job is not reported as a
      // missing tag.
      // Cheap poll: a plain reload plus a short settle, NOT waitForLeadFormToLoad() - that helper
      // can spend up to 75 s per iteration on its spinner + interactivity waits and blew the whole
      // test budget on the first attempt (measured 2026-09-17).
      const TAG_POLL_MS = 90000;
      const tagDeadline = Date.now() + TAG_POLL_MS;
      let tags = await leadPage.getTagList();
      while (tags.length === 0 && Date.now() < tagDeadline) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(CommonUtils.waitTimes.medium);
        tags = await leadPage.getTagList();
      }
      // The note is written at save time, so it needs a short read, not the 5-minute default poll.
      const note = await leadPage.waitForChatterMessage('Tags CREATE changed', 60000);
      console.log('==================== VERIFY ====================');
      console.log(`  Lead Form : "${DATA.leadForm}"`);
      console.log('  Expected  : ["Trial download"]');
      console.log(`  Actual    : ${JSON.stringify(tags)}`);
      console.log(`  chatter note : ${note ? note.replace(/\n/g, ' | ') : '(none)'}`);
      console.log('===============================================');
      expect(note, 'the system must log the tag it applies').not.toBeNull();
      expect(note as string, 'the log note must name the applied tag').toContain('New: Trial download');
      expect(tags, 'the Lead Form must drive exactly the Trial download tag').toEqual(['Trial download']);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Tag applied by the system`);
    });
  });
});
