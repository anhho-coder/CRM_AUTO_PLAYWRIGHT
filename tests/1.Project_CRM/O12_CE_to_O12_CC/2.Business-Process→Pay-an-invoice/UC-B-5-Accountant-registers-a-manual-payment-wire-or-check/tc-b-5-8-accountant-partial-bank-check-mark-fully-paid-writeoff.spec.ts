import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceForPartialPayment, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-b-3-partial-payment.helper';

/**
 * ===========================================================================
 *  UC-B-5  -  Accountant registers a manual payment (wire or check)
 * ===========================================================================
 *  Test Case ID    : TC.-B.5.8
 *  Manual TC ID    : UC-B.5.8   (folder UC-B-5-Accountant-registers-a-manual-payment-wire-or-check)
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    As Thomas build a validated single-product Invoice; then as Faye (accountant) register ONE PARTIAL
 *    manual check payment (half the total) through the "Bank Check" Payment Journal but choose "Mark
 *    invoice as fully paid" so the remaining difference is written off - and verify the invoice ends
 *    Paid - Amount Due $0 - with a single Payments-tab record (Bank Check) of the partial amount.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.5\.8:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
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
 *
 *  Pre-condition #2  (as Thomas - ends after the invoice is validated):
 *    1-19. Login as Thomas; create the deal-registration Opportunity; create the Deal Element:
 *              - Pricelist      = Public Pricelist_USD
 *              - Payment terms  = Immediate Payment
 *              - Product / Qty  = one product Qty 1
 *          New Quotation; Confirm; Create invoice (Invoiceable
 *          lines) > Create and view invoices; Validate; note Invoice#1 + InvoiceTotal#1.
 *          PartialAmount = round(InvoiceTotal#1 / 2, 2); the remaining is written off.
 *
 *  Steps to reproduce  (as Faye - accountant account):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)
 *    2. Click "Register Payment"
 *    3. In the popup, set Payment Journal = Bank Check
 *    4. Set Payment Amount = PartialAmount (less than the full amount due)
 *    5. Click outside the Payment Amount field -> a "Payment Difference" field appears -> select "Mark invoice as fully paid"
 *    6. Set Actually Received($) = PartialAmount
 *    7. Click "Validate" -> the payment is recorded and the difference written off
 *
 *  Verification Point:
 *    1. Invoice#1 state = "Paid"
 *    2. Amount Due = $0 (the difference was written off)
 *    3. In the "Payments" tab, the payment record has Payment Journal = Bank Check and amount = PartialAmount
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - Financial chain; posted/paid invoice cannot be cleanly deleted -> cleanup SKIPPED (O12 convention).
 *  - "Mark invoice as fully paid" writes off the remaining balance so a single partial check payment
 *    closes the invoice. It requires a "Post Difference In" write-off account (Validate is silently
 *    rejected if empty); the first available account is picked (name-independent, per UC-B-3-10).
 */

const SKIP_CLEANUP_OPP = true;
const JOURNAL = 'Bank Check';
const WRITEOFF_ACCOUNT = ''; // '' = pick the FIRST available write-off account from the dropdown

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;

