import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { DealElementPage, OpportunityPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  registerMigRecordFromUrl,
  O12CE_DATA,
  O12ceOpportunity,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Validity date of the Deal Element
 * Test Case ID: CRM-12370_4.4.9
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Summary:
 *   Verify the Validity field is filled automatically and lands 30 days after the creation day, in
 *   MM/DD/YYYY.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.4.15 "Deal Element Validity date".
 *
 * O12 CE notes (grounded on crm-mig over XML-RPC, 2026-09-17):
 *   - The Deal Element form on O12 CE is the dedicated view `sale.order.deal.element.view.form`
 *     (id 2140, `create="false" delete="false"`) - the same view pre-production renders.
 *   - `validity_date` is not entered by the test - `default_get` on crm-mig returns creation day + 30
 *     (res.company 1 `quotation_validity_days` = 30; a DE created 2026-09-17 carries 2026-10-17).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Open "CRM" and switch to the Opportunities list view.
 *   3. On the "Opp" page, click at "CREATE" button.
 *   4. Enter the opportunity information (Country = United States, State = Connecticut, Sales Team and
 *      Salesperson cleared, "Create manually" FALSE).
 *   5. Click at "CRM Developer" tab at the bottom of page (Lead form = License).
 *   6. Press "SAVE" button.
 *   7. Refresh page to see the "Contact" field is entered.
 *   8. Create "DEAL ELEMENT" - press the "DEAL ELEMENT" button.
 *   9. On the "Deal Element" screen select Pricelist = Public Pricelist_USD and
 *      Payment Term = Immediate Payment.
 *  10. At "Order Lines" section - press "Add a product" and select the NAKIVO Backup product.
 *  11. Press "SAVE" button on the top page and wait for the saved (readonly) form.
 *  12. Read the Validity back from the saved Deal Element and compare it with today + 30 days.
 *
 * Verification Points:
 *   1. Validity is filled and formatted MM/DD/YYYY.
 *   2. Validity lands 30 days after today (29-31 accepted, so a run across midnight cannot flap).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_1\.4\.15:" --project=MigSmoke
 */

const TC = 'CRM-12370_4.4.9';

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Validity date`, () => {

  test.beforeEach(async ({ context, page }) => {
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
    await teardownMigRecords(page, SKIP_CLEANUP_OPP);
  });

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never
  // got to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_4.4.9');
  });

  test('CRM-12370_4.4.9: Verify the Validity date is filled automatically 30 days after the creation day', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const dealElementPage = new DealElementPage(page);
    const opportunityPage = new OpportunityPage(page);

    let opp: O12ceOpportunity | null = null;
    let dealElementUrl = '';

    // The VERIFY block printed before the expect()s, so a failing check still reaches stdout.
    const CHECKS: Array<{ what: string; expected: string; actual: string; pass: boolean }> = [];
    const record = (what: string, expected: unknown, actual: unknown, pass?: boolean) => {
      const expectedText = String(expected);
      const actualText = String(actual);
      CHECKS.push({
        what,
        expected: expectedText,
        actual: actualText,
        pass: pass === undefined ? expectedText === actualText : pass,
      });
    };
    const printVerify = () => {
      console.log('==================== VERIFY ====================');
      CHECKS.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.pass ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const passed = CHECKS.filter((c) => c.pass).length;
      console.log(
        `OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`
      );
    };

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC);
    const oppCompany = opp.companyValue;

    await addDealElementOnO12CE(page);
    dealElementUrl = page.url();
    registerMigRecordFromUrl(dealElementUrl, `Deal Element ${TC}`, 'sale.order');
    console.log(`  Deal Element saved: ${dealElementUrl}`);

    await test.step('Verification', async () => {
      const validity = await dealElementPage.getFieldDisplayValue('validity_date');
      const formatOk = /^\d{2}\/\d{2}\/\d{4}$/.test(validity);
      const today = new Date();
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const validityMidnight = new Date(validity).getTime();
      const daysAhead = Math.round((validityMidnight - todayMidnight) / 86400000);

      record('Validity format', 'MM/DD/YYYY', formatOk ? 'MM/DD/YYYY' : validity || '(empty)');
      record(
        'Days between today and Validity',
        '30 (29-31 accepted)',
        String(daysAhead),
        daysAhead >= 29 && daysAhead <= 31
      );
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Validity read back`);

      expect(formatOk, `the Validity date must be filled as MM/DD/YYYY, got "${validity}"`).toBe(true);
      expect(daysAhead, 'Validity defaults to 30 days ahead').toBeGreaterThanOrEqual(29);
      expect(daysAhead, 'Validity defaults to 30 days ahead').toBeLessThanOrEqual(31);
    });
  });
});
