import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { InvoicePage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  confirmQuotationOnO12CE,
  createInvoiceOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Invoice Lines - column names and order
 * Test Case ID: CRM-12370_6.5.1
 * Automation-Type: ported
 * Automation-Date: 2026-09-22
 *
 * Summary:
 *   Verify the Invoice Lines list carries the thirteen documented columns, in the documented order,
 *   Partner Discount and Partner Discount Amount among them.
 *
 * Source manual TC (pre-production): TC.Performance.6.5.1 "Invoice Invoice Lines - The name, the
 * number and the order of the Invoice Lines columns". Section II ports it to the O12 CE Migration
 * server as a FUNCTIONAL test that verifies the same Invoice Lines structure.
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`) - the pre-prod owner of
 *     this chain; Opportunities list opened in list view by URL hash.
 *   - The setup chain (steps 1-14) is driven by helper functions instead of pre-prod page objects.
 *   - The run marker is "TEST ..." instead of "AUTO ..." so the crm-mig leftover sweep finds the record
 *     again (the sweep matches name LIKE 'TEST' AND name LIKE '<TC id>').
 *   - Test timeout raised to config.timeouts.test (15 min): the chain costs ~6 min on crm-mig.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in
 *   (CRM-12325_1.1.1).
 *
 * Steps (1-14 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *  13. Press "CONFIRM" button and wait to create a Sales Order.
 *  14. On the "Sales Order" screen, press "CREATE INVOICE" button and wait.
 *
 * Steps run:
 *  15. On the "Invoice Order" window, press "CREATE AND VIEW INVOICES" button.
 *  16. Read the column headers of the "Invoice Lines" tab, left to right.
 *
 * Verification:
 *   - The Invoice Lines list carries exactly 13 named columns.
 *   - They read Product, Start Date, End Date, Quantity, Unit of Measure, Price, Special Discount
 *     (%), Special Discount Amount, Partner Discount, Partner Discount Amount, Subtotal After All
 *     Discounts, Booked value (company currency), Subtotal in that order.
 *   - The list carries a Partner Discount column and a Partner Discount Amount column.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. The Opportunity it makes
 * carries the marker "TEST CRM-12370_6.5.1 <timestamp>" so the afterAll sweep can find it again even
 * when the test dies mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\\.5\\.1:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

const STEP = {
  chain: 'Steps 1-14: Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice',
  read: 'Step 15-16: Read the Invoice Lines columns',
  verify: 'Verification: The Invoice Lines columns match the documented list',
} as const;

test.describe('CRM-12370_6.5.1 - O12 CE smoke: Invoice Lines - column names and order', () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.5.1');
  });

  test('CRM-12370_6.5.1: Verify the name, the number and the order of the Invoice Lines columns', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.5.1';
    const invoicePage = new InvoicePage(page);
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;

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

    await test.step(STEP.chain, async () => {
      console.log(`\n--- ${STEP.chain} ---`);
      await loginToO12CE(page, users.sale_ic_thomas_crm_mig);
      await openOpportunitiesListOnO12CE(page);
      opp = await createOpportunityOnO12CE(page, TC_ID);
      await addDealElementOnO12CE(page);
      quotation = await pressNewQuotationOnO12CE(page);
      // Setup gate - NOT this TC's assertion. On O12 CE "NEW QUOTATION" creates the Quotation in
      // place instead of navigating to it; the helper then looks the record up and puts the form on
      // it. This TC's setup only needs the form to BE on the Quotation, so it gates on
      // landedOnQuotation. Whether the button NAVIGATES is the subject of CRM-12370_6.1.1 and is
      // asserted there - gating on it here would make every screen-verification TC duplicate that
      // one finding and never reach its own checks.
      expect(
        quotation.landedOnQuotation,
        `the setup must land on the created Quotation so it can be confirmed (navigated=${quotation.navigated}, quotationId="${quotation.quotationId}", chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
      ).toBeTruthy();
      await confirmQuotationOnO12CE(page);
      await createInvoiceOnO12CE(page);
    });

    await test.step(STEP.read, async () => {
      console.log(`\n--- ${STEP.read} ---`);
      const EXPECTED = [
        'Product',
        'Start Date',
        'End Date',
        'Quantity',
        'Unit of Measure',
        'Price',
        'Special Discount (%)',
        'Special Discount Amount',
        'Partner Discount',
        'Partner Discount Amount',
        'Subtotal After All Discounts',
        'Booked value (company currency)',
        'Subtotal',
      ];

      const columns = await invoicePage.getInvoiceLineColumns();
      console.log(`  - Invoice Lines columns: ${columns.join(' | ')}`);

      record('Number of Invoice Lines columns', EXPECTED.length, columns.length);
      record('Invoice Lines column names and order', EXPECTED.join(' | '), columns.join(' | '));
      record('Partner Discount column is present', 'present', columns.includes('Partner Discount') ? 'present' : 'absent');
      record('Partner Discount Amount column is present', 'present',
        columns.includes('Partner Discount Amount') ? 'present' : 'absent');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerify();

      const EXPECTED = [
        'Product',
        'Start Date',
        'End Date',
        'Quantity',
        'Unit of Measure',
        'Price',
        'Special Discount (%)',
        'Special Discount Amount',
        'Partner Discount',
        'Partner Discount Amount',
        'Subtotal After All Discounts',
        'Booked value (company currency)',
        'Subtotal',
      ];
      const columns = await invoicePage.getInvoiceLineColumns();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Invoice Lines columns`);

      expect(columns, 'the Invoice Lines list must carry exactly 13 named columns').toHaveLength(EXPECTED.length);
      expect(columns, 'the Invoice Lines column names and their order must match the documented list').toEqual(EXPECTED);
    });
  });
});
