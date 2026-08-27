import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import {
  createValidatedInvoiceAsThomas,
  registerFullPaymentAsAccountant,
  deleteCreatedOpportunityAsAdmin,
} from '@helpers/uc-a-8-invoice.helper';

/**
 * ============================================================================================
 *  CRM-12373 - Payment-confirmation email to the payer after a successful payment
 * --------------------------------------------------------------------------------------------
 *  Test Case ID    : CRM-12373_1
 *  Jira            : http://jira.nakivo.com/browse/CRM-12373 (Post-EA - Support Ticket, P1)
 *  Related         : CRM-12330 (duplicate payment INV/2026/8088), CRM-11883 (Stripe webhook fix)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-25
 *  Environment     : pre-production (http://pre-production.nakivo.site/)
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Re-uses the TC.Performance.1.1.6.3 ("Send Invoice") scenario - Opportunity -> Deal Element ->
 *    Quotation -> Sales Order -> Invoice -> VALIDATE -> SEND & PRINT -> SEND - and then drives the
 *    Invoice all the way to "Paid" with REGISTER PAYMENT, to observe what the CRM emails the payer
 *    at the moment the Invoice flips to Paid.
 *
 *  WHY THE PAYMENT IS NOT REGISTERED BY MAX (Sales Manager)
 *    The case was asked for with "REGISTER PAYMENT as manager Max". Verified live on pre-production
 *    (2026-08-25, Invoice INV/2026/2390 in state Open): Max Zaprykutenko has NO "Register Payment"
 *    control - neither in the invoice header nor under the "Action" cog menu. The control is gated on
 *    the group "Accounting & Finance / Billing Manager" (res.groups id 30), which Faye Nguyen and
 *    Yulia Malihonova hold but Max, Veronika and Thomas do not.
 *    So step 22 KEEPS Max in the flow as an asserted role gate (he must NOT be able to pay), and the
 *    payment itself is registered by Faye Nguyen, the accountant who does hold the right.
 *
 *  WHAT THIS CASE COVERS (and what it deliberately does NOT)
 *    CRM-12373's acceptance criteria #1 scopes the confirmation email to a payment made "via the
 *    partner portal (card / Stripe)". The pre-production build carries that feature as
 *    nakivo_sale.payment_confirmation_email - a mail template whose model is payment.transaction,
 *    guarded by the once-only flag payment.transaction.nakivo_payment_confirm_sent and switched on by
 *    ir.config_parameter nakivo_sale.send_payment_confirmation_email = 1.
 *
 *    A back-office REGISTER PAYMENT creates an account.payment and NO payment.transaction, so it never
 *    reaches that hook. This case therefore measures the OTHER side of the boundary: an Invoice can
 *    reach "Paid" through the back office and the payer is emailed nothing. That is the
 *    duplicate-payment exposure that remains open for wire / ACH / manual payments - the very way the
 *    second (duplicate) payment arrived in CRM-12330.
 *
 *    Verification #5 asserts that boundary as it stands today. If it ever FAILS with the email FOUND,
 *    the hook has been widened to cover back-office payments - good news, and the signal to re-verify
 *    CRM-12373 rather than a defect.
 *
 *    The Stripe / partner-portal leg of AC #1 is NOT automated here: the card is typed on the payment
 *    provider's own page, outside the system under test (same reason CRM-11806_1.2.12 is [Manual]).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12373_1:" --project=chromium
 *
 * --------------------------------------------------------------------------------------------
 *  Steps (mirror TC.Performance.1.1.6.3, then continue to Paid)
 * --------------------------------------------------------------------------------------------
 *  Pre-condition:
 *    Build the deal-registration Internal Note from the template with fresh dynamic values each run.
 *
 *  Steps to reproduce #1 - build and send the Invoice (as Thomas):
 *    1-19. Login as Thomas; create the Opportunity; build the DEAL ELEMENT
 *          (Pricelist = Public Pricelist_USD (USD), Payment Term = Immediate Payment,
 *          Order Lines = first product); SAVE; NEW QUOTATION; CONFIRM; CREATE INVOICE;
 *          CREATE AND VIEW INVOICES; remember the Invoice Number; VALIDATE.
 *      20. Press "SEND & PRINT".
 *      21. On the "Send Invoice" window press "SEND".
 *
 *  Steps to reproduce #2 - role gate (as Max, Sales Manager):
 *      22. Log in as Max Zaprykutenko, open the validated Invoice and look for "REGISTER PAYMENT"
 *          in the header and under the "Action" menu. It must NOT be there.
 *
 *  Steps to reproduce #3 - take the Invoice to Paid (as Faye Nguyen, the accountant; the shared
 *  helper emits its canonical steps 20-24 under this section prefix):
 *      20. Log in as Faye and open the Invoice.
 *      21. Click "Register Payment".
 *      22. Payment Amount = the full balance due.
 *      23. Actually Received($) = the same value.
 *      24. Press "Validate" and poll until the Invoice status reads "Paid".
 *
 *  Verification (all read on the paid Invoice form):
 *    1. Max has no "Register Payment" control on the validated Invoice (role gate).
 *    2. The Invoice status is "Paid".
 *    3. The "Payments" tab holds at least one payment row (the payment really posted).
 *    4. The message history is readable and non-empty (guard, so #5 cannot pass for the wrong reason:
 *       the invoice email sent in step 21 must be visible in it).
 *    5. AC #1 / AC #2 on THIS path: the number of "Payment Confirmation" emails in the Invoice
 *       message history. Expected 0 - a back-office payment is outside the implemented
 *       payment.transaction hook.
 *    6. The "Transactions Payment" tab holds 0 payment.transaction rows - the end-user-visible reason
 *       why #5 is 0: there is no transaction for the hook to fire on.
 * ============================================================================================
 */

