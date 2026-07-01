import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
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
 *  Test Case ID    : TC.-B.4.5
 *  Manual TC ID    : UC-B.4.5
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    A direct End-User invoice keeps its Reseller linkage: verify the invoice's Payer = the End User,
 *    Reseller = TEST-Reseller#Automation-Jun10, and the End User field is populated; then the accountant
 *    pays in full and the invoice becomes Paid.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.5:" --project=chromium
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
 *        - Product       = ONE product
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)
 *    2. Read the invoice Payer, Reseller and End User fields
 *    3. Click "Register Payment"; keep the full amount; set "Actually Received($)" = full; Validate
 *  Verification Point:
 *    1. Invoice#1 Payer = EndUser#1 (the End User, NOT the Reseller)
 *    2. Invoice#1 Reseller = TEST-Reseller#Automation-Jun10 (the linkage is kept) and the End User field is populated
 *    3. Invoice#1 state = "Paid" and Amount Due = $0
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.4.5 - End User invoice keeps the Reseller linkage', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.5: A direct End-User invoice has Payer = End User while keeping the Reseller linkage', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const inv = await buildValidatedEndUserInvoiceAsThomas(page, { tcId: 'TC.-B.4.5' });
    createdOppUrl = inv.oppUrl;

    let payer = '';
    let reseller = '';
    let endUser = '';

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      const opened = await loginAsAccountantAndOpenInvoice(page, inv.invoiceUrl);
      expect(opened, 'Faye should open Invoice#1').toBe(inv.invoiceNumber);
    });

    await test.step('Step 2: Read the invoice Payer, Reseller and End User fields', async () => {
      payer = await invoicePage.getPayer();
      reseller = await invoicePage.getReseller().catch(() => '');
      endUser = await invoicePage.getEndUser().catch(() => '');
      console.log(`  - Payer="${payer}" | Reseller="${reseller}" | End User="${endUser}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.5 - Invoice field relationships');
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

    await test.step('Verification Point 1: Invoice#1 Payer = EndUser#1 (the End User, NOT the Reseller)', async () => {
      console.log(`  - Payer="${payer}" | EndUser#1="${inv.leadName}" | Reseller="${DEAL_REGISTRATION.partnerCompanyName}"`);
      expect(payer, 'Invoice Payer should be EndUser#1 (the End User contact)').toContain(inv.leadName);
      expect(payer.toLowerCase(), 'Invoice Payer should NOT be the Reseller').not.toContain(DEAL_REGISTRATION.partnerCompanyName.toLowerCase());
    });

    await test.step('Verification Point 2: Invoice#1 Reseller = the Reseller (linkage kept) and the End User field is populated', async () => {
      console.log(`  - Reseller="${reseller}" (expected "${DEAL_REGISTRATION.partnerCompanyName}") | End User="${endUser}"`);
      expect(reseller, 'Invoice Reseller should still be the Reseller (direct invoice keeps the linkage)').toContain(DEAL_REGISTRATION.partnerCompanyName);
      expect(endUser.trim().length, 'Invoice End User field should be populated').toBeGreaterThan(0);
    });

    await test.step('Verification Point 3: Invoice#1 state = "Paid" and Amount Due = $0', async () => {
      const status = await invoicePage.getInvoiceStatus();
      const due = await invoicePage.getAmountDue();
      console.log(`  - state="${status}" | Amount Due="${due}"`);
      expect(status, 'Invoice#1 should be Paid').toMatch(/Paid/i);
      expect(money(due), 'Amount Due should be 0').toBe(0);
      console.log('✅ Direct End-User invoice: Payer = End User, Reseller linkage kept, Paid, Due $0');
    });
  });
});
