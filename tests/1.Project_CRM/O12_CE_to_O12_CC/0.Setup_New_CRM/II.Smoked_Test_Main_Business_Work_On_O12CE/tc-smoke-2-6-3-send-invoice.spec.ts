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
  validateInvoiceOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Send an Invoice
 * Test Case ID: CRM-12325_2.6.3
 * Automation-Type: refactored
 * Automation-Date: 2026-08-26
 *
 * Summary:
 *   Verify a validated (Open) Invoice can be sent by email on the O12 CE Migration server - the
 *   "Send Invoice" composer completes and the Invoice form returns to its readonly state.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.6.3 "Send Invoice". Section II ports it as a
 * FUNCTIONAL smoke (elapsed time printed for reference; the gate is the business outcome).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-21):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`) - the pre-prod owner of
 *     this chain; CRM > Pipeline opened in list view by URL hash.
 *   - Odoo 12 does not expose a "sent" state on the invoice statusbar, so the assertable signals are
 *     (a) the invoice posts to "Open" after VALIDATE and (b) the "Send Invoice" composer completes and
 *     the form comes back readonly (Edit button visible).
 *   - This TC needs the created Quotation to be OPEN on screen, so it asserts that "NEW QUOTATION"
 *     navigated to the new Quotation form (see CRM-12325_2.5.1 for the two observed variants).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in
 *   (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *  13. Press "CONFIRM" button and wait to create a Sales Order.
 *  14. Press "CREATE INVOICE" and then "CREATE AND VIEW INVOICES" and wait.
 *  15. Press "VALIDATE" button and wait.
 *  16. Press "SEND & PRINT" button and wait.
 *
 * Steps run:
 *   1. Once the "Send Invoice" window appears, press "SEND" button.
 *
 * Verification Points:
 *   1. After "VALIDATE" the Invoice status is "Open" and it carries an invoice number.
 *   2. The "Send Invoice" composer completes and the Invoice form returns to readonly.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.6\.3:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.6.3 - O12 CE smoke: send an Invoice', () => {

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
    console.log(`Teardown: SKIP_CLEANUP_OPP=${SKIP_CLEANUP_OPP} - the created records are kept on O12 CE`);
  });

  test('CRM-12325_2.6.3: Verify an Invoice can be sent by email on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const invoicePage = new InvoicePage(page);

    const TC_ID = 'CRM-12325_2.6.3';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let validated: { status: string; invoiceNumber: string } = { status: '', invoiceNumber: '' };
    let sendCompleted = false;
    let sendError = '';
    let sendMs = 0;

    await loginToO12CE(page, users.sale_ic_thomas_crm_mig);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);
    await addDealElementOnO12CE(page);

    await test.step('Step 12: Press "NEW QUOTATION" button and wait', async () => {
      console.log('\n--- Step 12: Press NEW QUOTATION ---');
      quotation = await pressNewQuotationOnO12CE(page);
      expect(
        quotation.navigated,
        `the "NEW QUOTATION" action must open the created Quotation form so it can be confirmed (O12 CE created it in place instead - chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
      ).toBeTruthy();
    });

    await confirmQuotationOnO12CE(page);
    await createInvoiceOnO12CE(page);
    validated = await validateInvoiceOnO12CE(page);

    await test.step('Step 16: Press "SEND & PRINT" button and wait', async () => {
      console.log('\n--- Step 16: Press SEND & PRINT ---');
      await invoicePage.clickSendAndPrint(CommonUtils.waitTimes.abnormalWait);
      console.log('  OK - the "Send Invoice" composer is open');
    });

    await test.step('Steps run - Step 1: Once the "Send Invoice" window appears, press "SEND" button', async () => {
      console.log('\n--- Steps run - Step 1: Press SEND ---');
      try {
        sendMs = await invoicePage.clickSendAndWaitForCompletion(CommonUtils.waitTimes.elementAppear);
        sendCompleted = true;
      } catch (error) {
        sendError = error instanceof Error ? error.message.split('\n')[0] : String(error);
        sendCompleted = false;
      }
      console.log(`  SEND elapsed    : ${(sendMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Send completed  : ${sendCompleted}`);
      if (sendError) console.log(`  Send error      : ${sendError}`);
    });

    await test.step('Verification', async () => {
      const postedOk = /open/i.test(validated.status) && validated.invoiceNumber.trim() !== '';

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - After "VALIDATE" the Invoice is Open and carries an invoice number:');
      console.log('     Expected : status contains "Open" AND invoice number is not empty');
      console.log(`     Actual   : status="${validated.status}" | number="${validated.invoiceNumber}"`);
      console.log(`     Result   : ${postedOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The "Send Invoice" composer completes and the form returns to readonly:');
      console.log('     Expected : SEND completes and the Edit button is back');
      console.log(`     Actual   : completed=${sendCompleted}${sendError ? ` (${sendError})` : ''}`);
      console.log(`     Result   : ${sendCompleted ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Opportunity: id=${opp?.oppId}`);
      console.log(`  Info - SEND elapsed: ${(sendMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${postedOk && sendCompleted ? 'PASS' : 'FAIL'} - Invoice send-by-email on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Invoice sent on O12 CE`);

      expect(postedOk, `the validated Invoice must be Open with an invoice number on O12 CE (status="${validated.status}", number="${validated.invoiceNumber}")`).toBeTruthy();
      expect(sendCompleted, `the "Send Invoice" composer must complete on O12 CE and return the form to readonly${sendError ? ` (error: ${sendError})` : ''}`).toBeTruthy();
    });
  });
});
