import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { logVerify } from '@helpers/crm-11806-subscription.helper';
import { loginAsCrmAdminMig } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_5.5 - Sales can validate and send the draft invoice of a cycle whose collection
 *                      failed
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_5.5
 *  Xray:            CRM-14093
 *  Spec ID:         IS-CRM-FUNC-0193, IS-CRM-FUNC-0192
 *                   Spec text  : a failed automatic collection keeps ONE draft invoice for the
 *                                cycle, neither validated nor sent (0192); Sales may validate and
 *                                send it so the customer can pay another way (0193).
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v5 (2026-11-02), which SUPERSEDES the FRD.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v5, 2026-11-02)
 *  Jira:            CRM-13832 (the spec question that added it) / CRM-11806 (feature)
 *  Automation-Type: new (no pre-production baseline - 0193 is new in spec v5)
 *  Automation-Date: 2026-11-03
 * --------------------------------------------------------------------------------------------
 *  WHY THIS CASE EXISTS
 *  IS-CRM-FUNC-0193 was added to spec v5 on 2026-11-02 (Aiva, CRM-13832). It is a DELIBERATE
 *  DIVERGENCE FROM PRODUCTION, asked for by Maryna on 4 Sep (CRM-12548): a failed charge leaves a
 *  draft invoice that Sales may validate and send so the customer can pay another way. No test
 *  case covered it before. Because it diverges from Production on purpose, a red here is NOT
 *  automatically a migration defect - compare against the spec, never against Production.
 * --------------------------------------------------------------------------------------------
 *  ⛔ SKIPPED - two blockers, neither of them a defect in this case:
 *
 *   1. CRM-13821 - the picked card is cleared from "Payment Token" on save, so the pre-condition
 *      cannot leave S holding the always-declining test card "XXXXXXXXXXXX0341 (QA decline)".
 *      SubscriptionPageEmbed.setPaymentToken() is also still notPorted().
 *   2. CRM-13828 - crm-mig has no daily billing run. This case needs the scheduled action
 *      "Subscriptions management" to produce the FAILED cycle in the first place. The
 *      "=> Generate Invoice" link is NOT a stand-in: it never attempts a collection, so it cannot
 *      leave the declined draft this case starts from.
 *
 *  TO UNBLOCK: close CRM-13821 and CRM-13828, port setPaymentToken(), then set
 *  READY_FOR_VERIFICATION = true with the Reference Dev ran the failed cycle for, and change
 *  `test.skip(` to `test(`.
 * --------------------------------------------------------------------------------------------
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription service https://subscription-crm-mig.nakivo.site (Odoo 19)
 *
 *  DATA: this case creates nothing of its own - it is handed the subscription Dev ran the failed
 *  cycle for, and it only validates and sends that cycle's existing invoice. Nothing to tear down.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors CRM-14093 - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (https://crm-mig.nakivo.site) as Subscription staff Ho Quoc Anh (admin_crm_mig)
 *    Set up subscription S exactly as in CRM-11806_5.1 - Monthly Subscription, Payment Token =
 *      "XXXXXXXXXXXX0341 (QA decline)", Date of Next Invoice = today (D), Recurring Price = P -
 *      and have the daily billing run process S once, so its first collection attempt is declined.
 *    This case runs through the DAILY BILLING RUN ("Subscriptions management"), not the
 *      "=> Generate Invoice" link.
 *
 *  Steps to reproduce:
 *   1. On S click the "Invoices" smart button and open the invoice of the failed cycle; write down
 *      its number as N
 *   2. As a user holding the right to invoice, click "VALIDATE" on invoice N
 *   3. Send invoice N to the customer ("SEND & PRINT" / "Send by Email")
 *   4. Go back to S and read the "Invoices" smart button and "Date of Next Invoice"
 *
 *  Verification Points:
 *   VP1. Exactly 1 invoice, status Draft - neither validated nor sent to the customer
 *        (IS-CRM-FUNC-0192)
 *   VP2. Invoice N moves out of Draft and becomes payable - an authorized user can validate the
 *        draft of a cycle whose automatic collection failed (IS-CRM-FUNC-0193)
 *   VP3. The invoice is sent: the chatter records the outgoing e-mail to the customer, so the
 *        customer can pay it by another card or payment method (IS-CRM-FUNC-0193)
 *   VP4. Still exactly 1 invoice for the cycle (number N) and "Date of Next Invoice" = D -
 *        validating and sending created no second invoice and did not advance the cycle
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_5\.5:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_5.5';

/** Set to true only after Dev has produced a declined cycle on a subscription. */
const READY_FOR_VERIFICATION = false;

/** The subscription Reference whose first collection Dev had declined. */
const TARGET_SUBSCRIPTION_REFERENCE = '';

/** "Date of Next Invoice" (D) as the form shows it, before validating/sending. */
const EXPECTED_NEXT_INVOICE_DATE = '';

