import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * TEMPORARY evidence capture - NOT a test case.
 *
 * Produces the "Expected result" screenshots for the 11 Jira bugs raised from the crm-mig Lead
 * baseline run (CRM-12325_2.1.x), taken on PRE-PRODUCTION on the very records the baseline suite
 * (TC.Performance.1.1.1.x) created.
 *
 * READ-ONLY on pre-production except the last test, which fills a CREATE form with an invalid
 * e-mail so the Validation Error dialog can be captured - that save is REFUSED by the product, so
 * no record is created and there is nothing to clean up.
 *
 * One test per record: pre-production login + first navigation can take minutes, and a single test
 * holding all of them blew the 10-minute budget (measured 2026-09-18). The screenshot is taken
 * BEFORE any field reading, so a slow read can never cost us the evidence.
 *
 * Delete this file once the bugs are filed.
 *
 * Run:
 *   npx playwright test --grep "EVIDENCE-PREPROD" --project=SalesReport_Performance
 */

const OUT = 'evidence-preprod';

const RECORDS = [
  { id: 1094357, file: 'preprod-TC.1.1.1.27-28-lead-information-area-full-field-list' },
  { id: 1094341, file: 'preprod-TC.1.1.1.11-top-deal-checked' },
  { id: 1094353, file: 'preprod-TC.1.1.1.24-tag-applied-by-system' },
  { id: 1094355, file: 'preprod-TC.1.1.1.12-26-assignment-job-and-lead-source-nakivo' },
];

async function loginToPreprod(page: import('@playwright/test').Page) {
  const loginPage = new LoginPage(page);
  const t0 = Date.now();
  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog();
  console.log(`  login took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

test.describe('EVIDENCE-PREPROD - baseline screenshots for the crm-mig Lead bugs', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  for (const rec of RECORDS) {
    test(`EVIDENCE-PREPROD: lead ${rec.id} - ${rec.file}`, async ({ page }) => {
      test.setTimeout(config.timeouts.test);
      const leadPage = new LeadPage(page);

      await loginToPreprod(page);

      const t0 = Date.now();
      await page.goto(`${baseUrl}/web#id=${rec.id}&model=crm.lead&view_type=form`);
      // A hash-only change does not re-fetch the record on Odoo 12, so reload once.
      await page.reload({ waitUntil: 'domcontentloaded' });
      // NOT waitForLeadFormToLoad(): that helper waits for the EDIT-mode inputs, which a saved
      // record in readonly mode never shows - it spent >10 min on one record (measured 2026-09-18).
      // The information area is enough to know the form is painted.
      await page
        .locator('.o_form_sheet tr td.o_td_label')
        .first()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementVisibility })
        .catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log(`  record opened in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

      // Screenshot FIRST - the evidence must survive a slow read.
      await page.screenshot({ path: `${OUT}/${rec.file}.png`, fullPage: true });
      console.log(`  saved ${OUT}/${rec.file}.png`);

      const rows = await leadPage.getInformationAreaRows();
      console.log(`  left  (${rows.left.length}) : ${rows.left.map((r) => `${r.label}[${r.field}]`).join(', ')}`);
      console.log(`  right (${rows.right.length}) : ${rows.right.map((r) => `${r.label}[${r.field}]`).join(', ')}`);
      expect(rows.left.length + rows.right.length, 'the baseline form must render its fields').toBeGreaterThan(0);
    });
  }

  // The 13/15 baseline field list is the form AS THE TEST SEES IT RIGHT AFTER SAVE. Re-opening the
  // same record later renders a different set (measured on lead 1094357, unchanged since 17-Sep:
  // GDPR / Reseller contact / Followup Count appear, Lead Form / Timezone / Top Deal / Deal Elements
  // / IP disappear). So the Expected screenshot has to be taken in that same moment - this test
  // creates a Lead exactly as TC.Performance.1.1.1.27/.28 do and captures it immediately.
  test('EVIDENCE-PREPROD: freshly saved Lead - the 13/15 baseline layout (TC.Performance.1.1.1.27/.28)', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const unique = `${Date.now()}`;
    const DATA = {
      opportunity: `AUTO EVIDENCE baseline-layout ${unique}`,
      companyName: `TEST-Contact EVIDENCE ${unique}`,
      contactName: 'Contact Name EVIDENCE',
      email: `Test-Company@company${unique}.com`,
      street: '123street',
      country: 'United States',
      state: 'Texas',
      leadForm: 'Download Free Trial',
    };
    const OWNER = { team: 'CMR', salesperson: 'Sergio Yalovik' };

    await loginToPreprod(page);
    await homePage.navigateToCRM();
    await homePage.navigateToLeads();
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
    await leadPage.setTopDeal(true);
    await leadPage.clickCRMDeveloperTab();
    await leadPage.fillLeadForm(DATA.leadForm);
    await leadPage.clickMainTabToExitCRMDeveloper();
    await leadPage.clickSave();
    await leadPage.waitForRecordSaved();

    const url = page.url();
    console.log(`  pre-production Lead created: ${url}`);
    await page.screenshot({ path: `${OUT}/preprod-TC.1.1.1.27-28-baseline-layout-right-after-save.png`, fullPage: true });
    const rows = await leadPage.getInformationAreaRows();
    console.log(`  left  (${rows.left.length}) : ${rows.left.map((r) => `${r.label}[${r.field}]`).join(', ')}`);
    console.log(`  right (${rows.right.length}) : ${rows.right.map((r) => `${r.label}[${r.field}]`).join(', ')}`);
    expect(rows.left.length, 'the baseline left column must carry 13 rows').toBe(13);
    expect(rows.right.length, 'the baseline right column must carry 15 rows').toBe(15);
  });

  test('EVIDENCE-PREPROD: invalid e-mail refused (TC.Performance.1.1.1.19)', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const unique = `${Date.now()}`;

    await loginToPreprod(page);
    await homePage.navigateToCRM();
    await homePage.navigateToLeads();
    await leadPage.clickCreate();
    await leadPage.waitForLeadFormToLoad();
    await leadPage.fillLeadOpportunity(`EVIDENCE invalid email ${unique}`);
    await leadPage.fillCompanyName(`EVIDENCE Company ${unique}`);
    await leadPage.fillContactName('EVIDENCE Contact');
    await leadPage.fillEmail(`EVIDENCE Company@company${unique}.com`);
    await leadPage.checkCreatedManually();
    await leadPage.clickSave();

    const dialog = page.locator('.modal-content').first();
    const shown = await dialog
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true)
      .catch(() => false);
    // Capture before dismissing anything.
    await page.screenshot({ path: `${OUT}/preprod-TC.1.1.1.19-invalid-email-refused.png`, fullPage: true });
    const text = shown
      ? ((await dialog.innerText({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) || '')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
    console.log(`  dialog shown : ${shown}`);
    console.log(`  dialog text  : ${text}`);
    console.log(`  URL after SAVE (no record id expected): ${page.url()}`);
    expect(text, 'pre-production must refuse the invalid e-mail').toContain('The email is invalid!');
    expect(page.url(), 'no Lead may be created on the refused save').not.toMatch(/[?#&]id=\d+/);
  });
});
