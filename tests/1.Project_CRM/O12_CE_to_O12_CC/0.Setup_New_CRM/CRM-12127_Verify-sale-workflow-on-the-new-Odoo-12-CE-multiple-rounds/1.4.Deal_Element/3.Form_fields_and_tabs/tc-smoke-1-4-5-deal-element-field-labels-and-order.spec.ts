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
 * O12 CE Main-Business Smoke - Field names and order of the information area
 * Test Case ID: CRM-12370_1.4.5
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Summary:
 *   Verify the Deal Element information area carries exactly the 19 expected fields, with the
 *   expected captions and in the expected order (pre-production baseline).
 *
 * Source manual TC (pre-production): TC.Performance.1.1.4.5 "Deal Element field labels and order".
 *
 * O12 CE notes (grounded on crm-mig over XML-RPC, 2026-09-17):
 *   - The Deal Element form on O12 CE is the dedicated view `sale.order.deal.element.view.form`
 *     (id 2140, `create="false" delete="false"`) - the same view pre-production renders.
 *   - EXPECTED RED - `promotion_id` is CUT on O12 CE: the view carries the comment
 *     "promotion_ids/promotion_id were cut with the Enterprise coupon program (R4 external
 *     app)", so the form renders 18 labels where pre-production renders 19. This spec keeps
 *     the PRE-PRODUCTION baseline (19, Promotion included) and is therefore EXPECTED TO FAIL
 *     on O12 CE. Do NOT 'fix' it by dropping Promotion - the red IS the finding.
 *   - EXPECTED RED / VACUOUS GREEN - O12 CE does not render the label of an OPTIONAL field that is
 *     empty on the READONLY form: a saved Deal Element with no partners shows 12 labels, not 19
 *     (Distributor, Distributor contact, Reseller, Reseller contact, Confirmation Date and PO
 *     all drop out); EDIT mode renders them all. The spec keeps the pre-production read on the
 *     readonly form. NOTE the consequence: a check that an optional field IS EMPTY passes here
 *     because the widget is ABSENT, not because the value is empty - a VACUOUS green that this
 *     baseline deliberately accepts rather than adapt the read (run 2026-09-18-100823).
 *   - Data grounded on crm-mig: pricelist "Public Pricelist_USD (USD)" (id 2, USD), payment terms
 *     "Immediate Payment" (1) and "15 Days" (2), product "NAKIVO Backup ... Essentials" (28,
 *     UoM Socket, list price 329.00, no tax), company quotation validity = 30 days.
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
 *  12. Read every visible label of the information area, in form order.
 *
 * Verification Points:
 *   1. The information area carries exactly 19 labelled fields.
 *   2. Every label matches the expected caption, in the expected order.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.4\.5:" --project=MigSmoke
 */

const TC = 'CRM-12370_1.4.5';

// PRE-PRODUCTION BASELINE - the 19 labels of the information area, in form order, copied from
// TC.Performance.1.1.4.5. O12 CE renders neither "Promotion" (cut with the Enterprise coupon
// program) nor, on the readonly form, the labels of the optional fields that are empty. Both
// differences are left to FAIL this spec rather than be absorbed into it.
const EXPECTED_FIELD_LABELS = [
  'Payer',
  'Invoice Address',
  'Delivery Address',
  'End User',
  'Distributor',
  'Distributor contact',
  'Reseller',
  'Reseller contact',
  'Distributor Discount (%)',
  'Reseller Discount (%)',
  'Total in Company Currency',
  'Send mail',
  'Validity',
  'Confirmation Date',
  'Pricelist',
  'Payment Terms',
  'Online Payment',
  'Promotion',
  'PO',
];

const SKIP_CLEANUP_OPP = process.env.SKIP_CLEANUP_OPP === 'true'; // default false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Field names and order of the information area`, () => {

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
    if (SKIP_CLEANUP_OPP) {
      console.log('[mig-sweep] SKIPPED by SKIP_CLEANUP_OPP=true - records KEPT on O12 CE for hand-inspection.');
      return;
    }
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_1.4.5');
  });

  test('CRM-12370_1.4.5: Verify the field names and their order in the Deal Element information area', async ({ page }, testInfo) => {
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
      const labels = await dealElementPage.getVisibleFieldLabels();

      record('Number of labelled fields', EXPECTED_FIELD_LABELS.length, labels.length);
      EXPECTED_FIELD_LABELS.forEach((expected, i) => {
        record(`Field #${i + 1}`, expected, labels[i] === undefined ? '(missing)' : labels[i]);
      });
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Information area field labels`);

      expect(labels, 'the information area must carry exactly the expected fields, in order').toEqual(
        EXPECTED_FIELD_LABELS
      );
    });
  });
});
