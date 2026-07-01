import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  buildValidatedEndUserInvoiceAsThomas,
  loginAsAccountantAndOpenInvoice,
  money,
} from '@helpers/uc-b-4-end-user-invoice.helper';
import { deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ===========================================================================
 *  UC-B-4  -  End User pays directly when invoiced direct
 * ===========================================================================
 *  Test Case ID    : TC.-B.4.7
 *  Manual TC ID    : UC-B.4.7
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    On an End-User invoice created with Payment terms = "15 Days", verify the Due Date is later than
 *    the Invoice Date (the term is applied), then the accountant pays in full and the invoice is Paid.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.7:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 from the template, filling the <...> placeholders
 *    with fresh dynamic values each run (key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - IP                         = 128.183.189.157
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *    The Internal Note "Name" is the End User contact (EndUser#1).
 *  Pre-condition #2 (as Thomas): 1-20. validated invoice billed to EndUser#1 (details below);
 *    capture Invoice#1 + InvoiceTotal#1.
 *      Deal Element details:
 *        - Billed to     = EndUser#1
 *        - Payment terms = "15 Days"
 *        - Product       = ONE product
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)
 *    2. Read the Invoice Date and the Due Date
 *    3. Click "Register Payment"; keep the full amount; set "Actually Received($)" = full; Validate
 *  Verification Point:
 *    1. Due Date is LATER than the Invoice Date (the "15 Days" payment term was applied)
 *    2. Invoice#1 state = "Paid" and Amount Due = $0
 *    3. Invoice#1 Payer = EndUser#1
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

/** Parse a US-format date string "MM/DD/YYYY" to a Date (or null). */
const parseUsDate = (s: string): Date | null => {
  const m = (s || '').trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
};

test.describe('TC.-B.4.7 - End User invoice with Payment terms = 15 Days', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.7: End-User invoice with Payment terms = 15 Days defers the Due Date, then pays in full', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const inv = await buildValidatedEndUserInvoiceAsThomas(page, { tcId: 'TC.-B.4.7', paymentTerm: '15 Days' });
    createdOppUrl = inv.oppUrl;

    let invoiceDate = '';
    let dueDate = '';

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      const opened = await loginAsAccountantAndOpenInvoice(page, inv.invoiceUrl);
      expect(opened, 'Faye should open Invoice#1').toBe(inv.invoiceNumber);
    });

    await test.step('Step 2: Read the Invoice Date and the Due Date', async () => {
      invoiceDate = await invoicePage.getInvoiceDate();
      dueDate = await invoicePage.getDueDate();
      console.log(`  - Invoice Date="${invoiceDate}" | Due Date="${dueDate}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.7 - Invoice Date vs Due Date (15 Days)');
    });

    await test.step('Step 3: Click "Register Payment"; keep the full amount; set "Actually Received($)" = full; Validate', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      const full = await invoicePage.getPaymentAmount();
      await invoicePage.fillPaymentAmount(full);
      await invoicePage.fillActuallyReceived(full).catch(() => {});
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice status after payment: "${status}"`);
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: Due Date is LATER than the Invoice Date (15 Days term applied)', async () => {
      const inD = parseUsDate(invoiceDate);
      const dueD = parseUsDate(dueDate);
      console.log(`  - Parsed Invoice Date=${inD?.toISOString().slice(0, 10)} | Due Date=${dueD?.toISOString().slice(0, 10)}`);
      expect(inD, 'Invoice Date should parse').not.toBeNull();
      expect(dueD, 'Due Date should parse').not.toBeNull();
      expect(dueD!.getTime(), 'Due Date should be later than the Invoice Date (15 Days payment term)').toBeGreaterThan(inD!.getTime());
    });

    await test.step('Verification Point 2: Invoice#1 state = "Paid" and Amount Due = $0', async () => {
      const status = await invoicePage.getInvoiceStatus();
      const due = await invoicePage.getAmountDue();
      console.log(`  - state="${status}" | Amount Due="${due}"`);
      expect(status, 'Invoice#1 should be Paid').toMatch(/Paid/i);
      expect(money(due), 'Amount Due should be 0').toBe(0);
    });

    await test.step('Verification Point 3: Invoice#1 Payer = EndUser#1', async () => {
      const payer = await invoicePage.getPayer();
      console.log(`  - Invoice Payer: "${payer}" | EndUser#1 = "${inv.leadName}"`);
      expect(payer, 'Invoice Payer should be EndUser#1').toContain(inv.leadName);
      console.log('✅ 15 Days term deferred the Due Date; full payment -> Paid, Due $0, Payer = End User');
    });
  });
});
