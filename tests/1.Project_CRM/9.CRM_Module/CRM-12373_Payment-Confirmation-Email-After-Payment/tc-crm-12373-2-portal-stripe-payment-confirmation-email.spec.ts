import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-12373 - Payment-confirmation email after a PORTAL CARD (Stripe) payment
 * --------------------------------------------------------------------------------------------
 *  Test Case ID    : CRM-12373_2
 *  Jira            : http://jira.nakivo.com/browse/CRM-12373 (Post-EA - Support Ticket, P1)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-25
 *  Environment     : pre-production (http://pre-production.nakivo.site/)
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Drives the acceptance path CRM-12373 actually specifies: a Reseller pays an OPEN invoice with a
 *    credit card in the partner portal, which creates a `payment.transaction` and therefore reaches the
 *    hook that the confirmation-email feature is built on
 *    (template `nakivo_sale.payment_confirmation_email`, model payment.transaction, once-only flag
 *    `nakivo_payment_confirm_sent`, switched on by `nakivo_sale.send_payment_confirmation_email = 1`).
 *
 *    This is the counterpart of CRM-12373_1, which showed that a BACK-OFFICE Register Payment creates
 *    only an `account.payment` (`transaction_ids = []`) and so emails the payer nothing.
 *
 *  WHY THIS IS AUTOMATABLE (CRM-11806_1.2.12 assumed it was not)
 *    Probed on pre-prod 2026-08-25: "Pay now" expands the `#pay_with` block ON THE INVOICE PAGE. The
 *    card fields are Stripe.js v3 Elements mounted in iframes served from js.stripe.com - they are not
 *    a provider-hosted page - so Playwright can type into them. Acquirer 8 "Stripe (Credit Сard)" runs
 *    with `environment = test` (publishable key `pk_test_...`), so Stripe test cards are accepted.
 *    Residual risk: the page also loads Stripe's INVISIBLE hCAPTCHA; if it ever challenges, this case
 *    fails at the submit step and has to be re-run or done by hand.
 *
 *  TEST DATA - this run pays a specific pre-existing invoice, approved by the tester:
 *    Invoice INV/2026/2397 (backend id 197505), Open, amount due $93.21 of a $279.65 total,
 *    payer TEST-Reseller#Automation-Jun10 (res.partner 627556, has an email on file).
 *    Paying a part-paid invoice also proves the email carries the amount ACTUALLY PAID ($93.21), not
 *    the invoice total. Retarget by editing the constants below. NOTE the invoice is consumed by a
 *    successful run (it becomes Paid), so a re-run needs a different OPEN invoice for the same partner.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12373_2:" --project=chromium
 *
 * --------------------------------------------------------------------------------------------
 *  Steps to reproduce:
 *    1. Log in to the partner portal as Reseller_1 (the payer partner's portal user).
 *    2. Open "My invoices" and open the OPEN invoice.
 *    3. Confirm the invoice offers "PAY NOW" and read the amount due.
 *    4. Click "PAY NOW" and confirm the payment block offers the Stripe acquirer; select it.
 *    5. Type the Stripe test card: number 4242 4242 4242 4242, expiry 12/29, CVC 123, ZIP 10001.
 *    6. Press "PAY NOW" to submit the payment.
 *    7. Poll the portal invoice until it reports the invoice is paid.
 *    8. As an admin, open the same invoice in the back office and read the "Transactions Payment" tab.
 *
 *  Verification:
 *    1. The portal offered the Stripe acquirer ("new_8") in the payment block.
 *    2. Stripe accepted the card data (each Element echoed the typed value back).
 *    3. The payment was submitted without a portal/Stripe error.
 *    4. The portal reports "This invoice is paid".
 *    5. The back-office invoice status is "Paid".
 *    6. The "Transactions Payment" tab holds exactly 1 payment.transaction row - the record the
 *       confirmation-email hook fires on (contrast: CRM-12373_1 leaves it at 0).
 * ============================================================================================
 */

const TC_ID = 'CRM-12373_2';

// --- Test data (tester-approved target for this run) ---
const INVOICE_NUMBER = 'INV/2026/2397';
const INVOICE_BACKEND_ID = '197505';

// The confirmation email now has to land in the invoice's own message history (CRM-12373 comment
// 686528, 2026-08-25: previously it was attached to the payment only and was invisible there).
// Matched on the distinctive phrases so a re-worded subject still counts.
const CONFIRMATION_EMAIL_MARKERS = ['Payment Confirmation', 'confirms that we have received'];

// Stripe test card - valid in test mode, no 3-D Secure challenge.
const TEST_CARD = {
  number: '4242424242424242',
  expiry: '1229',
  cvc: '123',
  zip: '10001',
};

// Acquirer radio value in #pay_with: "new_<payment.acquirer id>"; 8 = "Stripe (Credit Сard)" on pre-prod.
const STRIPE_ACQUIRER_VALUE = 'new_8';

test.describe(`${TC_ID} - Portal card payment sends the payer a confirmation email`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? '(none reported)'}`);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
  });

  test(`${TC_ID}: Verify a portal Stripe card payment creates a payment.transaction and pays the invoice`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const portal = new ResellerPortalPage(page);
    const invoicePage = new InvoicePage(page);

    let portalInvoiceUrl = '';
    let hasPayNow = false;
    let amountDue = '';
    let acquirerValues: string[] = [];
    let cardEcho = { number: '', expiry: '', cvc: '', zip: '' };
    let navigatedTo = '';
    let paymentError = '';
    let portalPaid = false;
    let backendStatus = '';
    let transactionRows = -1;
    let transactionTabOpened = false;
    let chatterPresent = false;
    let chatterText = '';
    let confirmationHits = 0;

    await test.step('Steps to reproduce - Step 1: Log in to the partner portal as Reseller_1', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await portal.waitForPortalReady();
      console.log(`✓ Logged in to the portal as ${users.reseller_bronze.displayName}`);
    });

    await test.step(`Steps to reproduce - Step 2: Open "My invoices" and open ${INVOICE_NUMBER}`, async () => {
      await portal.gotoMyInvoices();
      await portal.searchInvoices(INVOICE_NUMBER);
      await portal.openInvoiceByNumber(INVOICE_NUMBER);
      portalInvoiceUrl = page.url();
      const detailNumber = await portal.getDetailInvoiceNumber().catch(() => '');
      console.log(`  - Portal invoice detail: "${detailNumber}"`);
      console.log(`  - Portal invoice URL   : ${portalInvoiceUrl}`);
      expect(detailNumber, `The portal should open invoice ${INVOICE_NUMBER}`).toContain(INVOICE_NUMBER);
    });

    await test.step('Steps to reproduce - Step 3: Confirm the invoice offers "PAY NOW" and read the amount due', async () => {
      hasPayNow = await portal.hasPayNowButton();
      amountDue = await portal.getDetailTotalAmount().catch(() => '');
      console.log(`  - PAY NOW present: ${hasPayNow} | Amount due: "${amountDue}"`);
      expect(hasPayNow, 'The OPEN invoice should offer a "PAY NOW" button on the portal').toBeTruthy();
    });

    await test.step('Steps to reproduce - Step 4: Click "PAY NOW" and select the Stripe acquirer', async () => {
      await portal.clickPayNow();
      acquirerValues = await portal.getPaymentAcquirerValues();
      expect(
        acquirerValues,
        `The payment block should offer the Stripe acquirer ("${STRIPE_ACQUIRER_VALUE}")`
      ).toContain(STRIPE_ACQUIRER_VALUE);
      await portal.selectPaymentAcquirer(STRIPE_ACQUIRER_VALUE);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - payment block open (Stripe selected)`);
    });

    await test.step('Steps to reproduce - Step 5: Type the Stripe test card (4242 4242 4242 4242, 12/29, 123, 10001)', async () => {
      cardEcho = await portal.fillStripeCardDetails(TEST_CARD);
      console.log(`  - Card number echoed: "${cardEcho.number}"`);
      console.log(`  - Expiry echoed     : "${cardEcho.expiry}"`);
      console.log(`  - CVC echoed        : "${cardEcho.cvc}"`);
      console.log(`  - ZIP echoed        : "${cardEcho.zip || '(no postal Element rendered)'}"`);
      // Compare DIGITS, not the raw text - Stripe re-formats as you type ("1229" -> "12 / 29"). A
      // truthiness check is not enough: a swallowed keystroke leaves "12 / 2", which looks filled but
      // makes Stripe reject the card at submit with "Your expiration date is incomplete".
      const digits = (s: string) => s.replace(/\D/g, '');
      expect(digits(cardEcho.number), 'Stripe should hold the full card number that was typed').toBe(TEST_CARD.number);
      expect(digits(cardEcho.expiry), 'Stripe should hold the full expiry date that was typed').toBe(TEST_CARD.expiry);
      expect(digits(cardEcho.cvc), 'Stripe should hold the full CVC that was typed').toBe(TEST_CARD.cvc);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Stripe card filled`);
    });

    await test.step('Steps to reproduce - Step 6: Press "PAY NOW" to submit the payment', async () => {
      await portal.submitPortalPayment();
      navigatedTo = await portal.waitForPaymentToLeaveTheForm();
      if (!navigatedTo) {
        paymentError = await portal.getPortalPaymentError();
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - payment did NOT submit`);
      }
      console.log(`  - Navigated to: "${navigatedTo || '(no navigation)'}"`);
      console.log(`  - Portal payment error: "${paymentError || '(none)'}"`);
    });

    await test.step('Steps to reproduce - Step 7: Poll the portal invoice until it reports the invoice is paid', async () => {
      portalPaid = await portal.waitForPortalInvoicePaid(portalInvoiceUrl);
      console.log(`  - Portal reports the invoice paid: ${portalPaid}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - portal invoice after payment`);
    });

    await test.step('Steps to reproduce - Step 8: As an admin, read the invoice status and the "Transactions Payment" tab', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});

      const origin = new URL(page.url()).origin;
      await page.goto(
        `${origin}/web?#id=${INVOICE_BACKEND_ID}&action=289&model=account.invoice&view_type=form&menu_id=148`,
        { waitUntil: 'domcontentloaded' }
      );
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await invoicePage.getInvoiceNumber().catch(() => '');

      backendStatus = await invoicePage.getInvoiceStatus().catch(() => '');
      console.log(`  - Back-office invoice status: "${backendStatus}"`);

      try {
        await invoicePage.openNotebookTab('Transactions Payment');
        transactionTabOpened = true;
        transactionRows = await invoicePage.getTransactionRowCount();
      } catch (e) {
        console.log(`  - "Transactions Payment" tab could not be opened: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - back-office Transactions Payment tab`);

      // CRM-12373 comment 686528: the confirmation must now appear in the invoice's message history.
      chatterPresent = await invoicePage.hasChatter(CommonUtils.waitTimes.checkingChatterLog);
      chatterText = await invoicePage.getChatterText(CommonUtils.waitTimes.checkingChatterLog);
      for (const marker of CONFIRMATION_EMAIL_MARKERS) {
        const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hits = (chatterText.match(new RegExp(escaped, 'gi')) || []).length;
        console.log(`  - Message-history hits for "${marker}": ${hits}`);
        confirmationHits += hits;
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - invoice log note after payment`);
    });

    await test.step('Verification - Print the VERIFY block and assert', async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - Stripe acquirer offered in the portal payment block:');
      console.log(`     Expected : contains "${STRIPE_ACQUIRER_VALUE}"`);
      console.log(`     Actual   : ${acquirerValues.length ? acquirerValues.join(', ') : '(none)'}`);
      console.log(`     Result   : ${acquirerValues.includes(STRIPE_ACQUIRER_VALUE) ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Stripe accepted the card data (Elements echoed it back):');
      const digitsOf = (s: string) => s.replace(/\D/g, '');
      const cardDataIntact =
        digitsOf(cardEcho.number) === TEST_CARD.number &&
        digitsOf(cardEcho.expiry) === TEST_CARD.expiry &&
        digitsOf(cardEcho.cvc) === TEST_CARD.cvc;
      console.log(`     Expected : digits ${TEST_CARD.number} / ${TEST_CARD.expiry} / ${TEST_CARD.cvc}`);
      console.log(`     Actual   : number="${cardEcho.number}", expiry="${cardEcho.expiry}", cvc="${cardEcho.cvc}", zip="${cardEcho.zip}"`);
      console.log(`     Result   : ${cardDataIntact ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - The payment submitted without a portal/Stripe error:');
      console.log('     Expected : the page leaves the payment form, no error text');
      console.log(`     Actual   : navigatedTo="${navigatedTo || '(none)'}", error="${paymentError || '(none)'}"`);
      console.log(`     Result   : ${navigatedTo && !paymentError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - The portal reports the invoice is paid:');
      console.log('     Expected : "This invoice is paid" shown');
      console.log(`     Actual   : ${portalPaid}`);
      console.log(`     Result   : ${portalPaid ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - Back-office invoice status:');
      console.log('     Expected : Paid');
      console.log(`     Actual   : ${backendStatus || '(not read)'}`);
      console.log(`     Result   : ${/Paid/i.test(backendStatus) ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #6 - "Transactions Payment" tab (payment.transaction rows):');
      console.log('     Expected : exactly 1 row - the record the confirmation-email hook fires on');
      console.log(`     Actual   : ${transactionTabOpened ? `${transactionRows} row(s)` : 'tab could not be opened'}`);
      console.log(`     Result   : ${transactionTabOpened && transactionRows === 1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #7 - Confirmation email appears in the INVOICE message history (CRM-12373 fix):');
      console.log('     Expected : at least 1 "Payment Confirmation" entry in the invoice log note');
      console.log(`     Actual   : chatter present=${chatterPresent}, ${chatterText.length} chars, ${confirmationHits} marker hit(s)`);
      console.log(`     Result   : ${chatterPresent && confirmationHits >= 1 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(
        `OVERALL: portal card payment of ${amountDue || '(amount not read)'} on ${INVOICE_NUMBER} -> portalPaid=${portalPaid}, backendStatus="${backendStatus}", payment.transaction rows=${transactionRows}.`
      );
      console.log('\nNEXT (email assertion): read Settings > Technical > Email > Emails and confirm exactly');
      console.log('one message with subject "Payment Confirmation - Invoice <number>" addressed to the payer,');
      console.log('and that the transaction\'s "Payment Confirmation Email Sent" flag is set.');

      expect(acquirerValues, `Verify #1 - the portal payment block should offer "${STRIPE_ACQUIRER_VALUE}"`).toContain(STRIPE_ACQUIRER_VALUE);
      expect(cardEcho.number, 'Verify #2 - Stripe should echo the typed card number back').toBeTruthy();
      expect(cardEcho.expiry, 'Verify #2 - Stripe should echo the typed expiry back').toBeTruthy();
      expect(cardEcho.cvc, 'Verify #2 - Stripe should echo the typed CVC back').toBeTruthy();
      expect(paymentError, `Verify #3 - the portal/Stripe should report no payment error, got: "${paymentError}"`).toBe('');
      expect(navigatedTo, 'Verify #3 - submitting the payment should navigate away from the payment form').toBeTruthy();
      expect(portalPaid, 'Verify #4 - the portal invoice should report "This invoice is paid"').toBeTruthy();
      expect(backendStatus, 'Verify #5 - the back-office invoice should read "Paid"').toMatch(/Paid/i);
      expect(transactionTabOpened, 'Verify #6 - the "Transactions Payment" tab must be readable').toBeTruthy();
      expect(
        transactionRows,
        'Verify #6 - a portal card payment must create exactly one payment.transaction (the record the confirmation-email hook fires on)'
      ).toBe(1);
      expect(chatterPresent, 'Verify #7 - the invoice message history must be readable').toBeTruthy();
      expect(
        confirmationHits,
        'Verify #7 - after the CRM-12373 fix the confirmation email must appear in the INVOICE log note, not only against the payment'
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
