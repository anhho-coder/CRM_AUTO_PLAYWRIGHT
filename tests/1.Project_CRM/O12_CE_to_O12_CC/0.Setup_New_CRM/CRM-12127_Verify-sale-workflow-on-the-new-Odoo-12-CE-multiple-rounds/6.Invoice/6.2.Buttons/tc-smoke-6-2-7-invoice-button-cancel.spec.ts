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
 * O12 CE Main-Business Smoke - Invoice button - CANCEL
 * Test Case ID: CRM-12370_6.2.7
 * Automation-Type: refactored
 * Automation-Date: 2026-09-22
 *
 * Objective: Verify pressing CANCEL on a validated Invoice moves it to the Cancelled stage and clears the number it was given.
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.6.2.7
 * (tests/1.Project_CRM/1.SalesReport_Performance/6.Invoice/6.2.Buttons). Section II ports it as a
 * FUNCTIONAL smoke (elapsed time printed for reference; the gate is the business outcome).
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`).
 *   - Navigation and chain driven by helper functions instead of pre-prod page objects.
 *   - The run marker is "TEST ..." so the crm-mig leftover sweep finds the record.
 *   - Test timeout raised to config.timeouts.test (15 min).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in
 *   (CRM-12325_1.1.1).
 *
 * Steps (1-14 = the shared Opportunity + Deal Element chain):
 *   1-14. Login, open Opportunities list, CREATE + fill + SAVE Opportunity, wait for Contact, press
 *         "DEAL ELEMENT", select Pricelist + Payment Term, add product, press "SAVE", press
 *         "NEW QUOTATION", press "CONFIRM" to create Sales Order, press "CREATE INVOICE" and
 *         "CREATE AND VIEW INVOICES".
 *
 * Steps run:
 *   1. Press VALIDATE to move the Invoice to Open and get an invoice number.
 *   2. Press CANCEL to move the Invoice to Cancelled.
 *   3. Read the stage and number.
 *
 * Verification:
 *   - Invoice carried a number when OPEN
 *   - Active stage after CANCEL is CANCELLED
 *   - CANCELLED joins the statusbar stages
 *   - Invoice number after CANCEL is empty
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. The Opportunity it makes carries
 * the marker "TEST CRM-12370_6.2.7 <timestamp>" so the afterAll sweep can find it again even when the test dies
 * mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\.2\.7:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  s1: 'Step 1-14: Login, create Opportunity, Deal Element, Quotation, Sales Order, Invoice',
  s2: 'Step 15: Validating and cancelling, then verifying the Invoice state',
};

test.describe('CRM-12370_6.2.7 - Invoice CANCEL button', () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.2.7');
  });

  test('CRM-12370_6.2.7: Verify pressing CANCEL moves the Invoice to Cancelled and clears its number', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.2.7';
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
      console.log(
        `OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`
      );
    };

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
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
      console.log(`\n--- ${STEP.s2} ---`);
      const invoicePage = new InvoicePage(page);

      await invoicePage.clickStatusbarButtonByName('action_invoice_open', CommonUtils.waitTimes.pageLoad);
      await invoicePage.waitForInvoiceStatus('Open').catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const numberWhenOpen = await invoicePage.getInvoiceNumberOrEmpty();
      console.log(`  - Invoice number when OPEN: ${numberWhenOpen}`);

      await invoicePage.clickCancelInvoice();
      // Odoo 12 leaves the statusbar and the header buttons showing the PREVIOUS state after
      // the action returns, so the screen is polled (reloading between passes) until the stage
      // the product moved to is actually on it. A fixed wait reads the old render and fails a
      // flow that worked; the assertions below are unchanged, only the moment of the read is.
      await invoicePage.waitForActiveStage('CANCELLED');

      const stage = await invoicePage.getActiveStatusBarStage();
      const stages = await invoicePage.getStatusBarStages();
      const number = await invoicePage.getInvoiceNumberOrEmpty();
      console.log(`  - After CANCEL: stage="${stage}" stages="${stages.join(' | ')}" number="${number}"`);

      record('Invoice carried a number when OPEN', 'INV/<year>/<sequence>', numberWhenOpen || '(empty)',
        /^INV\/\d{4}\/\d+$/.test(numberWhenOpen));
      record('Active stage after CANCEL', 'CANCELLED', stage);
      record('CANCELLED joins the statusbar', 'present', stages.includes('CANCELLED') ? 'present' : 'absent');
      record('Invoice number after CANCEL', '(empty)', number || '(empty)');
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Cancelled Invoice`);

      expect(stage, 'CANCEL must move the Invoice to the CANCELLED stage').toBe('CANCELLED');
      expect(stages, 'CANCELLED must join the stages the statusbar offers').toContain('CANCELLED');
      expect(number, 'cancelling the Invoice must clear the number it was given').toBe('');
    });
  });
});
