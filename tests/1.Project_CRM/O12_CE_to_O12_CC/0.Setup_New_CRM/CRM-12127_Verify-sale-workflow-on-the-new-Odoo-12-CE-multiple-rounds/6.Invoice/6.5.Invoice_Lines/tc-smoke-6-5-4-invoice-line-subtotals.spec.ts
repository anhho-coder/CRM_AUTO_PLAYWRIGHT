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
 * O12 CE Main-Business Smoke - Invoice Line - subtotals
 * Test Case ID: CRM-12370_6.5.4
 * Automation-Type: ported
 * Automation-Date: 2026-09-22
 *
 * Summary:
 *   Verify the subtotal columns of an Invoice line are correctly calculated from the price and
 *   quantity, with no discount applied.
 *
 * Source manual TC (pre-production): TC.Performance.6.5.4 "Invoice Invoice Lines - The subtotal
 * columns of the Invoice line are correct".
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`).
 *   - The setup chain is driven by helper functions.
 *   - The run marker is "TEST ...".
 *   - Test timeout raised to config.timeouts.test.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in.
 *
 * Steps (1-14 = the shared Opportunity + Deal Element chain):
 *   1-14. Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice.
 *
 * Steps run:
 *  15. Read the Price, Quantity, Subtotal After All Discounts, Booked value, and Subtotal of the
 *      first Invoice line.
 *
 * Verification:
 *   - Price is read as a number greater than 0.
 *   - Subtotal After All Discounts equals Price x Quantity.
 *   - Booked value equals Price x Quantity.
 *   - Subtotal equals Price x Quantity.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\\.5\\.4:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  chain: 'Steps 1-14: Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice',
  read: 'Step 15: Read the subtotal columns of the Invoice line',
  verify: 'Verification: Subtotals are correctly calculated',
} as const;

test.describe('CRM-12370_6.5.4 - O12 CE smoke: Invoice line - subtotals', () => {

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

  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.5.4');
  });

  test('CRM-12370_6.5.4: Verify the subtotal columns of the Invoice line are correct', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.5.4';
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
      const row = await invoicePage.getInvoiceLineRowCells(0);
      const num = (cell: string) => {
        const match = (cell || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        return match ? parseFloat(match[0]) : NaN;
      };
      const price = num(row['Price']);
      const quantity = num(row['Quantity']);
      const expected = price * quantity;
      const afterDiscounts = num(row['Subtotal After All Discounts']);
      const bookedValue = num(row['Booked value (company currency)']);
      const subtotal = num(row['Subtotal']);
      const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
      console.log(`  - Price ${price} x Quantity ${quantity} = ${expected.toFixed(2)}`);
      console.log(`  - After all discounts: ${afterDiscounts} | Booked value: ${bookedValue} | Subtotal: ${subtotal}`);

      record('Price is read', 'a number greater than 0', price, price > 0);
      record('Subtotal After All Discounts', expected.toFixed(2), afterDiscounts.toFixed(2), close(afterDiscounts, expected));
      record('Booked value (company currency)', expected.toFixed(2), bookedValue.toFixed(2), close(bookedValue, expected));
      record('Subtotal', expected.toFixed(2), subtotal.toFixed(2), close(subtotal, expected));
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerify();

      const row = await invoicePage.getInvoiceLineRowCells(0);
      const num = (cell: string) => {
        const match = (cell || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        return match ? parseFloat(match[0]) : NaN;
      };
      const price = num(row['Price']);
      const quantity = num(row['Quantity']);
      const expected = price * quantity;
      const afterDiscounts = num(row['Subtotal After All Discounts']);
      const bookedValue = num(row['Booked value (company currency)']);
      const subtotal = num(row['Subtotal']);
      const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Invoice line subtotals`);

      expect(price, 'the Invoice line must carry a price').toBeGreaterThan(0);
      expect(close(afterDiscounts, expected), `Subtotal After All Discounts must be ${expected.toFixed(2)}, read ${afterDiscounts}`).toBe(true);
      expect(close(bookedValue, expected), `Booked value must be ${expected.toFixed(2)}, read ${bookedValue}`).toBe(true);
      expect(close(subtotal, expected), `Subtotal must be ${expected.toFixed(2)}, read ${subtotal}`).toBe(true);
    });
  });
});
