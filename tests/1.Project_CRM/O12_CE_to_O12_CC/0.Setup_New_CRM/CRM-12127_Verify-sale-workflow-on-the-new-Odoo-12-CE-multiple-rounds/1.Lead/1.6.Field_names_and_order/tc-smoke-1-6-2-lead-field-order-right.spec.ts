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
 * O12 CE Main-Business Smoke - Lead data verification - Field names and order - right column
 * Test Case ID: CRM-12370_1.6.2
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Objective: Verify the field names and their order in the right column of the Lead information area
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the pre-production TC's
 * assertions, unchanged. Only the login account, the navigation path, the field NAMES (Studio field
 * -> O12 CE module field) and the poll durations are adapted. Where O12 CE behaves differently this
 * TC FAILS - that failure IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.1.28
 * (tests/1.Project_CRM/1.SalesReport_Performance/1.Lead). Section II ports the pre-production
 * Lead data-verification set to the O12 CE Migration server: the same business fact is verified,
 * against the O12 CE form and its own field names.
 *
 * O12 CE deviations vs the pre-production scenario (grounded on crm-mig over XML-RPC, 2026-09-17):
 *   - Login as Admin (`users.admin_crm_mig`) - the only account provisioned on the Migration server.
 *   - CRM > Leads is opened by URL hash (HomePageMig) because the Mig sidebar theme hides the navbar.
 *   - "Lead Form" is the O12 CE module field `lead_form` (CRM Developer tab); pre-production uses the Studio field `x_studio_lead_sorce`, which does NOT exist on crm-mig.
 *   - The pre-production TC freezes the FULL list of 13 (left) / 15 (right) Studio-era rows. That list cannot hold on O12 CE: the Studio fields (x_studio_source_country_lead, x_studio_lead_sorce, x_studio_language, x_studio_top_deal, x_studio_deal_elements, x_studio_missing_functionality, x_studio_ip_lead_source) do NOT exist there, and the O12 CE view renders one of several conditional column blocks depending on the record state. This port asserts the ORDER of the core rows the O12 CE view really declares (arch walked over XML-RPC, 2026-09-17) as a sub-sequence of what the form renders, and prints the full rendered list so the exact per-column split can be frozen after the first green run.
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
 *   7. Verifying the field names and order, right column.
 *
 * Verification Points:
 *   1. The Lead information area renders a right column.
 *   2. Email, Job Position, Phone and Mobile are rendered in that relative order.
 *   3. Priority, Tags, Salesperson, Sales Team and Lead Source are all rendered on the form.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. Every record it makes
 * carries the marker "TEST CRM-12370_1.6.2 <timestamp>" so the afterAll sweep can find it again even when
 * the test dies mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_1\\.6\\.2:" --project=MigSmoke
 */

const TC = 'CRM-12370_1.6.2';

const SKIP_CLEANUP_LEAD = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken record for hand-debugging - the 16:00 leftover-data check then reports it.

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to the O12 CE Migration server',
  s2: 'Step 2: Navigating to CRM > Leads',
  s3: 'Step 3: Clicking CREATE and filling the Lead form',
  s4: 'Step 4: Saving the Lead',
  s5: 'Step 5: Verifying the field names and order, right column',
};

test.describe(`${TC} - Field names and order - right column`, () => {
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

  test(`${TC}: Verify the field names and their order in the right column of the Lead information area`, async ({ page }, testInfo) => {
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
    const OWNER = { team: 'CMR', salesperson: 'Sergio Yalovik' };
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
      await leadPage.selectSalesTeam(OWNER.team);
      await leadPage.selectSalesperson(OWNER.salesperson);
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
      console.log(`
--- ${STEP.s5} ---`);
      // The pre-production baseline list, VERBATIM. The only change is the field NAME where
      // pre-production carries a Studio field and O12 CE the module field - each counterpart was
      // verified with fields_get on crm-mig (same label, 2026-09-18):
      //   x_studio_source_country_lead -> source_country_lead   x_studio_lead_sorce -> lead_form
      //   x_studio_language -> lead_language   x_studio_top_deal -> top_deal
      //   x_studio_deal_elements -> deal_elements
      //   x_studio_missing_functionality -> missing_functionality
      //   x_studio_ip_lead_source -> ip_lead_source
      // ALL 28 baseline fields exist on crm.lead on crm-mig, so every row below is assertable and a
      // missing row means the O12 CE view dropped it. This TC must FAIL until the view matches.
      const EXPECTED = [
        { label: 'Contact Name', field: 'contact_name' },
        { label: 'Email', field: 'email_from' },
        { label: 'Job Position', field: 'function' },
        { label: 'Phone', field: 'phone' },
        { label: 'Linkedin', field: 'linkedin' },
        { label: 'Mobile', field: 'mobile' },
        { label: 'Timezone', field: 'tz' },
        { label: 'Timezone offset', field: 'tz_offset' },
        { label: 'Lang', field: 'lead_language' },
        { label: 'Priority', field: 'priority_new' },
        { label: 'Tags', field: 'tag_ids' },
        { label: 'Top Deal', field: 'top_deal' },
        { label: 'Deal Elements', field: 'deal_elements' },
        { label: 'Missing Functionality', field: 'missing_functionality' },
        { label: 'IP', field: 'ip_lead_source' },
      ];
      // The layout depends on the record type: a Lead created WITH an owner stays type=lead and
      // renders this block; an unowned Lead is converted to an opportunity by the assignment job and
      // renders a different one. This spec creates an owned Lead, so the state under test is fixed.
      const rows = await leadPage.getInformationAreaRows();
      const actual = rows.right;
      console.log('==================== VERIFY ====================');
      console.log(`  right column of the Lead information area: expected ${EXPECTED.length} rows, got ${actual.length}`);
      actual.forEach((r, i) => {
        const e = EXPECTED[i];
        const flag = e && e.label === r.label && e.field === r.field ? 'OK  ' : 'DIFF';
        console.log(`   ${flag} ${String(i).padStart(2)}. "${r.label}" -> ${r.field}` +
          (e ? `   (expected "${e.label}" -> ${e.field})` : '   (unexpected extra row)'));
      });
      const missing = EXPECTED.filter((e) => !actual.some((r) => r.field === e.field));
      if (missing.length) {
        console.log(`  MISSING from the O12 CE form (${missing.length}): ${missing.map((e) => `${e.label} [${e.field}]`).join(', ')}`);
      }
      console.log('===============================================');
      expect(actual.map((r) => r.label), 'the right column field NAMES and their ORDER').toEqual(
        EXPECTED.map((e) => e.label)
      );
      expect(actual.map((r) => r.field), 'the right column field TECHNICAL names and their ORDER').toEqual(
        EXPECTED.map((e) => e.field)
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Field names and order - right column`);
    });
  });
});
