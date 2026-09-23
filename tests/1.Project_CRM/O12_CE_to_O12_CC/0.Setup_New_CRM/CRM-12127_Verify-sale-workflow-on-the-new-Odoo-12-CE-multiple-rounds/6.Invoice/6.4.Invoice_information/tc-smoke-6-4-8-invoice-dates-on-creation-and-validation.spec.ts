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
  validateInvoiceOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Invoice data verification - Invoice Date, Due Date and Paid Date are empty on a draft Invoice and dated on validation
 * Test Case ID: CRM-12370_6.4.8
 * Automation-Type: refactored
 * Automation-Date: 2026-09-22
 *
 * Objective: Verify a draft Invoice carries no Invoice Date, Due Date or Paid Date, and that VALIDATE stamps the Invoice Date and the Due Date with the day the invoice is posted (Payment Terms = Immediate Payment, so the two are the same day).
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.6.4.8
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
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *  13. Press "CONFIRM" button and wait for Sales Order.
 *  14. Press "CREATE INVOICE" button and "CREATE AND VIEW INVOICES".
 *
 * Steps run:
 *   1. Read "Invoice Date", "Due Date" and "Paid Date" on the draft Invoice.
 *   2. Press the "VALIDATE" button of the Invoice header.
 *   3. Read "Invoice Date" and "Due Date" again.
 *
 * Verification Points:
 *   1. On the draft, Invoice Date is empty.
 *   2. On the draft, Due Date is empty.
 *   3. On the draft, Paid Date is empty.
 *   4. After VALIDATE the Invoice Date is filled.
 *   5. After VALIDATE the Due Date equals the Invoice Date (because the Payment Terms are Immediate Payment).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\.4\.8:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  s1: 'Steps 1-14: Login, create Opportunity, Deal Element, confirm Quotation, create Invoice',
  s2: 'Step 1: Reading dates on draft Invoice',
  s3: 'Step 2: Pressing VALIDATE',
  s4: 'Step 3: Verifying dates after VALIDATE',
};

test.describe('CRM-12370_6.4.8 - Invoice Date, Due Date and Paid Date are empty on a draft Invoice and dated on validation', () => {
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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.4.8');
  });

  test('CRM-12370_6.4.8: Verify Invoice Date, Due Date and Paid Date on a draft and on a validated Invoice', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.4.8';
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

    let invoiceDateDraft = '';
    let dueDateDraft = '';
    let paidDateDraft = '';

    await test.step(STEP.s2, async () => {
      console.log('\n--- Step 1: Reading dates on draft Invoice ---');
      const invoicePage = new InvoicePage(page);
      invoiceDateDraft = await invoicePage.getFieldDisplayValue('date_invoice');
      dueDateDraft = await invoicePage.getFieldDisplayValue('date_due');
      paidDateDraft = await invoicePage.getFieldDisplayValue('paid_date');
      console.log(`  - Draft: Invoice Date="${invoiceDateDraft}" Due Date="${dueDateDraft}" Paid Date="${paidDateDraft}"`);
    });

    await test.step(STEP.s3, async () => {
      console.log('\n--- Step 2: Pressing VALIDATE ---');
      await validateInvoiceOnO12CE(page);
    });

    await test.step(STEP.s4, async () => {
      console.log('\n--- Step 3: Verifying dates after VALIDATE ---');
      const invoicePage = new InvoicePage(page);
      const invoiceDateOpen = await invoicePage.getFieldDisplayValue('date_invoice');
      const dueDateOpen = await invoicePage.getFieldDisplayValue('date_due');
      console.log(`  - Open : Invoice Date="${invoiceDateOpen}" Due Date="${dueDateOpen}"`);

      record('Invoice Date on the draft', '(empty)', invoiceDateDraft || '(empty)');
      record('Due Date on the draft', '(empty)', dueDateDraft || '(empty)');
      record('Paid Date on the draft', '(empty)', paidDateDraft || '(empty)');
      record('Invoice Date after VALIDATE', 'not empty', invoiceDateOpen || '(empty)', invoiceDateOpen !== '');
      record('Due Date equals the Invoice Date (Immediate Payment)', invoiceDateOpen, dueDateOpen);
      printVerify();

      let __verifyPassed = false;
      try {
        expect(invoiceDateDraft, 'a draft Invoice must carry no Invoice Date').toBe('');
        expect(dueDateDraft, 'a draft Invoice must carry no Due Date').toBe('');
        expect(paidDateDraft, 'a draft Invoice must carry no Paid Date').toBe('');
        expect(invoiceDateOpen, 'VALIDATE must stamp the Invoice Date').not.toBe('');
        expect(dueDateOpen, 'Immediate Payment must make the Due Date the Invoice Date').toBe(invoiceDateOpen);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC_ID} - Invoice dates after VALIDATE`, passed: __verifyPassed }).catch(() => {});
      }
    });
  });
});
