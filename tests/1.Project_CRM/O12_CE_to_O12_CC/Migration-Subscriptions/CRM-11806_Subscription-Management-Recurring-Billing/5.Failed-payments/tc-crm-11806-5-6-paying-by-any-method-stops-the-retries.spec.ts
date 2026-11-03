import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { logVerify, parseMMDDYYYY, dayDiff } from '@helpers/crm-11806-subscription.helper';
import { loginAsCrmAdminMig } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_5.6 - Paying a failed cycle's invoice by any method stops the retries
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_5.6
 *  Xray:            CRM-14094
 *  Spec ID:         IS-CRM-FUNC-0194, IS-CRM-FUNC-0145
 *                   Spec text  : paying the invoice of a failed cycle by any method stops the
 *                                retries (0194); the cycle then advances by one billing interval
 *                                (0145).
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v5 (2026-11-02), which SUPERSEDES the FRD.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v5, 2026-11-02)
 *  Jira:            CRM-13832 (the spec question that added it) / CRM-11806 (feature)
 *  Automation-Type: new (no pre-production baseline - 0194 is new in spec v5)
 *  Automation-Date: 2026-11-03
 * --------------------------------------------------------------------------------------------
 *  WHY THIS CASE EXISTS
 *  IS-CRM-FUNC-0194 was added to spec v5 on 2026-11-02 (Aiva, CRM-13832). No test case covered
 *  it before: 5.1 and 5.2 check what a DECLINE does, never what a later manual payment stops.
 * --------------------------------------------------------------------------------------------
 *  ⛔ SKIPPED - the same two blockers as CRM-11806_5.5, which it continues:
 *
 *   1. CRM-13821 - the picked card is cleared from "Payment Token" on save, so the declining test
 *      card cannot be left on S. SubscriptionPageEmbed.setPaymentToken() is also notPorted().
 *   2. CRM-13828 - crm-mig has no daily billing run, and step 2 IS a billing run: without it
 *      there is nothing to prove the retries stopped.
 *
 *  TO UNBLOCK: run CRM-11806_5.5 to its end first (it leaves invoice N validated and sent), then
 *  set READY_FOR_VERIFICATION = true with that Reference, and change `test.skip(` to `test(`.
 * --------------------------------------------------------------------------------------------
 *  MEASUREMENT NOTE for VP2 - why the count is a DELTA, not an absolute.
 *  InvoicePage.getTransactionRowCount() counts `payment.transaction` rows on the "Transactions
 *  Payment" tab. A back-office REGISTER PAYMENT creates an `account.payment` and NO
 *  `payment.transaction`, so step 1 does not add a row. The declined automatic attempts of the
 *  pre-condition DID add rows. So the question "was collection re-attempted?" is answered by
 *  comparing the count AFTER the billing run against the count BEFORE it - never by an absolute
 *  number, which would silently depend on how many days Dev had already run.
 * --------------------------------------------------------------------------------------------
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription service https://subscription-crm-mig.nakivo.site (Odoo 19)
 *
 *  DATA: creates nothing of its own; it registers a payment on an invoice Dev's run produced.
 *  Nothing to tear down - and NOTHING migrated is edited, because S is a case-made subscription.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors CRM-14094 - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (https://crm-mig.nakivo.site) as Subscription staff Ho Quoc Anh (admin_crm_mig)
 *    Set up subscription S and invoice N exactly as in CRM-11806_5.5, up to and including
 *      validating and sending invoice N. Write down "Date of Next Invoice" as D and the
 *      Recurring Price as P.
 *    This case runs through the DAILY BILLING RUN ("Subscriptions management").
 *
 *  Steps to reproduce:
 *   1. On invoice N click "REGISTER PAYMENT", register the full amount P through a manual journal
 *      (e.g. Bank) - NOT through the stored card - then read the invoice status
 *   2. Have the daily billing run process S once more, then open invoice N and read its
 *      "Transactions Payment" tab
 *   3. Open S and read "Date of Next Invoice"
 *   4. Read S's stage bar and the message history (chatter) of S
 *
 *  Verification Points:
 *   VP1. Invoice N reads Paid
 *   VP2. No further collection was attempted for that cycle: no new payment transaction with
 *        state Error was added (IS-CRM-FUNC-0194)
 *   VP3. "Date of Next Invoice" has moved forward by one billing interval from D
 *        (IS-CRM-FUNC-0145) - the cycle is settled
 *   VP4. S is still In Progress; no termination notice and no further payment reminder was sent
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_5\.6:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_5.6';

/** Set to true only after CRM-11806_5.5 has left invoice N validated and sent. */
const READY_FOR_VERIFICATION = false;

/** The subscription Reference carrying the failed-then-validated cycle. */
const TARGET_SUBSCRIPTION_REFERENCE = '';

/** "Date of Next Invoice" (D) before the payment, as the form shows it. */
const DATE_BEFORE_PAYMENT = '';

/** The Monthly interval of IS-CRM-FUNC-0145, and the tolerance the suite uses for a month. */
const INTERVAL_MONTHS = 1;
const NEXT_DATE_TOLERANCE_DAYS = 2;

test.describe(`${TC_ID} - Paying a failed cycle's invoice by any method stops the retries`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip(`${TC_ID}: Paying a failed cycle's invoice by any method stops the retries @blocked-devrun @blocked-embed-port`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    expect(READY_FOR_VERIFICATION, 'READY_FOR_VERIFICATION must be true: CRM-11806_5.5 has to run first').toBe(true);
    expect(TARGET_SUBSCRIPTION_REFERENCE, 'TARGET_SUBSCRIPTION_REFERENCE must name that subscription').not.toBe('');
    expect(DATE_BEFORE_PAYMENT, 'DATE_BEFORE_PAYMENT must carry D, the next billing date before the payment').not.toBe('');

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    let transactionsBefore = -1;

    await test.step('Pre-condition: open invoice N of the failed cycle', async () => {
      await loginAsCrmAdminMig(page);
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const hits = await subscriptionPage.searchInList(TARGET_SUBSCRIPTION_REFERENCE);
      expect(hits, `the Subscriptions list should hold exactly 1 "${TARGET_SUBSCRIPTION_REFERENCE}"`).toBe(1);

      await subscriptionPage.openInvoices();
      await invoicePage.openNotebookTab('Transactions Payment');
      transactionsBefore = await invoicePage.getTransactionRowCount();
      console.log(`  - Payment transactions BEFORE the payment: ${transactionsBefore} (the declined attempts)`);
    });

    await test.step('Step 1: Click "REGISTER PAYMENT" and register the full amount P through a manual journal', async () => {
      await invoicePage.clickRegisterPayment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const status = await invoicePage.getInvoiceStatus().catch(() => '');

      logVerify('VP1', 'Invoice N reads Paid', `invoice status = "${status}"`, /paid/i.test(status));
      expect(status, 'VP1: after registering the full amount the invoice should read Paid').toMatch(/paid/i);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - invoice paid by a manual journal').catch(() => {});
    });

    await test.step('Step 2: Billing run once more, then read the "Transactions Payment" tab of invoice N', async () => {
      console.log(`Dev runs "Subscriptions management" once for ${TARGET_SUBSCRIPTION_REFERENCE}.`);

      await invoicePage.openNotebookTab('Transactions Payment');
      const transactionsAfter = await invoicePage.getTransactionRowCount();
      const added = transactionsAfter - transactionsBefore;

      logVerify(
        'VP2',
        'No further collection was attempted for that cycle: no new payment transaction with state Error was added (IS-CRM-FUNC-0194)',
        `payment transactions ${transactionsBefore} -> ${transactionsAfter} (delta ${added})`,
        added === 0,
      );
      expect(added, 'VP2: paying the invoice must stop the retries - no new payment transaction (IS-CRM-FUNC-0194)').toBe(0);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - payment transactions after the billing run').catch(() => {});
    });

    await test.step('Step 3: Open S and read "Date of Next Invoice"', async () => {
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      await subscriptionPage.searchInList(TARGET_SUBSCRIPTION_REFERENCE);

      const nextInvoice = await subscriptionPage.getDateOfNextInvoice();
      const before = parseMMDDYYYY(DATE_BEFORE_PAYMENT);
      const after = parseMMDDYYYY(nextInvoice);
      const expected = before
        ? new Date(before.getFullYear(), before.getMonth() + INTERVAL_MONTHS, before.getDate())
        : null;
      const diff = after && expected ? Math.abs(dayDiff(after, expected)) : 999;

      logVerify(
        'VP3',
        `"Date of Next Invoice" has moved forward by one billing interval from D ("${DATE_BEFORE_PAYMENT}") (IS-CRM-FUNC-0145) - the cycle is settled`,
        `"Date of Next Invoice" = "${nextInvoice}" (diff ${diff} day(s) from the expected one)`,
        diff <= NEXT_DATE_TOLERANCE_DAYS,
      );
      expect(after, `VP3: "Date of Next Invoice" should be parseable (got "${nextInvoice}")`).not.toBeNull();
      expect(diff, 'VP3: a settled cycle should advance by one billing interval (IS-CRM-FUNC-0145)').toBeLessThanOrEqual(NEXT_DATE_TOLERANCE_DAYS);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - next billing date after payment').catch(() => {});
    });

    await test.step('Step 4: Read S\'s stage bar and the message history (chatter) of S', async () => {
      const stage = await subscriptionPage.getState();
      const chatter = await subscriptionPage.getChatterText().catch(() => '');
      const terminationNotice = /autopay\s*failed|termination\s+of\s+subscription|closed\s+automatically/i.test(chatter);
      const furtherReminder = /AutoPay\s*To\s*Retry/i.test(chatter.split(/paid/i).pop() || '');

      logVerify(
        'VP4',
        'S is still In Progress; no termination notice and no further payment reminder was sent',
        `stage = "${stage}"; termination notice = ${terminationNotice}; reminder after the payment = ${furtherReminder}`,
        stage === 'In Progress' && !terminationNotice && !furtherReminder,
      );
      expect(stage, 'VP4: a settled subscription should still be In Progress').toBe('In Progress');
      expect(terminationNotice, 'VP4: no termination notice should be sent once the cycle is paid').toBe(false);
      expect(furtherReminder, 'VP4: no further payment reminder should follow the payment (IS-CRM-FUNC-0194)').toBe(false);

      console.log(`✅ ${TC_ID}: paying the invoice stopped the retries and advanced the cycle`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - stage bar and chatter').catch(() => {});
    });
  });
});
