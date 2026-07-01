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
 *  Test Case ID    : TC.-B.6.5
 *  Manual TC ID    : UC-B.6.5
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    As Thomas build a validated Invoice#1; as Faye pre-create a FULL standalone Customer Payment
 *    (Payment#1) and read JournalItem#1. Reconcile it against Invoice#1 (Paid), then UNRECONCILE it from
 *    the payment-row info popover and verify the invoice reverts to Open with Amount Due = InvoiceTotal#1
 *    and JournalItem#1 returned to the Outstanding-credits section.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.6\.5:" --project=chromium
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
 *  Pre-condition #3 (as Faye): create FULL Payment#1 (Bank Transfer); read JournalItem#1.
 *  Steps to reproduce (as Faye):
 *    1. Open Invoice#1
 *    2. Click "Add" on JournalItem#1 (the invoice becomes Paid)
 *    3. Open the reconciled payment's info popover and click "Unreconcile"
 *  Verification Point:
 *    1. Invoice#1 state reverts to "Open" (no longer Paid)
 *    2. Amount Due is restored to InvoiceTotal#1
 *    3. JournalItem#1 is listed again in the "Outstanding credits" section
 *    4. No "Paid on" reconciliation row remains
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('TC.-B.6.5 - Unreconcile reverts the invoice to Open', () => {
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

  test('TC.-B.6.5: Unreconciling a credit reverts the invoice from Paid back to Open', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.6.5 ${compactDateTime}`;
    let invoiceUrl = '', invoiceNumber1 = '', journalItem1 = '';
    let invoiceTotal1 = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`PC#1: Opp="${oppName}" Reseller="${DEAL_REGISTRATION.partnerCompanyName}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    await test.step('Pre-condition #2: As Thomas, create the Opportunity and a validated single-product Invoice#1 (Steps 1-18)', async () => {
      const setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl; invoiceUrl = setup.invoiceUrl; invoiceNumber1 = setup.invoiceNumber; invoiceTotal1 = setup.invoiceTotal;
      console.log(`  - Invoice#1="${invoiceNumber1}" Total=${invoiceTotal1}`);
      expect(invoiceTotal1).toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 validated');
    });

    await test.step('Pre-condition #3: As Faye, pre-create a FULL standalone Payment#1 and read JournalItem#1', async () => {
      const res = await createStandalonePaymentAsFaye(page, { amount: invoiceTotal1.toFixed(2) });
      journalItem1 = res.journalItem;
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Payment#1 Journal Entry');
    });

    await test.step("Steps to reproduce - Step 1: Still in Faye's session, open Invoice#1", async () => {
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      expect(await invoicePage.getInvoiceNumber()).toBe(invoiceNumber1);
    });

    await test.step('Steps to reproduce - Step 2: Click "Add" on JournalItem#1 (the invoice becomes Paid)', async () => {
      const present = await invoicePage.isOutstandingCreditPresent(journalItem1);
      expect(present, `Outstanding credits should list JournalItem#1 ("${journalItem1}")`).toBeTruthy();
      const added = await invoicePage.addOutstandingCredit(journalItem1);
      expect(added, 'Add JournalItem#1 should be clicked').toBeTruthy();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice#1 after Add: "${status}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Invoice reconciled (Paid)');
      expect(status, 'Invoice#1 should be Paid after the Add').toMatch(/Paid/i);
    });

    await test.step('Steps to reproduce - Step 3: Open the reconciled payment info popover and click "Unreconcile"', async () => {
      const done = await invoicePage.unreconcilePayment(journalItem1);
      expect(done, 'Unreconcile should be clicked').toBeTruthy();
      // Re-open the invoice so the reverted state renders in a clean DOM.
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - After Unreconcile');
    });

    await test.step('Verification Point 1: Invoice#1 state reverts to "Open" (no longer Paid)', async () => {
      const status = await invoicePage.waitForInvoiceStatus('Open');
      console.log(`  - Invoice#1 state after Unreconcile: "${status}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Invoice reverted to Open');
      expect(status, 'Invoice#1 should revert to Open').toMatch(/Open|Posted/i);
      expect(status, 'Invoice#1 should no longer be Paid').not.toMatch(/^Paid$/i);
    });

    await test.step('Verification Point 2: Amount Due is restored to InvoiceTotal#1', async () => {
      const amountDue = await invoicePage.getAmountDue();
      console.log(`  - Amount Due="${amountDue}" (InvoiceTotal#1=${invoiceTotal1})`);
      expect(money(amountDue), 'Amount Due should be restored to InvoiceTotal#1').toBeCloseTo(invoiceTotal1, 2);
    });

    await test.step('Verification Point 3: JournalItem#1 is listed again in the "Outstanding credits" section', async () => {
      const present = await invoicePage.isOutstandingCreditPresent(journalItem1);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Credit returned to Outstanding credits');
      expect(present, `JournalItem#1 ("${journalItem1}") should be an outstanding credit again`).toBeTruthy();
    });

    await test.step('Verification Point 4: No "Paid on" reconciliation row remains', async () => {
      const rowCount = await invoicePage.getPaymentsWidgetRowCount();
      console.log(`  - reconciliation rows remaining: ${rowCount}`);
      expect(rowCount, 'There should be no remaining "Paid on" reconciliation row').toBe(0);
      console.log('✅ Unreconcile verified: invoice Open, Amount Due restored, credit returned, no Paid-on row');
    });
  });
});
