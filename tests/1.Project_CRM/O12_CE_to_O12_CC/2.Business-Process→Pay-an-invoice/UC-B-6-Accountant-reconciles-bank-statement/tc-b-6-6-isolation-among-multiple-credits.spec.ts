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
 *  Test Case ID    : TC.-B.6.6
 *  Manual TC ID    : UC-B.6.6
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    The Reseller carries two outstanding credits (Payment#1 + Payment#2, each a PARTIAL amount). The
 *    accountant reconciles ONLY JournalItem#1 against Invoice#1 and verifies that just that credit is
 *    applied (the invoice stays Open for the remainder), while JournalItem#2 is left untouched and is
 *    still listed in the Outstanding-credits section.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.6\.6:" --project=chromium
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
 *  Pre-condition #3 (as Faye): create Payment#1 = half and Payment#2 = half, each set:
 *        - Partner          = Reseller
 *        - Payment Journal  = Bank Transfer
 *    read JournalItem#1 and JournalItem#2.
 *  Steps to reproduce (as Faye):
 *    1. Open Invoice#1
 *    2. The "Outstanding credits" section shows BOTH JournalItem#1 and JournalItem#2 with "Add" buttons
 *    3. Click the "Add" button of JournalItem#1 ONLY
 *  Verification Point:
 *    1. A single reconciliation row "Paid on <today>" = JournalItem#1's amount
 *    2. Amount Due = InvoiceTotal#1 - JournalItem#1 (invoice still Open)
 *    3. JournalItem#2 is STILL listed in Outstanding credits; JournalItem#1 is no longer listed
 *    4. The Payments tab shows exactly ONE payment (JournalItem#1's amount)
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const todayMMDDYYYY = (): string => {
  const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

test.describe('TC.-B.6.6 - Isolation: reconcile only the targeted credit among several', () => {
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

  test('TC.-B.6.6: Reconciling one outstanding credit leaves the others untouched', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.6.6 ${compactDateTime}`;
    let invoiceUrl = '', invoiceNumber1 = '', journalItem1 = '', journalItem2 = '';
    let invoiceTotal1 = 0, half = 0, remainder = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`PC#1: Opp="${oppName}" Reseller="${DEAL_REGISTRATION.partnerCompanyName}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    await test.step('Pre-condition #2: As Thomas, create the Opportunity and a validated single-product Invoice#1 (Steps 1-18)', async () => {
      const setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl; invoiceUrl = setup.invoiceUrl; invoiceNumber1 = setup.invoiceNumber; invoiceTotal1 = setup.invoiceTotal;
      half = round2(invoiceTotal1 * 0.5); remainder = round2(invoiceTotal1 - half);
      console.log(`  - Invoice#1="${invoiceNumber1}" Total=${invoiceTotal1} half=${half} remainder=${remainder}`);
      expect(invoiceTotal1).toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 validated');
    });

    await test.step('Pre-condition #3 (create Payment#1): As Faye, pre-create standalone Payment#1 = half and read JournalItem#1', async () => {
      const r1 = await createStandalonePaymentAsFaye(page, { amount: half.toFixed(2), stepPrefix: 'Pre-condition #3 (create Payment#1)', paymentLabel: 'Payment#1' });
      journalItem1 = r1.journalItem;
    });

    await test.step('Pre-condition #3 (create Payment#2): Reusing Faye session, pre-create standalone Payment#2 = half and read JournalItem#2', async () => {
      const r2 = await createStandalonePaymentAsFaye(page, { amount: half.toFixed(2), loginFirst: false, stepPrefix: 'Pre-condition #3 (create Payment#2)', paymentLabel: 'Payment#2' });
      journalItem2 = r2.journalItem;
      console.log(`  - JournalItem#1="${journalItem1}" JournalItem#2="${journalItem2}"`);
      expect(journalItem1).not.toBe(journalItem2);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Payment#1 + Payment#2 created');
    });

    await test.step("Steps to reproduce - Step 1: Still in Faye's session, open Invoice#1", async () => {
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      expect(await invoicePage.getInvoiceNumber()).toBe(invoiceNumber1);
    });

    await test.step('Steps to reproduce - Step 2: The "Outstanding credits" section shows BOTH JournalItem#1 and JournalItem#2 with "Add" buttons', async () => {
      const text = await invoicePage.getOutstandingCreditsText();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Outstanding credits (both listed)');
      expect(text.includes(journalItem1), `Outstanding credits should list JournalItem#1 ("${journalItem1}")`).toBeTruthy();
      expect(text.includes(journalItem2), `Outstanding credits should list JournalItem#2 ("${journalItem2}")`).toBeTruthy();
    });

    await test.step('Steps to reproduce - Step 3: Click the "Add" button of JournalItem#1 ONLY', async () => {
      const added = await invoicePage.addOutstandingCredit(journalItem1);
      expect(added, 'Add JournalItem#1 should be clicked').toBeTruthy();
    });

    await test.step('Verification Point 1: A single reconciliation row "Paid on <today>" = JournalItem#1 amount', async () => {
      const rows = await invoicePage.getReconciliationRows();
      const today = todayMMDDYYYY();
      console.log(`  - reconciliation rows=${JSON.stringify(rows)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Single reconciliation row');
      expect(rows.length, 'Exactly one credit should have been applied').toBe(1);
      expect(rows[0].label, `Column 1 should read "Paid on <today>" (${today})`).toContain(today);
      expect(money(rows[0].amount), 'The applied amount should equal JournalItem#1 (half)').toBeCloseTo(half, 2);
    });

    await test.step('Verification Point 2: Amount Due = InvoiceTotal#1 - JournalItem#1 (invoice still Open)', async () => {
      const amountDue = await invoicePage.getAmountDue();
      const status = await invoicePage.getInvoiceStatus();
      console.log(`  - Amount Due="${amountDue}" remainder=${remainder} state="${status}"`);
      expect(money(amountDue), 'Amount Due should equal the remaining balance').toBeCloseTo(remainder, 2);
      expect(status, 'Invoice#1 should still be Open').toMatch(/Open|Posted/i);
    });

    await test.step('Verification Point 3: JournalItem#2 is STILL an outstanding credit; JournalItem#1 is no longer listed', async () => {
      const text = await invoicePage.getOutstandingCreditsText();
      console.log(`  - Outstanding credits now: "${text}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - JournalItem#2 still outstanding');
      expect(text.includes(journalItem2), 'JournalItem#2 should remain an outstanding credit (untouched)').toBeTruthy();
      expect(text.includes(journalItem1), 'JournalItem#1 should no longer be listed (it was applied)').toBeFalsy();
    });

    await test.step('Verification Point 4: The Payments tab shows exactly ONE payment (JournalItem#1 amount)', async () => {
      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount').catch(() => [])).map(money);
      console.log(`  - Payments tab rows=${rowCount} amounts=${JSON.stringify(payAmounts)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Payments tab (one payment)');
      expect(rowCount, 'Only the reconciled payment should appear').toBe(1);
      expect(payAmounts.some((a) => Math.abs(a - half) < 0.01), 'The single payment should equal JournalItem#1 (half)').toBeTruthy();
      console.log('✅ Isolation verified: only JournalItem#1 applied; JournalItem#2 untouched/still outstanding');
    });
  });
});
