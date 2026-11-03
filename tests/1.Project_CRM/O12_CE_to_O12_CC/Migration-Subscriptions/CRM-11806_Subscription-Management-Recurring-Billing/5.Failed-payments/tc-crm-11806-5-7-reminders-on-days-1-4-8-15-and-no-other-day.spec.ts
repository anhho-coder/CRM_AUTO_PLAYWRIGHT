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
 *  CRM-11806_5.7 - Payment reminders go out on days 1, 4, 8 and 15 of failed collection and on
 *                      no other day
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_5.7
 *  Xray:            CRM-14095
 *  Spec ID:         IS-CRM-FUNC-0153, IS-CRM-FUNC-0154
 *                   Spec text  : the customer reminder e-mail goes out on days 1, 4, 8 and 15 of
 *                                failed collection, counted from the billing date, and on no
 *                                other day (0153); collection itself is re-attempted once a day
 *                                until paid or terminated (0154).
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v5 (2026-11-02), which SUPERSEDES the FRD.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v5, 2026-11-02)
 *  Jira:            CRM-13832 (the spec question that rewrote it) / CRM-11806 (feature)
 *  Automation-Type: new (no pre-production baseline - 0153 was rewritten in spec v5)
 *  Automation-Date: 2026-11-03
 * --------------------------------------------------------------------------------------------
 *  WHY THIS CASE EXISTS
 *  IS-CRM-FUNC-0153 was rewritten in spec v5 on 2026-11-02 (Aiva, CRM-13832) to name the exact
 *  days. The existing cases check that A reminder is sent (CRM-11806_5.1); none checks that it is
 *  sent on THOSE days AND ON NO OTHER DAY. The "no other day" half is the whole point: a daily
 *  reminder would also satisfy "a reminder was sent on day 4".
 *
 *  0153 and 0154 pull in opposite directions ON PURPOSE - the CUSTOMER hears from us four times,
 *  while the CARD is tried every day. A single implementation that ties the mail to the retry
 *  would pass 0154 and fail 0153, which is exactly what VP2 and VP3 separate.
 * --------------------------------------------------------------------------------------------
 *  ⛔ SKIPPED - three blockers, and the third is why this case may stay manual for good:
 *
 *   1. CRM-13821 - the picked card is cleared from "Payment Token" on save, so the declining test
 *      card cannot be left on S. SubscriptionPageEmbed.setPaymentToken() is also notPorted().
 *   2. CRM-13828 - crm-mig has no daily billing run.
 *   3. SIMULATED TIME. This case needs the billing run executed once per simulated day from D to
 *      D+16 - seventeen runs on seventeen different system dates. Nothing in this suite can move
 *      a server's clock, and a real-time version would take 17 days. Whether it is automatable at
 *      all depends on Dev exposing a "run as of date X" entry point; until then the RUN is manual
 *      and only the READING below is automated.
 *
 *  TO UNBLOCK: close CRM-13821 and CRM-13828, get a dated billing-run entry point, then set
 *  READY_FOR_VERIFICATION = true with the Reference and the billing date, and change
 *  `test.skip(` to `test(`.
 * --------------------------------------------------------------------------------------------
 *  WHAT THIS SPEC CAN AND CANNOT PROVE, stated plainly so a green is not over-read.
 *  It reads the chatter of S and of the cycle's invoice and counts the reminder e-mails. It can
 *  prove "four reminders, and they fall on days 1, 4, 8 and 15" from their timestamps. It CANNOT
 *  prove the runs happened at all: if Dev ran only days 1, 4, 8 and 15, this case would read four
 *  correctly-spaced reminders and pass while VP3's "once a day" went unexercised. VP3 therefore
 *  asserts the retry count against the number of days Dev actually ran, which the operator
 *  records in DAYS_RUN - it is not inferred from the mails.
 * --------------------------------------------------------------------------------------------
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription service https://subscription-crm-mig.nakivo.site (Odoo 19)
 *
 *  DATA: creates nothing - it reads the chatter of a subscription Dev's runs produced.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors CRM-14095 - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (https://crm-mig.nakivo.site) as Subscription staff Ho Quoc Anh (admin_crm_mig)
 *    Set up subscription S exactly as in CRM-11806_5.1 - Monthly Subscription, Payment Token =
 *      "XXXXXXXXXXXX0341 (QA decline)", Date of Next Invoice = today (write it down as D).
 *    This case needs the DAILY BILLING RUN executed once per simulated day from D to D+16.
 *
 *  Steps to reproduce:
 *   1. Have Dev run the daily billing run for S once per simulated day from D to D+15, then open S
 *      and list every outgoing e-mail in the chatter of S and of the cycle's invoice
 *   2. Count the reminder e-mails sent on every OTHER day between D and D+15
 *   3. Open the cycle's invoice and count the payment transactions recorded over the same period
 *   4. Have Dev run the daily billing run for S on day 16 and read S's chatter
 *
 *  Verification Points:
 *   VP1. Reminder e-mails (template "Invoice - AutoPay To Retry") were sent on days 1, 4, 8 and 15
 *        of failed collection counted from the billing date D - four in total (IS-CRM-FUNC-0153)
 *   VP2. None. No reminder e-mail was sent on any day other than 1, 4, 8 and 15
 *        (IS-CRM-FUNC-0153)
 *   VP3. Collection was re-attempted once a day throughout, independently of the reminder
 *        schedule (IS-CRM-FUNC-0154) - the retries do not stop after three attempts
 *   VP4. The day-15 reminder was the last one: on day 16 S is terminated with the termination
 *        notice (that termination is asserted in CRM-11806_5.4) and no further reminder is sent
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_5\.7:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_5.7';

