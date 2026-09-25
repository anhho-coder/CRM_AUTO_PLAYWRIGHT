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
 * O12 CE Main-Business Smoke - Invoice Lines - product, quantity, and unit of measure
 * Test Case ID: CRM-12370_6.5.2
 * Automation-Type: ported
 * Automation-Date: 2026-09-22
 *
 * Summary:
 *   Verify the Invoice raised from the Sales Order carries exactly one line, and that the line names
 *   the NAKIVO product added on the Deal Element with the quantity and the unit of measure it was
 *   added with.
 *
 * Source manual TC (pre-production): TC.Performance.6.5.2 "Invoice Invoice Lines - The Invoice line
 * carries the product of the Deal Element".
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
 *  15. Read the number of rows of the "Invoice Lines" tab.
 *  16. Read the Product, the Quantity and the Unit of Measure of the first row.
 *
 * Verification:
 *   - The Invoice carries exactly 1 line.
 *   - The Product names the NAKIVO product added on the Deal Element.
 *   - The Quantity is 1.
 *   - The Unit of Measure is Socket.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\\.5\\.2:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  chain: 'Steps 1-14: Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice',
  read: 'Steps 15-16: Read the Invoice line product, quantity, and unit of measure',
  verify: 'Verification: The Invoice line product matches the Deal Element product',
} as const;

test.describe('CRM-12370_6.5.2 - O12 CE smoke: Invoice line - product, quantity, and unit of measure', () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.5.2');
  });

  test('CRM-12370_6.5.2: Verify the Invoice line carries the product of the Deal Element', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.5.2';
    const invoicePage = new InvoicePage(page);
    const DATA = {
      product: 'NAKIVO Backup',
    };

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
      const rowCount = await invoicePage.getInvoiceLineRowCount();
      const row = await invoicePage.getInvoiceLineRowCells(0);
      const product = row['Product'] || '';
      const quantity = row['Quantity'] || '';
      const uom = row['Unit of Measure'] || '';
      console.log(`  - Rows: ${rowCount}`);
      console.log(`  - Product: ${product}`);
      console.log(`  - Quantity: ${quantity} | Unit of Measure: ${uom}`);

      record('Number of Invoice lines', 1, rowCount);
      record('Product names the Deal Element product', `contains "${DATA.product}"`, product, product.includes(DATA.product));
      record('Quantity', '1', quantity.trim());
      record('Unit of Measure', 'Socket', uom.trim());
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerify();

      const rowCount = await invoicePage.getInvoiceLineRowCount();
      const row = await invoicePage.getInvoiceLineRowCells(0);
      const product = row['Product'] || '';
      const quantity = row['Quantity'] || '';
      const uom = row['Unit of Measure'] || '';

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Invoice line product`);

      expect(rowCount, 'the Invoice must carry exactly one line').toBe(1);
      expect(product, `the Invoice line must name the Deal Element product, read "${product}"`).toContain(DATA.product);
      expect(quantity.trim(), 'the Invoice line quantity must be 1').toBe('1');
      expect(uom.trim(), 'the Invoice line unit of measure must be Socket').toBe('Socket');
    });
  });
});
