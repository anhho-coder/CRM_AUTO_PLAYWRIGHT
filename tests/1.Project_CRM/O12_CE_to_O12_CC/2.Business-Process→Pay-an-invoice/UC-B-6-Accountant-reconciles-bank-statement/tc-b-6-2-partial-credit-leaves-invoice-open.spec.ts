import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { OpportunityPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceForPartialPayment, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-b-3-partial-payment.helper';
import { createStandalonePaymentAsFaye } from '@helpers/uc-b-6-reconcile.helper';

/**
 * ===========================================================================
 *  UC-B-6  -  Accountant reconciles bank statement
 * ===========================================================================
 *  Test Case ID    : TC.-B.6.2
 *  Manual TC ID    : UC-B.6.2
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    As Thomas build a validated Invoice#1; as Faye pre-create a standalone Customer Payment (Payment#1)
 *    for a PARTIAL amount (< InvoiceTotal#1) and read its Journal Entry (JournalItem#1). Reconcile that
 *    outstanding credit against Invoice#1 and verify the invoice stays OPEN with Amount Due = the
 *    remaining balance and a "Paid on <today>" row equal to the partial amount.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.6\.2:" --project=chromium
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
 *  Pre-condition #2 (as Thomas - Steps 1-18): create the deal-registration Opportunity, create the
 *    Deal Element:
 *        - Payment terms  = Immediate Payment
 *        - Product / Qty  = one product Qty 1
 *    New Quotation -> Confirm, Create + Validate Invoice#1;
 *    note Invoice#1 + InvoiceTotal#1.
 *  Pre-condition #3 (as Faye - Steps 1-10): create a standalone payment Payment#1 = PARTIAL amount, set:
 *        - Payment type     = Receive Money
 *        - Partner          = Customer = Reseller
 *        - Payment Journal  = Bank Transfer
 *    Save, Confirm, read JournalItem#1.
 *  Steps to reproduce (as Faye):
 *    1. Open Invoice#1
 *    2. The "Outstanding credits" section shows JournalItem#1 with an "Add" button
 *    3. Click the "Add" button of JournalItem#1
 *  Verification Point:
 *    1. A reconciliation row appears: Column 1 = "Paid on <today>", Column 2 = the PARTIAL amount
 *    2. Amount Due = InvoiceTotal#1 - partial (> 0)
 *    3. Invoice#1 state = "Open" (NOT Paid)
 *    4. Payment#1 appears in the "Payments" tab
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // posted Invoice + posted Payment cannot be cleanly deleted -> retain (O12 convention)
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const todayMMDDYYYY = (): string => {
  const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

test.describe('TC.-B.6.2 - Partial outstanding credit leaves the invoice Open', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }, testInfo) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'beforeEach - cookies cleared').catch(() => {});
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const op = new OpportunityPage(page);
      await op.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('TC.-B.6.2: A partial outstanding credit reconciled against an invoice leaves it Open', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.6.2 ${compactDateTime}`;
    let invoiceUrl = '', invoiceNumber1 = '', journalItem1 = '';
    let invoiceTotal1 = 0, partial = 0, remainder = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`PC#1: Opp="${oppName}" Contact="${leadName}" Reseller="${DEAL_REGISTRATION.partnerCompanyName}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    await test.step('Pre-condition #2: As Thomas, create the deal-registration Opportunity and a validated single-product Invoice#1 (Steps 1-18)', async () => {
      const setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl;
      invoiceUrl = setup.invoiceUrl;
      invoiceNumber1 = setup.invoiceNumber;
      invoiceTotal1 = setup.invoiceTotal;
      partial = round2(invoiceTotal1 * 0.4);
      remainder = round2(invoiceTotal1 - partial);
      console.log(`  - Invoice#1="${invoiceNumber1}" InvoiceTotal#1=${invoiceTotal1} | partial=${partial} remainder=${remainder}`);
      expect(invoiceTotal1, 'InvoiceTotal#1 should be > 0').toBeGreaterThan(0);
      expect(partial, 'partial should be > 0 and < InvoiceTotal#1').toBeGreaterThan(0);
      expect(partial).toBeLessThan(invoiceTotal1);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 validated');
    });

    await test.step('Pre-condition #3: As Faye, pre-create a PARTIAL standalone payment Payment#1 and read JournalItem#1', async () => {
      const res = await createStandalonePaymentAsFaye(page, { amount: partial.toFixed(2) });
      journalItem1 = res.journalItem;
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Payment#1 (partial) Journal Entry');
    });

    await test.step("Steps to reproduce - Step 1: Still in Faye's session, open Invoice#1", async () => {
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      expect(await invoicePage.getInvoiceNumber()).toBe(invoiceNumber1);
    });

    await test.step('Steps to reproduce - Step 2: The "Outstanding credits" section shows JournalItem#1 with an "Add" button', async () => {
      const present = await invoicePage.isOutstandingCreditPresent(journalItem1);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Outstanding credits (JournalItem#1)');
      expect(present, `Outstanding credits should list JournalItem#1 ("${journalItem1}")`).toBeTruthy();
    });

    await test.step('Steps to reproduce - Step 3: Click the "Add" button of JournalItem#1', async () => {
      const added = await invoicePage.addOutstandingCredit(journalItem1);
      expect(added, 'The "Add" control for JournalItem#1 should be clicked').toBeTruthy();
    });

    await test.step('Verification Point 1: Reconciliation row - Column 1 = "Paid on <today>", Column 2 = the partial amount', async () => {
      const row = await invoicePage.getReconciliationRow();
      const today = todayMMDDYYYY();
      console.log(`  - row label="${row.label}" amount="${row.amount}" | partial=${partial} today=${today}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Reconciliation row (partial)');
      expect(row.label, 'Column 1 should read "Paid on ..."').toMatch(/Paid on/i);
      expect(row.label, `Column 1 should carry today's date (${today})`).toContain(today);
      expect(money(row.amount), 'Column 2 (amount) should equal the partial payment').toBeCloseTo(partial, 2);
    });

    await test.step('Verification Point 2: Amount Due = InvoiceTotal#1 - partial (> 0)', async () => {
      const amountDue = await invoicePage.getAmountDue();
      console.log(`  - Amount Due="${amountDue}" expected remainder=${remainder}`);
      expect(money(amountDue), 'Amount Due should equal the remaining balance').toBeCloseTo(remainder, 2);
      expect(money(amountDue), 'Amount Due should be > 0 (invoice not fully paid)').toBeGreaterThan(0);
    });

    await test.step('Verification Point 3: Invoice#1 state = "Open" (NOT Paid)', async () => {
      const status = await invoicePage.getInvoiceStatus();
      console.log(`  - Invoice#1 state="${status}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Invoice still Open');
      expect(status, 'Invoice#1 should remain Open after a partial reconciliation').toMatch(/Open|Posted/i);
      expect(status, 'Invoice#1 should NOT be Paid').not.toMatch(/^Paid$/i);
    });

    await test.step('Verification Point 4: Payment#1 appears in the "Payments" tab', async () => {
      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount').catch(() => [])).map(money);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Payments tab (Payment#1)');
      expect(rowCount, 'Payments tab should display Payment#1').toBeGreaterThan(0);
      expect(payAmounts.some((a) => Math.abs(a - partial) < 0.01), 'A payment of the partial amount should be listed').toBeTruthy();
      console.log('✅ Partial reconciliation: invoice Open, Amount Due = remainder, Paid-on row = partial, Payment#1 listed');
    });
  });
});
