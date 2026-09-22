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
 * O12 CE Main-Business Smoke - Fields left empty on a created Deal Element
 * Test Case ID: CRM-12370_1.4.19
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Summary:
 *   Verify a Deal Element that has only been created (not confirmed, no promotion, no purchase
 *   order) leaves Confirmation Date, Promotion and PO empty.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.4.19 "Deal Element empty fields on creation".
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
 *  12. Read Confirmation Date, Promotion and PO back from the saved Deal Element.
 *
 * Verification Points:
 *   1. Confirmation Date is empty (the Deal Element was never confirmed).
 *   2. Promotion is empty (no promotion was applied).
 *   3. PO is empty (no customer purchase order was entered).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_1\.4\.19:" --project=MigSmoke
 */

const TC = 'CRM-12370_1.4.19';

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Empty fields on creation`, () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_1.4.19');
  });

  test('CRM-12370_1.4.19: Verify the fields a newly created Deal Element leaves empty', async ({ page }, testInfo) => {
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
      const confirmationDate = await dealElementPage.getFieldDisplayValue('confirmation_date');
      const promotion = await dealElementPage.getFieldDisplayValue('promotion_id');
      const purchaseOrder = await dealElementPage.getFieldDisplayValue('partner_purchase_order');

      record('Confirmation Date', '(empty)', confirmationDate === '' ? '(empty)' : confirmationDate);
      record('Promotion', '(empty)', promotion === '' ? '(empty)' : promotion);
      record('PO', '(empty)', purchaseOrder === '' ? '(empty)' : purchaseOrder);
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Empty fields on creation`);

      expect(confirmationDate, 'a Deal Element that was never confirmed has no Confirmation Date').toBe('');
      expect(promotion, 'no promotion was applied').toBe('');
      expect(purchaseOrder, 'no customer purchase order was entered').toBe('');
    });
  });
});