const TC_ID = 'CRM-12373_1';

// A validated + paid Invoice cannot be cleanly deleted, so the Opportunity is retained (O12 convention).
const SKIP_CLEANUP_OPP = true;

// The confirmation email announced by CRM-12373 (template nakivo_sale.payment_confirmation_email,
// subject "Payment Confirmation - Invoice <number>"). Matched loosely on the distinctive phrases so a
// hyphen/en-dash or a re-worded subject still counts as "the email was sent".
const CONFIRMATION_EMAIL_MARKERS = [
  'Payment Confirmation',
  'confirms that we have received',
];

test.describe(`${TC_ID} - Payment-confirmation email when an Invoice becomes Paid`, () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? '(none reported)'}`);
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test(`${TC_ID}: Verify what the payer is emailed when the Invoice flips to "Paid"`, async ({ page }, testInfo) => {
    // The 19-step invoice chain alone runs ~8 min on pre-prod; this case adds SEND & PRINT/SEND, a
    // re-login as Max for the role gate and a third re-login as Faye to pay, so the default test
    // budget is extended by one script-run allowance.
    test.setTimeout(config.timeouts.test + CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST ${TC_ID} ${compactDateTime}`;

    // Steps to reproduce #1 (1-19): Opportunity -> Deal Element -> Quotation -> SO -> Invoice -> VALIDATE
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
    });
    createdOppUrl = invoice.oppUrl;
    const invoiceUrl = page.url();
    const invoiceNumber = invoice.invoiceNumber;
    console.log(`  - Invoice Number : ${invoiceNumber}`);
    console.log(`  - Invoice Total  : ${invoice.invoiceTotal}`);
    console.log(`  - Invoice URL    : ${invoiceUrl}`);

    await test.step('Steps to reproduce #1 - Step 20: Press "SEND & PRINT"', async () => {
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickSendAndPrint();
      console.log('Send Invoice window opened');
    });

    await test.step('Steps to reproduce #1 - Step 21: On the "Send Invoice" window press "SEND"', async () => {
      const sendMs = await invoicePage.clickSendAndWaitForCompletion();
      console.log(`Invoice sent to the customer (${(sendMs / 1000).toFixed(2)}s)`);
    });

    // Steps to reproduce #2 (22): role gate - Max (Sales Manager) must NOT be able to register payment
    let maxCanRegisterPayment = true;

    await test.step('Steps to reproduce #2 - Step 22: As Max (Sales Manager), open the Invoice and look for "REGISTER PAYMENT"', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_max.username, users.manager_max.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad).catch(() => {});
      const openedAs = await invoicePage.getInvoiceNumber().catch(() => '');
      const statusAsMax = await invoicePage.getInvoiceStatus().catch(() => '');
      console.log(`  - Opened invoice "${openedAs}" as ${users.manager_max.displayName}; status "${statusAsMax}"`);
      maxCanRegisterPayment = await invoicePage.hasRegisterPaymentButton(CommonUtils.waitTimes.abnormalWait);
      console.log(`  - "Register Payment" available to Max: ${maxCanRegisterPayment}`);
    });

    // Steps to reproduce #3 (20-24): register full payment as Faye -> the Invoice becomes Paid
    const { paymentAmount } = await registerFullPaymentAsAccountant(page, invoiceUrl, 'Steps to reproduce #3');
    console.log(`  - Payment registered by ${users.accountance_ic_faye.displayName}: "${paymentAmount}"`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Invoice paid (back office, as Faye)`);

    // Read every observation from the paid Invoice form
    let invoiceStatus = '';
    let paymentRowCount = 0;
    let paymentStatuses: string[] = [];
    let transactionRowCount = -1;
    let transactionTabOpened = false;
    let chatterPresent = false;
    let chatterText = '';
    let confirmationHits = 0;

    await test.step('Verification - Read the paid Invoice: status, Payments tab, Transactions Payment tab and message history', async () => {
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await invoicePage.getInvoiceNumber().catch(() => '');

      invoiceStatus = await invoicePage.getInvoiceStatus().catch(() => '');
      console.log(`  - Invoice status: "${invoiceStatus}"`);

      await invoicePage.openNotebookTab('Payments').catch(() => {});
      paymentRowCount = await invoicePage.getPaymentRowCount();
      paymentStatuses = await invoicePage.getPaymentColumnValues('Status').catch(() => [] as string[]);
      console.log(`  - Payment rows: ${paymentRowCount}`);
      console.log(`  - Payment row Status values: ${paymentStatuses.length ? paymentStatuses.join(' | ') : '(none read)'}`);

      try {
        await invoicePage.openNotebookTab('Transactions Payment');
        transactionTabOpened = true;
        transactionRowCount = await invoicePage.getTransactionRowCount();
      } catch (e) {
        console.log(`  - "Transactions Payment" tab could not be opened: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }

      chatterPresent = await invoicePage.hasChatter(CommonUtils.waitTimes.checkingChatterLog);
      chatterText = await invoicePage.getChatterText(CommonUtils.waitTimes.checkingChatterLog);

      for (const marker of CONFIRMATION_EMAIL_MARKERS) {
        const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hits = (chatterText.match(new RegExp(escaped, 'gi')) || []).length;
        console.log(`  - Message-history hits for "${marker}": ${hits}`);
        confirmationHits += hits;
      }
    });

    await test.step('Verification - Print the VERIFY block and assert', async () => {
      const chatterReadable = chatterPresent && chatterText.length > 0;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - Role gate: "Register Payment" for Max (Sales Manager):');
      console.log('     Expected : NOT available (gated on "Accounting & Finance / Billing Manager")');
      console.log(`     Actual   : ${maxCanRegisterPayment ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
      console.log(`     Result   : ${maxCanRegisterPayment ? 'FAIL' : 'PASS'}`);
      console.log('  Verify #2 - Invoice status after REGISTER PAYMENT (as Faye):');
      console.log('     Expected : Paid');
      console.log(`     Actual   : ${invoiceStatus || '(not read)'}`);
      console.log(`     Result   : ${/Paid/i.test(invoiceStatus) ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Payment recorded on the "Payments" tab:');
      console.log('     Expected : at least 1 payment row');
      console.log(`     Actual   : ${paymentRowCount} row(s)${paymentStatuses.length ? ` [${paymentStatuses.join(' | ')}]` : ''}`);
      console.log(`     Result   : ${paymentRowCount >= 1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - Message history readable (guard for Verify #5):');
      console.log('     Expected : chatter present and non-empty');
      console.log(`     Actual   : present=${chatterPresent}, ${chatterText.length} chars`);
      console.log(`     Result   : ${chatterReadable ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - CRM-12373 AC#1/AC#2 on the BACK-OFFICE Paid path:');
      console.log('     Expected : 0 "Payment Confirmation" email(s) - a back-office payment creates no');
      console.log('                payment.transaction, so the implemented hook does not fire');
      console.log(`     Actual   : ${confirmationHits} marker hit(s) in the Invoice message history`);
      console.log(`     Result   : ${confirmationHits === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #6 - "Transactions Payment" tab (payment.transaction rows):');
      console.log('     Expected : 0 rows - nothing for the confirmation-email hook to fire on');
      console.log(`     Actual   : ${transactionTabOpened ? `${transactionRowCount} row(s)` : 'tab could not be opened'}`);
      console.log(`     Result   : ${transactionTabOpened && transactionRowCount === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(
        `OVERALL: Invoice ${invoiceNumber} reached "${invoiceStatus}" via a back-office payment and the payer received ${confirmationHits === 0 ? 'NO' : String(confirmationHits)} payment-confirmation email.`
      );

      console.log('\n---------- CRM-12373 acceptance-criteria coverage ----------');
      console.log('  AC#1 (portal card/Stripe payment -> one confirmation email):');
      console.log('       NOT covered by this case - the card is typed on the provider page,');
      console.log('       outside the system under test. Needs a manual Stripe run.');
      console.log('  AC#2 (exactly one email per payment):');
      console.log('       NOT covered here - no payment.transaction is created on this path.');
      console.log('  AC#3 (works for every acquirer on the same done hook, not Stripe-only):');
      console.log('       This case shows the hook does NOT extend to a back-office REGISTER PAYMENT,');
      console.log('       so a wire / ACH / manually recorded payment emails the payer nothing.');
      console.log('  AC#4 (final wording confirmed with Anton / Finance): process gate, not automatable.');
      console.log('-----------------------------------------------------------');

      expect(
        maxCanRegisterPayment,
        'Verify #1 - Max (Sales Manager) should have NO "Register Payment" control on the validated Invoice; it is gated on "Accounting & Finance / Billing Manager"'
      ).toBeFalsy();
      expect(invoiceStatus, 'Verify #2 - after REGISTER PAYMENT the Invoice should read "Paid"').toMatch(/Paid/i);
      expect(paymentRowCount, 'Verify #3 - the paid Invoice should list at least one payment row').toBeGreaterThanOrEqual(1);
      expect(chatterReadable, 'Verify #4 - the Invoice message history must be readable, otherwise Verify #5 proves nothing').toBeTruthy();
      expect(
        confirmationHits,
        'Verify #5 - a back-office REGISTER PAYMENT is outside the implemented payment.transaction hook, so NO "Payment Confirmation" email is expected in the Invoice message history. A failure here means the hook now also covers back-office payments - re-verify CRM-12373 instead of treating this as a defect.'
      ).toBe(0);
      expect(
        transactionTabOpened,
        'Verify #6 - the "Transactions Payment" tab must be readable, otherwise the transaction count proves nothing'
      ).toBeTruthy();
      expect(
        transactionRowCount,
        'Verify #6 - a back-office payment must create NO payment.transaction, which is why the confirmation-email hook never fires'
      ).toBe(0);
    });

    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Paid Invoice message history`);
  });
});