test.describe('TC.-B.5.8 - Accountant registers a partial check payment then Mark invoice as fully paid (write-off)', () => {
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
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('TC.-B.5.8: Accountant registers a partial Bank Check payment with "Mark invoice as fully paid" (write-off)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.5.8 ${compactDateTime}`;
    let setup = { oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0 };
    let partialAmount = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`Pre-condition #1: Internal Note #1 prepared (Opp "${oppName}", Contact "${leadName}", Partner "${DEAL_REGISTRATION.partnerCompanyName}", Journal "${JOURNAL}")`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    await test.step('Pre-condition #2: As Thomas, create the deal-registration Opportunity and build a validated single-product Invoice (steps 1-19)', async () => {
      setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl;
      partialAmount = round2(setup.invoiceTotal / 2);
      console.log(`  - InvoiceTotal#1 = ${setup.invoiceTotal} | PartialAmount = ${partialAmount} | write-off = ${round2(setup.invoiceTotal - partialAmount)}`);
      expect(partialAmount).toBeGreaterThan(0);
      expect(partialAmount).toBeLessThan(setup.invoiceTotal);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 validated');
    });

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await page.goto(setup.invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.getInvoiceNumber().catch(() => '');
      console.log(`✓ Logged in as Faye and opened Invoice#1 (${setup.invoiceNumber})`);
    });

    await test.step('Step 2: Click "Register Payment"', async () => {
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ Register Payment dialog opened');
    });

    await test.step(`Step 3: In the popup, set Payment Journal = ${JOURNAL}`, async () => {
      const options = await invoicePage.getPaymentJournalOptions().catch(() => [] as string[]);
      console.log(`  - Available Payment Journal options: ${JSON.stringify(options)}`);
      const journalSet = await invoicePage.selectPaymentJournal(JOURNAL);
      expect(journalSet, `Step 3: Payment Journal should be selectable as "${JOURNAL}" (offered: ${JSON.stringify(options)})`).toBeTruthy();
    });

    await test.step('Step 4: Set Payment Amount = PartialAmount (less than the full amount due)', async () => {
      const prefilled = await invoicePage.getPaymentAmount().catch(() => '');
      console.log(`  - Pre-filled balance: "${prefilled}" | PartialAmount = ${partialAmount.toFixed(2)}`);
      await invoicePage.fillPaymentAmount(partialAmount.toFixed(2));
      console.log(`✓ Payment Amount set to PartialAmount = ${partialAmount.toFixed(2)}`);
    });

    await test.step('Step 5: Click outside the Payment Amount field -> a "Payment Difference" field appears -> select "Mark invoice as fully paid"', async () => {
      const diffVisible = await invoicePage.blurPaymentAmountAndAwaitDifference();
      expect(diffVisible, 'A "Payment Difference" field should appear for a partial payment').toBeTruthy();
      const marked = await invoicePage.selectPaymentDifferenceMarkFullyPaid();
      expect(marked, '"Mark invoice as fully paid" should be selected').toBeTruthy();
      expect(await invoicePage.isWriteoffAccountVisible(), 'A "Post Difference In" write-off account field should appear').toBeTruthy();
      if (WRITEOFF_ACCOUNT) {
        await invoicePage.setPostDifferenceAccount(WRITEOFF_ACCOUNT);
      } else {
        const acct = await invoicePage.selectFirstWriteoffAccount();
        expect(acct, 'A write-off account should be selected').toBeTruthy();
      }
      console.log('✓ Payment Difference = "Mark invoice as fully paid" (write-off account set)');
    });

    await test.step('Step 6: Set Actually Received($) = PartialAmount', async () => {
      await invoicePage.fillActuallyReceived(partialAmount.toFixed(2));
      console.log(`✓ Actually Received($) set to ${partialAmount.toFixed(2)}`);
    });

    await test.step('Step 7: Click "Validate" -> the payment is recorded and the difference written off', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      console.log('✓ Payment validated (remaining balance written off)');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - partial check payment + write-off recorded');
    });

    let finalStatus = '', amountDue = '';
    await test.step('Verification Point 1: Invoice#1 state = "Paid"', async () => {
      for (let attempt = 1; attempt <= 6; attempt++) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await invoicePage.dismissErrorDialog();
        await invoicePage.getInvoiceNumber().catch(() => '');
        finalStatus = await invoicePage.getInvoiceStatus().catch(() => '');
        amountDue = await invoicePage.getAmountDue().catch(() => '');
        console.log(`  - Poll ${attempt}/6: status="${finalStatus}" amountDue="${amountDue}"`);
        if (/Paid/i.test(finalStatus)) break;
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }
      expect(finalStatus, 'Invoice#1 should be "Paid" after "Mark invoice as fully paid"').toMatch(/Paid/i);
    });

    await test.step('Verification Point 2: Amount Due = $0 (the difference was written off)', async () => {
      console.log(`  - Amount Due: "${amountDue}"`);
      expect(money(amountDue), 'Amount Due should be $0 (difference written off)').toBeCloseTo(0, 2);
    });

    await test.step(`Verification Point 3: In the "Payments" tab, the payment record has Payment Journal = ${JOURNAL} and amount = PartialAmount`, async () => {
      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount')).map(money);
      const journals = await invoicePage.getPaymentColumnValues('Payment Journal');
      console.log(`  - rows=${rowCount} | amounts=${JSON.stringify(payAmounts)} | journals=${JSON.stringify(journals)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `TC.-B.5.8 - Paid via write-off (1 partial ${JOURNAL} = ${partialAmount})`);
      expect(rowCount, 'There should be exactly 1 payment record').toBe(1);
      expect(journals.length, 'The payment record should expose a Payment Journal').toBeGreaterThan(0);
      journals.forEach((j, idx) => expect(j, `Payment #${idx + 1} Payment Journal should be "${JOURNAL}"`).toContain(JOURNAL));
      expect(payAmounts[0], 'The single payment amount should equal PartialAmount').toBeCloseTo(partialAmount, 2);
      console.log(`✅ "Mark invoice as fully paid" wrote off the balance: invoice Paid from a single ${JOURNAL} partial payment`);
    });
  });
});
