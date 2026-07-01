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
 *  Test Case ID    : TC.-B.4.6
 *  Manual TC ID    : UC-B.4.6
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    On a MULTI-PRODUCT invoice whose Payer = the End User, the accountant pays the full amount; verify
 *    each product line is present, the invoice becomes Paid with Amount Due $0, and the Payer = End User.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.6:" --project=chromium
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
 *        - Payment terms = Immediate Payment
 *        - Products      = THREE different products (Qty 1 each)
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)
 *    2. Open the Invoice Lines tab and confirm each of the 3 products appears as a line
 *    3. Click "Register Payment"; keep the full amount; set "Actually Received($)" = full; Validate
 *  Verification Point:
 *    1. The invoice has a line for each of the 3 products (subtotal > 0 each)
 *    2. Invoice#1 state = "Paid" and Amount Due = $0
 *    3. Invoice#1 Payer = EndUser#1
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const PRODUCTS = ['[A2151B]', '[A2149B]', '[A2150B]']; // 3 different products

test.describe('TC.-B.4.6 - End User pays a multi-product invoice in full', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.6: End User pays a multi-product invoice in full (becomes Paid)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const inv = await buildValidatedEndUserInvoiceAsThomas(page, { tcId: 'TC.-B.4.6', products: PRODUCTS });
    createdOppUrl = inv.oppUrl;

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      const opened = await loginAsAccountantAndOpenInvoice(page, inv.invoiceUrl);
      expect(opened, 'Faye should open Invoice#1').toBe(inv.invoiceNumber);
    });

    const lineSubtotals: Record<string, number> = {};
    await test.step('Step 2: Open the Invoice Lines tab and confirm each of the 3 products appears as a line', async () => {
      await invoicePage.clickInvoiceLinesTab().catch(() => {});
      for (const code of PRODUCTS) {
        const line = await invoicePage.getInvoiceLineData(code);
        lineSubtotals[code] = money(line.subtotal);
        console.log(`  - Line ${code}: qty="${line.quantity}" subtotal="${line.subtotal}"`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.6 - Multi-product invoice lines');
    });

    await test.step('Step 3: Click "Register Payment"; keep the full amount; set "Actually Received($)" = full; Validate', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      const full = await invoicePage.getPaymentAmount();
      console.log(`  - Full Amount Due: "${full}" | InvoiceTotal#1: "${inv.invoiceTotal}"`);
      await invoicePage.fillPaymentAmount(full);
      await invoicePage.fillActuallyReceived(full).catch(() => {});
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice status after payment: "${status}"`);
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: The invoice has a line for each of the 3 products (subtotal > 0 each)', async () => {
      for (const code of PRODUCTS) {
        console.log(`  - ${code}: subtotal = ${lineSubtotals[code]}`);
        expect(lineSubtotals[code], `Product ${code} should appear as an invoice line with subtotal > 0`).toBeGreaterThan(0);
      }
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
      console.log('✅ Multi-product End-User invoice paid in full -> Paid, Due $0, Payer = End User');
    });
  });
});
