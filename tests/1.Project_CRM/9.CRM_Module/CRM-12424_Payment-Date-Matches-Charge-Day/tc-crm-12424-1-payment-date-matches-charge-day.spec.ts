import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage, PaymentPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ============================================================================================
 *  CRM-12424 - A portal card payment must be dated on the day the card was actually charged
 * --------------------------------------------------------------------------------------------
 *  Test Case ID    : CRM-12424_1
 *  Jira            : http://jira.nakivo.com/browse/CRM-12424 (Bug [Maintenance], P2)
 *  Related         : CRM-12373 (the confirmation email that exposed this)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-26
 *  Environment     : pre-production (http://pre-production.nakivo.site/)
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Verifies Khang's fix (CRM-12424 comment 686788): a portal card payment charged in the window just
 *    after midnight UTC must date the payment, its journal entry AND the confirmation email all on the
 *    day the card was actually charged.
 *
 *    Before the fix, a card charged at 2026-08-26 02:59 UTC produced: payment dated 2026-08-25, journal
 *    entry dated 2026-08-25, confirmation email saying 2026-08-26 - three values, two of them wrong.
 *
 *  MUST RUN IN THE AFTER-MIDNIGHT UTC WINDOW.
 *    The defect only appears when the UTC date and the company's local date differ - roughly 00:00-07:00
 *    UTC. Outside that window the old code produced correct dates too, so a pass would prove nothing.
 *    Verification #1 therefore ASSERTS that the charge really landed in the window and fails the case as
 *    inconclusive if it did not. Schedule the run for ~00:05 UTC (07:05 Asia/Ho_Chi_Minh).
 *
 *  Self-contained: builds its own Opportunity -> Deal Element -> Quotation -> Sales Order -> Invoice and
 *  pays that, so it can be re-run any number of times. Payments already booked before the fix are NOT
 *  re-dated, so an existing invoice cannot be used to verify this.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12424_1:" --project=chromium
 *
 * --------------------------------------------------------------------------------------------
 *  Steps to reproduce:
 *   Pre-condition. As Thomas, build a fresh validated Invoice for the Reseller partner.
 *    1. Log in to the partner portal as Reseller_1 and open that Invoice.
 *    2. Click PAY NOW, choose the card acquirer and pay the full amount with a test card.
 *       Record the UTC timestamp of the charge.
 *    3. Wait until the portal reports the invoice paid.
 *    4. As an admin, open the Invoice and read the confirmation email's "Payment Date" from its log note.
 *    5. Open the payment the invoice created and read its "Payment Date".
 *    6. Open that payment's Journal Items and read the accounting "Date" of every line.
 *
 *  Verification:
 *    1. The charge landed in the after-midnight UTC window (guard - otherwise the case proves nothing).
 *    2. The invoice is Paid with nothing left due.
 *    3. The payment's "Payment Date" equals the charge day.
 *    4. Every Journal Items line's accounting "Date" equals the charge day.
 *    5. The confirmation email's "Payment Date" equals the charge day.
 *    6. All three read the same value as each other.
 * ============================================================================================
 */

const TC_ID = 'CRM-12424_1';

// A validated + paid Invoice cannot be cleanly deleted, so the Opportunity is retained (O12 convention).
const SKIP_CLEANUP_OPP = true;

// Stripe test card - valid in test mode, no 3-D Secure challenge.
const TEST_CARD = { number: '4242424242424242', expiry: '1229', cvc: '123', zip: '10001' };

// Acquirer radio value in #pay_with: "new_<payment.acquirer id>"; 8 = the card acquirer on pre-prod.
const STRIPE_ACQUIRER_VALUE = 'new_8';

// The defect window: the UTC date differs from the company's local date only in the early-morning hours.
const WINDOW_LAST_UTC_HOUR = 7;

/** Normalise a date shown by Odoo to YYYY-MM-DD. Accepts "2026-08-26" and "08/26/2026". */
function toIsoDate(raw: string): string {
  const t = (raw || '').trim();
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  return t;
}

test.describe(`${TC_ID} - Portal card payment is dated on the charge day`, () => {
  let createdOppUrl: string | null = null;

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
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test(`${TC_ID}: Verify the payment, its journal entry and the confirmation email all carry the charge day`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test + CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const paymentPage = new PaymentPage(page);
    const portal = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST ${TC_ID} ${compactDateTime}`;

    let chargeUtcIso = '';
    let chargeUtcDate = '';
    let chargeUtcHour = -1;
    let portalPaid = false;
    let invoiceStatus = '';
    let paymentName = '';
    let paymentDateOnForm = '';
    let journalDates: string[] = [];
    let emailDate = '';

    // Pre-condition: build a fresh validated Invoice as Thomas.
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition',
    });
    createdOppUrl = invoice.oppUrl;
    const invoiceUrl = page.url();
    const invoiceNumber = invoice.invoiceNumber;
    console.log(`  - Invoice Number : ${invoiceNumber}`);
    console.log(`  - Invoice Total  : ${invoice.invoiceTotal}`);

    await test.step('Steps to reproduce - Step 1: Log in to the portal as Reseller_1 and open the Invoice', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await portal.waitForPortalReady();
      await portal.gotoMyInvoices();
      await portal.searchInvoices(invoiceNumber);
      await portal.openInvoiceByNumber(invoiceNumber);
      const opened = await portal.getDetailInvoiceNumber().catch(() => '');
      console.log(`  - Portal invoice detail: "${opened}"`);
      expect(opened, `The portal should open invoice ${invoiceNumber}`).toContain(invoiceNumber);
    });

    const portalInvoiceUrl = page.url();

    await test.step('Steps to reproduce - Step 2: Pay the full amount by card and record the charge time (UTC)', async () => {
      const hasPayNow = await portal.hasPayNowButton();
      expect(hasPayNow, 'The Open invoice should offer PAY NOW on the portal').toBeTruthy();

      await portal.clickPayNow();
      const acquirers = await portal.getPaymentAcquirerValues();
      expect(acquirers, `The payment block should offer "${STRIPE_ACQUIRER_VALUE}"`).toContain(STRIPE_ACQUIRER_VALUE);
      await portal.selectPaymentAcquirer(STRIPE_ACQUIRER_VALUE);

      const echo = await portal.fillStripeCardDetails(TEST_CARD);
      const digits = (s: string) => s.replace(/\D/g, '');
      expect(digits(echo.number), 'Stripe should hold the full card number typed').toBe(TEST_CARD.number);
      expect(digits(echo.expiry), 'Stripe should hold the full expiry typed').toBe(TEST_CARD.expiry);
      expect(digits(echo.cvc), 'Stripe should hold the full CVC typed').toBe(TEST_CARD.cvc);

      await portal.submitPortalPayment();
      // The charge happens as the form posts - stamp the UTC clock here.
      const now = new Date();
      chargeUtcIso = now.toISOString();
      chargeUtcDate = chargeUtcIso.slice(0, 10);
      chargeUtcHour = now.getUTCHours();
      console.log(`  - Charge submitted at ${chargeUtcIso} (UTC date ${chargeUtcDate}, UTC hour ${chargeUtcHour})`);

      const navigatedTo = await portal.waitForPaymentToLeaveTheForm();
      const paymentError = navigatedTo ? '' : await portal.getPortalPaymentError();
      console.log(`  - Navigated to: "${navigatedTo || '(none)'}" | error: "${paymentError || '(none)'}"`);
      expect(paymentError, `The portal/Stripe should report no payment error, got: "${paymentError}"`).toBe('');
      expect(navigatedTo, 'Submitting the payment should navigate away from the payment form').toBeTruthy();
    });

    await test.step('Steps to reproduce - Step 3: Wait until the portal reports the invoice paid', async () => {
      portalPaid = await portal.waitForPortalInvoicePaid(portalInvoiceUrl);
      console.log(`  - Portal reports the invoice paid: ${portalPaid}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - portal invoice paid`);
    });

    await test.step('Steps to reproduce - Step 4: As an admin, read the confirmation email date from the Invoice log note', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});

      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await invoicePage.getInvoiceNumber().catch(() => '');

      invoiceStatus = await invoicePage.getInvoiceStatus().catch(() => '');
      const chatter = await invoicePage.getChatterText(CommonUtils.waitTimes.checkingChatterLog);
      const dateMatch = chatter.match(/Payment Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
      emailDate = dateMatch ? dateMatch[1] : '';
      const nameMatch = chatter.match(/CUST\.[A-Z]{2,}\/\d{4}\/\d+/);
      paymentName = nameMatch ? nameMatch[0] : '';
      console.log(`  - Invoice status: "${invoiceStatus}"`);
      console.log(`  - Confirmation email "Payment Date" from the log note: "${emailDate}"`);
      console.log(`  - Payment named in the log note: "${paymentName}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - invoice log note`);

      expect(emailDate, 'The confirmation email should appear in the Invoice log note with a Payment Date').toBeTruthy();
      expect(paymentName, 'The Invoice log note should name the posted payment').toBeTruthy();
    });

    await test.step('Steps to reproduce - Step 5: Open that payment and read its "Payment Date"', async () => {
      await paymentPage.openCustomerPaymentsListFresh();
      const opened = await paymentPage.openPaymentRowByKey(paymentName);
      expect(opened, `The payment ${paymentName} should be openable from the Payments list`).toBeTruthy();
      paymentDateOnForm = await paymentPage.getPaymentDateOnForm();
    });

    await test.step('Steps to reproduce - Step 6: Open the payment\'s Journal Items and read the accounting Date', async () => {
      await paymentPage.clickJournalItems();
      journalDates = await paymentPage.getJournalItemsColumnValues('Date');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - journal items dates`);
      expect(journalDates.length, 'The payment should have at least one journal item line').toBeGreaterThanOrEqual(1);
    });

    await test.step('Verification - Print the VERIFY block and assert', async () => {
      const inWindow = chargeUtcHour >= 0 && chargeUtcHour < WINDOW_LAST_UTC_HOUR;
      const paymentIso = toIsoDate(paymentDateOnForm);
      const journalIso = journalDates.map(toIsoDate);
      const emailIso = toIsoDate(emailDate);
      const journalAllOnChargeDay = journalIso.length > 0 && journalIso.every((d) => d === chargeUtcDate);
      const allAgree = paymentIso === chargeUtcDate && emailIso === chargeUtcDate && journalAllOnChargeDay;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The charge landed in the after-midnight UTC window (guard):');
      console.log(`     Expected : UTC hour 0-${WINDOW_LAST_UTC_HOUR - 1}`);
      console.log(`     Actual   : ${chargeUtcIso} (UTC hour ${chargeUtcHour})`);
      console.log(`     Result   : ${inWindow ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Invoice status after the portal payment:');
      console.log('     Expected : Paid, portal confirms paid');
      console.log(`     Actual   : "${invoiceStatus}", portalPaid=${portalPaid}`);
      console.log(`     Result   : ${/Paid/i.test(invoiceStatus) && portalPaid ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Payment "Payment Date" equals the charge day:');
      console.log(`     Expected : ${chargeUtcDate}`);
      console.log(`     Actual   : ${paymentIso} (raw "${paymentDateOnForm}")`);
      console.log(`     Result   : ${paymentIso === chargeUtcDate ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - Journal Items accounting Date equals the charge day (every line):');
      console.log(`     Expected : ${chargeUtcDate} on all ${journalIso.length} line(s)`);
      console.log(`     Actual   : ${JSON.stringify(journalIso)} (raw ${JSON.stringify(journalDates)})`);
      console.log(`     Result   : ${journalAllOnChargeDay ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - Confirmation email "Payment Date" equals the charge day:');
      console.log(`     Expected : ${chargeUtcDate}`);
      console.log(`     Actual   : ${emailIso}`);
      console.log(`     Result   : ${emailIso === chargeUtcDate ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #6 - All three values agree with each other:');
      console.log('     Expected : payment = journal = email');
      console.log(`     Actual   : payment=${paymentIso}, journal=${JSON.stringify(journalIso)}, email=${emailIso}`);
      console.log(`     Result   : ${allAgree ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(
        `OVERALL: charge ${chargeUtcIso} on ${invoiceNumber} / ${paymentName} -> payment ${paymentIso}, journal ${JSON.stringify(journalIso)}, email ${emailIso}.`
      );

      expect(
        inWindow,
        `Verify #1 - INCONCLUSIVE, not a defect: the charge ran at UTC hour ${chargeUtcHour}, outside the 00:00-0${WINDOW_LAST_UTC_HOUR}:00 UTC window where the bug appears. Re-run inside the window (schedule ~00:05 UTC).`
      ).toBeTruthy();
      expect(invoiceStatus, 'Verify #2 - the Invoice should read "Paid"').toMatch(/Paid/i);
      expect(portalPaid, 'Verify #2 - the portal should report the invoice paid').toBeTruthy();
      expect(paymentIso, 'Verify #3 - the payment must be dated on the day the card was charged').toBe(chargeUtcDate);
      expect(journalIso, 'Verify #4 - every journal item must be dated on the day the card was charged').toEqual(
        journalIso.map(() => chargeUtcDate)
      );
      expect(emailIso, 'Verify #5 - the confirmation email must state the day the card was charged').toBe(chargeUtcDate);
      expect(allAgree, 'Verify #6 - payment date, journal date and email date must all agree').toBeTruthy();
    });
  });
});