test.describe(`${TC_ID} - Sales can validate and send the draft invoice of a failed cycle`, () => {
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
    // This case creates nothing - it validates and sends an invoice Dev's run already produced.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip(`${TC_ID}: Sales can validate and send the draft invoice of a cycle whose collection failed @blocked-devrun @blocked-embed-port`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    expect(READY_FOR_VERIFICATION, 'READY_FOR_VERIFICATION must be true: Dev has to produce the declined cycle first').toBe(true);
    expect(TARGET_SUBSCRIPTION_REFERENCE, 'TARGET_SUBSCRIPTION_REFERENCE must name that subscription').not.toBe('');

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    let invoiceNumber = '';
    let invoiceCountBefore = -1;

    await test.step('Pre-condition: open the subscription whose first collection was declined', async () => {
      await loginAsCrmAdminMig(page);
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const hits = await subscriptionPage.searchInList(TARGET_SUBSCRIPTION_REFERENCE);
      expect(hits, `the Subscriptions list should hold exactly 1 "${TARGET_SUBSCRIPTION_REFERENCE}"`).toBe(1);
    });

    await test.step('Step 1: Click the "Invoices" smart button and open the invoice of the failed cycle', async () => {
      invoiceCountBefore = await subscriptionPage.getInvoiceCount();
      await subscriptionPage.openInvoices();
      invoiceNumber = await invoicePage.getInvoiceNumber().catch(() => '');
      const status = await invoicePage.getInvoiceStatus().catch(() => '');

      logVerify(
        'VP1',
        'Exactly 1 invoice, status Draft - neither validated nor sent to the customer (IS-CRM-FUNC-0192)',
        `"Invoices" smart button = ${invoiceCountBefore}; invoice ${invoiceNumber || '(number unread)'} status = "${status}"`,
        invoiceCountBefore === 1 && /draft/i.test(status),
      );
      expect(invoiceCountBefore, 'VP1: a failed cycle should leave exactly one invoice').toBe(1);
      expect(status, 'VP1: the failed cycle\'s invoice should be Draft, not validated or sent (IS-CRM-FUNC-0192)').toMatch(/draft/i);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - the draft invoice of the failed cycle').catch(() => {});
    });

    await test.step('Step 2: As a user holding the right to invoice, click "VALIDATE" on invoice N', async () => {
      await invoicePage.clickValidate();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const status = await invoicePage.getInvoiceStatus().catch(() => '');

      logVerify(
        'VP2',
        'Invoice N moves out of Draft and becomes payable - an authorized user can validate the draft of a cycle whose automatic collection failed (IS-CRM-FUNC-0193)',
        `invoice status = "${status}"`,
        !/draft/i.test(status) && status !== '',
      );
      expect(status, 'VP2: after VALIDATE the invoice should no longer be Draft (IS-CRM-FUNC-0193)').not.toMatch(/draft/i);
      expect(status, 'VP2: the invoice status should be readable after VALIDATE').not.toBe('');

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - invoice validated').catch(() => {});
    });

    await test.step('Step 3: Send invoice N to the customer ("SEND & PRINT" / "Send by Email")', async () => {
      await invoicePage.clickSendAndPrint();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const chatter = await invoicePage.getChatterText().catch(() => '');
      const sent = /sent|invoice sent|by e-?mail/i.test(chatter);

      logVerify(
        'VP3',
        'The invoice is sent: the chatter records the outgoing e-mail to the customer, so the customer can pay it by another card or payment method (IS-CRM-FUNC-0193)',
        `outgoing-mail line in the invoice chatter = ${sent}`,
        sent,
      );
      expect(sent, 'VP3: the invoice chatter should record the e-mail sent to the customer (IS-CRM-FUNC-0193)').toBe(true);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - invoice sent to the customer').catch(() => {});
    });

    await test.step('Step 4: Go back to S and read the "Invoices" smart button and "Date of Next Invoice"', async () => {
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      await subscriptionPage.searchInList(TARGET_SUBSCRIPTION_REFERENCE);

      const countAfter = await subscriptionPage.getInvoiceCount();
      const nextInvoice = await subscriptionPage.getDateOfNextInvoice();

      logVerify(
        'VP4',
        `Still exactly 1 invoice for the cycle and "Date of Next Invoice" = D ("${EXPECTED_NEXT_INVOICE_DATE}") - validating and sending created no second invoice and did not advance the cycle`,
        `"Invoices" smart button = ${countAfter}; "Date of Next Invoice" = "${nextInvoice}"`,
        countAfter === 1 && nextInvoice === EXPECTED_NEXT_INVOICE_DATE,
      );
      expect(countAfter, 'VP4: validating and sending must not raise a second invoice').toBe(1);
      expect(nextInvoice, 'VP4: validating and sending must not advance the cycle').toBe(EXPECTED_NEXT_INVOICE_DATE);

      console.log(`✅ ${TC_ID}: the draft of the failed cycle was validated and sent, and the cycle did not move`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - subscription after validate and send').catch(() => {});
    });
  });
});
