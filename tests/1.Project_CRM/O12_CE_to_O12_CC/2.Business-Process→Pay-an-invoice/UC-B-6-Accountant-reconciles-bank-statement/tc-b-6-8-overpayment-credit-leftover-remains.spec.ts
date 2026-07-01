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
 *  Test Case ID    : TC.-B.6.8
 *  Manual TC ID    : UC-B.6.8
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    As Faye pre-create a standalone Customer Payment (Payment#1) LARGER than InvoiceTotal#1 and read
 *    JournalItem#1. Reconcile it against Invoice#1 and verify Odoo applies only the invoice residual
 *    (the invoice becomes Paid, Amount Due $0) while the over-payment leftover stays with the credit
 *    (the offered credit amount > the amount applied to the invoice).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.6\.8:" --project=chromium
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
 *  Pre-condition #3 (as Faye): create Payment#1 = InvoiceTotal#1 + extra (over-payment), Bank Transfer; read JournalItem#1.
 *  Steps to reproduce (as Faye):
 *    1. Open Invoice#1
 *    2. The "Outstanding credits" section shows JournalItem#1 (amount = the full over-payment) with "Add"
 *    3. Click the "Add" button of JournalItem#1
 *  Verification Point:
 *    1. The reconciliation row "Paid on <today>" applies only InvoiceTotal#1 (NOT the full over-payment)
 *    2. Amount Due = $0
 *    3. Invoice#1 state = "Paid"
 *    4. Leftover: the offered credit amount (over) was greater than the amount applied (InvoiceTotal#1)
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const todayMMDDYYYY = (): string => {
  const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

test.describe('TC.-B.6.8 - Over-payment credit fully pays the invoice; leftover remains', () => {
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

  test('TC.-B.6.8: An over-payment credit pays the invoice in full and leaves a leftover credit', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.6.8 ${compactDateTime}`;
    let invoiceUrl = '', invoiceNumber1 = '', journalItem1 = '';
    let invoiceTotal1 = 0, over = 0, creditOffered = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`PC#1: Opp="${oppName}" Reseller="${DEAL_REGISTRATION.partnerCompanyName}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    await test.step('Pre-condition #2: As Thomas, create the Opportunity and a validated single-product Invoice#1 (Steps 1-18)', async () => {
      const setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl; invoiceUrl = setup.invoiceUrl; invoiceNumber1 = setup.invoiceNumber; invoiceTotal1 = setup.invoiceTotal;
      over = round2(invoiceTotal1 + round2(invoiceTotal1 * 0.3));
      console.log(`  - Invoice#1="${invoiceNumber1}" Total=${invoiceTotal1} over-payment=${over}`);
      expect(invoiceTotal1).toBeGreaterThan(0);
      expect(over).toBeGreaterThan(invoiceTotal1);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 validated');
    });

    await test.step('Pre-condition #3: As Faye, pre-create an OVER-payment standalone Payment#1 (> InvoiceTotal#1) and read JournalItem#1', async () => {
      const res = await createStandalonePaymentAsFaye(page, { amount: over.toFixed(2) });
      journalItem1 = res.journalItem;
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Payment#1 (over) Journal Entry');
    });

    await test.step("Steps to reproduce - Step 1: Still in Faye's session, open Invoice#1", async () => {
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      expect(await invoicePage.getInvoiceNumber()).toBe(invoiceNumber1);
    });

    await test.step('Steps to reproduce - Step 2: The "Outstanding credits" section shows JournalItem#1 (amount = the full over-payment) with "Add"', async () => {
      const present = await invoicePage.isOutstandingCreditPresent(journalItem1);
      expect(present, `Outstanding credits should list JournalItem#1 ("${journalItem1}")`).toBeTruthy();
      creditOffered = money(await invoicePage.getOutstandingCreditAmount(journalItem1));
      console.log(`  - offered credit amount = ${creditOffered} (over-payment = ${over})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Outstanding credit (over-payment)');
      expect(creditOffered, 'The offered credit should be the full over-payment').toBeCloseTo(over, 2);
    });

    await test.step('Steps to reproduce - Step 3: Click the "Add" button of JournalItem#1', async () => {
      const added = await invoicePage.addOutstandingCredit(journalItem1);
      expect(added, 'Add JournalItem#1 should be clicked').toBeTruthy();
    });

    await test.step('Verification Point 1: The reconciliation row applies only InvoiceTotal#1 (NOT the full over-payment)', async () => {
      const row = await invoicePage.getReconciliationRow();
      const today = todayMMDDYYYY();
      console.log(`  - reconciliation row label="${row.label}" amount="${row.amount}" (applied should = ${invoiceTotal1})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Reconciliation row (applied = total)');
      expect(row.label, `Column 1 should read "Paid on <today>" (${today})`).toContain(today);
      expect(money(row.amount), 'Only the invoice residual (InvoiceTotal#1) should be applied').toBeCloseTo(invoiceTotal1, 2);
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

    await test.step('Verification Point 4: Leftover - the offered credit (over) exceeded the amount applied (InvoiceTotal#1)', async () => {
      const leftover = round2(creditOffered - invoiceTotal1);
      console.log(`  - offered=${creditOffered} applied=${invoiceTotal1} leftover=${leftover}`);
      expect(creditOffered, 'The offered credit should exceed InvoiceTotal#1 (so a leftover remains)').toBeGreaterThan(invoiceTotal1 + 0.01);
      expect(leftover, 'Leftover should be positive (the over-payment surplus)').toBeGreaterThan(0);
      console.log('✅ Over-payment reconciliation: invoice Paid, only InvoiceTotal#1 applied, leftover credit remains');
    });
  });
});