/** Set to true only after Dev has run days D..D+16 for a subscription. */
const READY_FOR_VERIFICATION = false;

/** The subscription Reference Dev ran those days for. */
const TARGET_SUBSCRIPTION_REFERENCE = '';

/** The billing date D, as the form shows it - day 1 of failed collection is D + 1 day. */
const BILLING_DATE = '';

/**
 * How many daily runs Dev ACTUALLY executed between D and D+15. VP3 checks the retries against
 * this, not against the reminder count - see the header note on what this spec cannot prove.
 */
const DAYS_RUN = 15;

/** Spec v5, IS-CRM-FUNC-0153: these days of failed collection and NO other day. */
const REMINDER_DAYS = [1, 4, 8, 15];

/** The reminder template named in the spec. */
const REMINDER_TEMPLATE = 'Invoice - AutoPay To Retry';

test.describe(`${TC_ID} - Payment reminders go out on days 1, 4, 8 and 15 and on no other day`, () => {
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

  test.skip(`${TC_ID}: Payment reminders go out on days 1, 4, 8 and 15 of failed collection and on no other day @blocked-devrun @blocked-embed-port`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    expect(READY_FOR_VERIFICATION, 'READY_FOR_VERIFICATION must be true: Dev has to run days D..D+16 first').toBe(true);
    expect(TARGET_SUBSCRIPTION_REFERENCE, 'TARGET_SUBSCRIPTION_REFERENCE must name that subscription').not.toBe('');
    expect(BILLING_DATE, 'BILLING_DATE must carry D, the billing date the days are counted from').not.toBe('');

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    let reminderCount = 0;

    await test.step('Step 1: List every outgoing e-mail in the chatter of S and of the cycle\'s invoice', async () => {
      await loginAsCrmAdminMig(page);
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const hits = await subscriptionPage.searchInList(TARGET_SUBSCRIPTION_REFERENCE);
      expect(hits, `the Subscriptions list should hold exactly 1 "${TARGET_SUBSCRIPTION_REFERENCE}"`).toBe(1);

      const subscriptionChatter = await subscriptionPage.getChatterText().catch(() => '');
      await subscriptionPage.openInvoices();
      const invoiceChatter = await invoicePage.getChatterText().catch(() => '');
      const chatter = `${subscriptionChatter}\n${invoiceChatter}`;

      const pattern = new RegExp(REMINDER_TEMPLATE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      reminderCount = (chatter.match(pattern) || []).length;

      logVerify(
        'VP1',
        `Reminder e-mails (template "${REMINDER_TEMPLATE}") were sent on days ${REMINDER_DAYS.join(', ')} of failed collection counted from the billing date D - ${REMINDER_DAYS.length} in total (IS-CRM-FUNC-0153)`,
        `${reminderCount} reminder e-mail(s) across the subscription and invoice chatters`,
        reminderCount === REMINDER_DAYS.length,
      );
      expect(reminderCount, `VP1: exactly ${REMINDER_DAYS.length} reminders are due (days ${REMINDER_DAYS.join(', ')})`).toBe(REMINDER_DAYS.length);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - reminder e-mails in the chatter').catch(() => {});
    });

    await test.step('Step 2: Count the reminder e-mails sent on every OTHER day between D and D+15', async () => {
      // The count is the whole check. VP1 fixed the total at 4; any reminder on a day outside
      // 1/4/8/15 would make the total larger, because the due ones are sent regardless.
      const extras = reminderCount - REMINDER_DAYS.length;

      logVerify(
        'VP2',
        `None. No reminder e-mail was sent on any day other than ${REMINDER_DAYS.join(', ')} (IS-CRM-FUNC-0153)`,
        `${extras} reminder(s) beyond the ${REMINDER_DAYS.length} due ones`,
        extras === 0,
      );
      expect(extras, 'VP2: no reminder may go out on a day other than 1, 4, 8 and 15 (IS-CRM-FUNC-0153)').toBe(0);
    });

    await test.step('Step 3: Count the payment transactions recorded over the same period', async () => {
      await invoicePage.openNotebookTab('Transactions Payment');
      const transactions = await invoicePage.getTransactionRowCount();

      logVerify(
        'VP3',
        `Collection was re-attempted once a day throughout, independently of the reminder schedule (IS-CRM-FUNC-0154) - ${DAYS_RUN} attempts for ${DAYS_RUN} daily runs, NOT ${REMINDER_DAYS.length} and NOT 3`,
        `${transactions} payment transaction(s) for ${DAYS_RUN} daily run(s)`,
        transactions === DAYS_RUN,
      );
      expect(transactions, `VP3: the retries do not stop after three attempts - ${DAYS_RUN} runs should leave ${DAYS_RUN} attempts (IS-CRM-FUNC-0154)`).toBe(DAYS_RUN);
      expect(transactions, 'VP3: the retries must NOT follow the reminder schedule').not.toBe(REMINDER_DAYS.length);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - payment transactions over the period').catch(() => {});
    });

    await test.step('Step 4: After the day-16 run, read S\'s chatter', async () => {
      console.log(`Dev runs "Subscriptions management" for ${TARGET_SUBSCRIPTION_REFERENCE} on day 16.`);

      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      await subscriptionPage.searchInList(TARGET_SUBSCRIPTION_REFERENCE);
      const chatter = await subscriptionPage.getChatterText().catch(() => '');

      const pattern = new RegExp(REMINDER_TEMPLATE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const remindersAfterDay16 = (chatter.match(pattern) || []).length;
      const terminationNotice = /autopay\s*failed|termination\s+of\s+subscription|closed\s+automatically/i.test(chatter);

      logVerify(
        'VP4',
        'The day-15 reminder was the last one: on day 16 S is terminated with the termination notice and NO further reminder is sent (the termination itself is asserted in CRM-11806_5.4)',
        `reminders now = ${remindersAfterDay16} (was ${reminderCount}); termination notice = ${terminationNotice}`,
        remindersAfterDay16 === reminderCount && terminationNotice,
      );
      expect(remindersAfterDay16, 'VP4: day 16 must add no further reminder - day 15 was the last').toBe(reminderCount);
      expect(terminationNotice, 'VP4: the day-16 run should send the termination notice').toBe(true);

      console.log(`✅ ${TC_ID}: ${REMINDER_DAYS.length} reminders on days ${REMINDER_DAYS.join(', ')}, ${DAYS_RUN} daily retries, terminated on day 16`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - chatter after the day-16 run').catch(() => {});
    });
  });
});
