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
  O12CE_DATA,
  O12ceOpportunity,
  O12ceQuotationResult,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Edit an Invoice
 * Test Case ID: CRM-12325_2.6.2
 * Automation-Type: refactored
 * Automation-Date: 2026-08-26
 *
 * Summary:
 *   Verify a Draft Invoice can be edited on the O12 CE Migration server - changing "Payment Terms" to
 *   "15 Days" is persisted after SAVE.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.6.2 "Edit Invoice". Section II ports it as a
 * FUNCTIONAL smoke (elapsed time printed for reference; the gate is the persisted change).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-21):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`) - the pre-prod owner of
 *     this chain; CRM > Pipeline opened in list view by URL hash.
 *   - Payment term "15 Days" exists on the Migration server (id 2).
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
 *  15. Press "EDIT" button and wait.
 *  16. Change the value of the "Payment Terms" field to "15 Days".
 *
 * Steps run:
 *   1. Press "SAVE" button.
 *
 * Verification Points:
 *   1. The Invoice form is an account.invoice record (URL carries model=account.invoice + id).
 *   2. After the edit + SAVE, the Invoice "Payment Terms" reads "15 Days".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.6\.2:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.6.2 - O12 CE smoke: edit an Invoice', () => {

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

  test('CRM-12325_2.6.2: Verify an Invoice can be edited on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const invoicePage = new InvoicePage(page);

    const TC_ID = 'CRM-12325_2.6.2';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let invoice: { elapsedMs: number; invoiceNumber: string; status: string; invoiceUrl: string } | null = null;
    let paymentTermsAfterEdit = '';
    let editSaveMs = 0;

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
    invoice = await createInvoiceOnO12CE(page);

    await test.step('Step 15: Press "EDIT" button and wait', async () => {
      console.log('\n--- Step 15: Click EDIT on the Invoice ---');
      await invoicePage.clickEdit(CommonUtils.waitTimes.abnormalWait);
      console.log('  OK - Invoice back in edit mode');
    });

    await test.step(`Step 16: Change the value of the "Payment Terms" field to "${O12CE_DATA.paymentTermEdited}"`, async () => {
      console.log('\n--- Step 16: Change the Payment Terms ---');
      console.log(`  To : ${O12CE_DATA.paymentTermEdited}`);
      await invoicePage.changePaymentTerms(O12CE_DATA.paymentTermEdited, CommonUtils.waitTimes.abnormalWait);
      console.log('  OK - Payment Terms re-selected');
    });

    await test.step('Steps run - Step 1: Press "SAVE" button', async () => {
      console.log('\n--- Steps run - Step 1: Save the edited Invoice ---');
      editSaveMs = await invoicePage.clickSaveAndWaitForCompletion(CommonUtils.waitTimes.savingPage);
      paymentTermsAfterEdit = await invoicePage.getPaymentTermsValue();
      console.log(`  Save elapsed            : ${(editSaveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Payment Terms read back : "${paymentTermsAfterEdit}"`);
    });

    await test.step('Verification', async () => {
      const invoiceOk = /model=account\.invoice/.test(invoice?.invoiceUrl ?? '') && /[?#&]id=\d+/.test(invoice?.invoiceUrl ?? '');
      const paymentTermsOk = paymentTermsAfterEdit.includes(O12CE_DATA.paymentTermEdited);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Invoice form is an account.invoice record:');
      console.log('     Expected : URL carries model=account.invoice and id=<digits>');
      console.log(`     Actual   : ${invoice?.invoiceUrl}`);
      console.log(`     Result   : ${invoiceOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - After the edit + SAVE the Invoice "Payment Terms" reads the new value:');
      console.log(`     Expected : ${O12CE_DATA.paymentTermEdited}`);
      console.log(`     Actual   : "${paymentTermsAfterEdit}"`);
      console.log(`     Result   : ${paymentTermsOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Opportunity: id=${opp?.oppId} | Invoice number: "${invoice?.invoiceNumber}" | status: "${invoice?.status}"`);
      console.log(`  Info - Save elapsed after edit: ${(editSaveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${invoiceOk && paymentTermsOk ? 'PASS' : 'FAIL'} - Invoice edit on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Invoice edited on O12 CE`);

      expect(invoiceOk, `the Invoice must be an account.invoice record on O12 CE (URL read back: ${invoice?.invoiceUrl})`).toBeTruthy();
      expect(paymentTermsOk, `the edited Invoice must persist Payment Terms = "${O12CE_DATA.paymentTermEdited}" (read back: "${paymentTermsAfterEdit}")`).toBeTruthy();
    });
  });
});
