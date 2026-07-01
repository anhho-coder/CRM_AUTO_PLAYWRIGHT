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
 *  Test Case ID    : TC.-B.6.4
 *  Manual TC ID    : UC-B.6.4
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    As Thomas build a validated Invoice#1; as Faye pre-create a standalone Customer Payment (Payment#1)
 *    for the FULL amount via the CASH journal (not Bank Transfer) and read JournalItem#1. Reconcile that
 *    outstanding credit against Invoice#1 and verify the invoice becomes Paid, Amount Due $0, and the
 *    Payments tab records the Cash journal.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.6\.4:" --project=chromium
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
 *  Pre-condition #2 (as Thomas): validated single-product Invoice#1; note Invoice#1 + InvoiceTotal#1.
 *  Pre-condition #3 (as Faye): create Payment#1 = InvoiceTotal#1 with Payment Journal = Cash; read JournalItem#1.
 *  Steps to reproduce (as Faye): 1. Open Invoice#1  2. Outstanding credits shows JournalItem#1 + Add  3. Click Add
 *  Verification Point:
 *    1. Reconciliation row "Paid on <today>" = InvoiceTotal#1
 *    2. Amount Due = $0
 *    3. Invoice#1 state = "Paid"
 *    4. The Payments tab shows Payment#1 with Payment Journal = Cash
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const PAYMENT_JOURNAL = 'Cash';
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const todayMMDDYYYY = (): string => {
  const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

test.describe('TC.-B.6.4 - Reconcile an outstanding credit created via a different journal (Cash)', () => {
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

  test('TC.-B.6.4: An outstanding credit created via the Cash journal reconciles the invoice to Paid', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.6.4 ${compactDateTime}`;
    let invoiceUrl = '', invoiceNumber1 = '', journalItem1 = '';
    let invoiceTotal1 = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`PC#1: Opp="${oppName}" Reseller="${DEAL_REGISTRATION.partnerCompanyName}" journal="${PAYMENT_JOURNAL}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    await test.step('Pre-condition #2: As Thomas, create the Opportunity and a validated single-product Invoice#1 (Steps 1-18)', async () => {
      const setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl; invoiceUrl = setup.invoiceUrl; invoiceNumber1 = setup.invoiceNumber; invoiceTotal1 = setup.invoiceTotal;
      console.log(`  - Invoice#1="${invoiceNumber1}" Total=${invoiceTotal1}`);
      expect(invoiceTotal1).toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 validated');
    });

    await test.step(`Pre-condition #3: As Faye, pre-create a FULL standalone payment via the ${PAYMENT_JOURNAL} journal and read JournalItem#1`, async () => {
      const res = await createStandalonePaymentAsFaye(page, { amount: invoiceTotal1.toFixed(2), journal: PAYMENT_JOURNAL });
      journalItem1 = res.journalItem;
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Payment#1 (Cash) Journal Entry');
    });

    await test.step("Steps to reproduce - Step 1: Still in Faye's session, open Invoice#1", async () => {
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      expect(await invoicePage.getInvoiceNumber()).toBe(invoiceNumber1);
    });

    await test.step('Steps to reproduce - Step 2: The "Outstanding credits" section shows JournalItem#1 with an "Add" button', async () => {
      const present = await invoicePage.isOutstandingCreditPresent(journalItem1);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Outstanding credits (Cash credit)');
      expect(present, `Outstanding credits should list JournalItem#1 ("${journalItem1}")`).toBeTruthy();
    });

    await test.step('Steps to reproduce - Step 3: Click the "Add" button of JournalItem#1', async () => {
      const added = await invoicePage.addOutstandingCredit(journalItem1);
      expect(added, 'Add JournalItem#1 should be clicked').toBeTruthy();
    });

    await test.step('Verification Point 1: Reconciliation row "Paid on <today>" = InvoiceTotal#1', async () => {
      const row = await invoicePage.getReconciliationRow();
      const today = todayMMDDYYYY();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Reconciliation row (Cash)');
      expect(row.label, 'Column 1 should read "Paid on ..."').toMatch(/Paid on/i);
      expect(row.label, `Column 1 should carry today's date (${today})`).toContain(today);
      expect(money(row.amount), 'Column 2 should equal InvoiceTotal#1').toBeCloseTo(invoiceTotal1, 2);
    });

    await test.step('Verification Point 2: Amount Due = $0', async () => {
      const amountDue = await invoicePage.getAmountDue();
      expect(money(amountDue), 'Amount Due should be 0').toBeCloseTo(0, 2);
    });

    await test.step('Verification Point 3: Invoice#1 state = "Paid"', async () => {
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Invoice Paid');
      expect(status, 'Invoice#1 should be Paid').toMatch(/Paid/i);
    });

    await test.step(`Verification Point 4: The Payments tab shows Payment#1 with Payment Journal = ${PAYMENT_JOURNAL}`, async () => {
      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const journals = await invoicePage.getPaymentColumnValues('Payment Journal').catch(() => []);
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount').catch(() => [])).map(money);
      console.log(`  - rows=${rowCount} journals=${JSON.stringify(journals)} amounts=${JSON.stringify(payAmounts)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Payments tab (Cash journal)');
      expect(rowCount, 'Payments tab should display Payment#1').toBeGreaterThan(0);
      expect(journals.some((j) => new RegExp(PAYMENT_JOURNAL, 'i').test(j)), `Payment Journal should be ${PAYMENT_JOURNAL}`).toBeTruthy();
      console.log(`✅ Cash-journal reconciliation: invoice Paid, Amount Due $0, journal=${PAYMENT_JOURNAL}`);
    });
  });
});
