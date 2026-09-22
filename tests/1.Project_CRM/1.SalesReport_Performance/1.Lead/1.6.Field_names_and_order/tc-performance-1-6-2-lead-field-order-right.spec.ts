import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead data verification - Field names and order - right column
 * Test Case ID: TC.Performance.1.6.2
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.1\\.28:" --project=SalesReport_Performance
 *
 * Objective: Verify the field names and their order in the right column of the Lead information area
 *
 * The spec creates its own fresh Lead on pre-production, marked with the run token
 * <unique> (a timestamp) so the record can always be found again, then re-reads the
 * saved form and asserts the one aspect this test case owns.
 */

const TC = 'TC.Performance.1.6.2';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Navigating to CRM > Leads',
  s3: 'Step 3: Clicking CREATE and filling the Lead form',
  s4: 'Step 4: Saving the Lead',
  s5: 'Step 5: Verifying the field names and order in the right column',
};

test.describe(`${TC} - Field names and order - right column`, () => {
  // Pre-production is the team's test bed and the specs in this folder keep the
  // Leads they create (same convention as the performance specs) - no teardown.
  let leadUrl = '';

  test.beforeEach(async ({ context }) => {
    leadUrl = '';
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
    if (leadUrl) console.log(`Lead created by this run: ${leadUrl}`);
  });

  test(`${TC}: Verify the field names and their order in the right column of the Lead information area`, async ({ page }) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);

    const unique = `${Date.now()}`;
    const DATA = {
      opportunity: `AUTO ${TC} ${unique}`,
      companyName: `TEST-Contact ${TC} ${unique}`,
      contactName: `Contact Name ${TC}`,
      email: `Test-Company@company${unique}.com`,
      street: '123street',
      country: 'United States',
      state: 'Texas',
      leadForm: 'Download Free Trial',
      leadSource: '',
    };
    // Proven-valid pair on pre-production; a Lead created WITH an owner keeps type=lead.
    const OWNER = { team: 'CMR', salesperson: 'Sergio Yalovik' };

    await test.step(STEP.s1, async () => {
      console.log(STEP.s1);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
    });

    await test.step(STEP.s2, async () => {
      console.log(STEP.s2);
      await homePage.navigateToCRM();
      await homePage.navigateToLeads();
    });

    await test.step(STEP.s3, async () => {
      console.log(STEP.s3);
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

      console.log(`  - Opportunity  : ${DATA.opportunity}`);
      console.log(`  - Company Name : ${DATA.companyName}`);
      console.log(`  - Contact Name : ${DATA.contactName || '(left empty)'}`);
      console.log(`  - Email        : ${DATA.email}`);
      console.log(`  - Address      : ${DATA.street} / ${DATA.state || '(none)'} / ${DATA.country}`);
      console.log(`  - Lead Form    : ${DATA.leadForm}`);
      console.log(`  - Lead Source  : ${DATA.leadSource || '(left empty)'}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(STEP.s4);
      await leadPage.clickSave();
      await leadPage.waitForRecordSaved();
      leadUrl = page.url();
      console.log(`  Lead saved: ${leadUrl}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(STEP.s5);
      const EXPECTED = [
        { label: 'Contact Name', field: 'contact_name' },
        { label: 'Email', field: 'email_from' },
        { label: 'Job Position', field: 'function' },
        { label: 'Phone', field: 'phone' },
        { label: 'Linkedin', field: 'linkedin' },
        { label: 'Mobile', field: 'mobile' },
        { label: 'Timezone', field: 'tz' },
        { label: 'Timezone offset', field: 'tz_offset' },
        { label: 'Lang', field: 'x_studio_language' },
        { label: 'Priority', field: 'priority_new' },
        { label: 'Tags', field: 'tag_ids' },
        { label: 'Top Deal', field: 'x_studio_top_deal' },
        { label: 'Deal Elements', field: 'x_studio_deal_elements' },
        { label: 'Missing Functionality', field: 'x_studio_missing_functionality' },
        { label: 'IP', field: 'x_studio_ip_lead_source' },
      ];
      // The layout depends on the record type: a Lead created WITH an owner stays
      // type=lead and renders this block; an unowned Lead is converted to an
      // opportunity by the assignment job and renders a different one. This spec
      // creates an owned Lead, so the state under test is fixed.
      const rows = await leadPage.getInformationAreaRows();
      const actual = rows.right;
      console.log('VERIFY - field names and order, right column of the Lead information area');
      console.log(`  expected ${EXPECTED.length} rows, got ${actual.length}`);
      actual.forEach((r, i) => {
        const e = EXPECTED[i];
        const flag = e && e.label === r.label && e.field === r.field ? 'OK  ' : 'DIFF';
        console.log(`   ${flag} ${String(i).padStart(2)}. "${r.label}" -> ${r.field}` +
          (e ? `   (expected "${e.label}" -> ${e.field})` : '   (unexpected extra row)'));
      });
      expect(actual.map((r) => r.label), 'the right column field NAMES and their ORDER').toEqual(
        EXPECTED.map((e) => e.label)
      );
      expect(actual.map((r) => r.field), 'the right column field TECHNICAL names and their ORDER').toEqual(
        EXPECTED.map((e) => e.field)
      );
    });
  });
});
