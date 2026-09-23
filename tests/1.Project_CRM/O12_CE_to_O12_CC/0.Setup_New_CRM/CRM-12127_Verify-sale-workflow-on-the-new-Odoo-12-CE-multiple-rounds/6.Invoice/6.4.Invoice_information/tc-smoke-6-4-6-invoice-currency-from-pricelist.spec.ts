import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { HomePageMig } from '@pages/mig';
import { InvoicePage } from '@pages';
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
 * O12 CE Main-Business Smoke - Invoice data verification - Currency comes from Pricelist
 * Test Case ID: CRM-12370_6.4.6
 * Automation-Type: refactored
 * Automation-Date: 2026-09-22
 *
 * Objective: Verify Invoice currency equals pricelist currency; totals display with currency symbol.
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.6.4.6
 * (tests/1.Project_CRM/1.SalesReport_Performance/6.Invoice/6.4.Invoice_information). Section II ports
 * the pre-production Invoice data verification set to the O12 CE Migration server.
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`).
 *   - The run marker is "TEST ..." instead of the pre-prod format.
 *   - Test timeout raised to config.timeouts.test (15 min).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in.
 *
 * Steps (1-14 = the shared chain):
 *   1-7.  Login, open Opportunities list, CREATE + fill + SAVE Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist (Public Pricelist_USD) + Payment Term, add product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *  13. Press "CONFIRM" button and wait for Sales Order.
 *  14. Press "CREATE INVOICE" button and "CREATE AND VIEW INVOICES".
 *
 * Steps run:
 *   1. Read the "Currency" field and verify the Subtotal displays with currency symbol.
 *
 * Verification Points:
 *   1. Currency is filled.
 *   2. Currency = "USD".
 *   3. Subtotal contains "$" (USD currency symbol).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\.4\.6:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  s1: 'Steps 1-14: Login, create Opportunity, Deal Element, confirm Quotation, create Invoice',
  s2: 'Step 1: Verifying Currency',
};

test.describe('CRM-12370_6.4.6 - Currency comes from Pricelist', () => {
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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.4.6');
  });

  test('CRM-12370_6.4.6: Verify Currency comes from Pricelist', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.4.6';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let confirmResult: { status: string; orderNumber: string } = { status: '', orderNumber: '' };
    let invoice: { elapsedMs: number; invoiceNumber: string; status: string; invoiceUrl: string } | null = null;

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
      console.log(`OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`);
    };

    await test.step(STEP.s1, async () => {
      console.log('\n--- Steps 1-14: Login, create Opportunity, Deal Element, confirm Quotation, create Invoice ---');
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
      confirmResult = await confirmQuotationOnO12CE(page);
      invoice = await createInvoiceOnO12CE(page);
    });

    await test.step(STEP.s2, async () => {
      console.log('\n--- Step 1: Verifying Currency ---');
      const invoicePage = new InvoicePage(page);
      const currency = await invoicePage.getFieldPartnerName('currency_id');
      const totals = await invoicePage.getInvoiceTotalsFooter();
      const subtotal = totals.find((t) => t.label === 'Subtotal');
      console.log(`  - Currency: ${currency} | Subtotal row: ${subtotal ? subtotal.value : '(missing)'}`);

      record('Currency is filled', 'not empty', currency || '(empty)', currency !== '');
      record('Currency matches the Deal Element pricelist', 'USD', currency);
      record('Subtotal is printed in dollars', '$ in the value', subtotal ? subtotal.value : '(missing)',
        !!subtotal && subtotal.value.includes('$'));
      printVerify();

      let __verifyPassed = false;
      try {
        expect(currency, 'the Invoice Currency must be filled').not.toBe('');
        expect(currency, 'the Invoice raised from Public Pricelist_USD must be denominated in USD').toBe('USD');
        expect(subtotal, 'the totals block must carry a Subtotal row').toBeTruthy();
        expect(subtotal!.value, 'the Subtotal must be printed in dollars').toContain('$');
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC_ID} - Invoice Currency verification`, passed: __verifyPassed }).catch(() => {});
      }
    });
  });
});
