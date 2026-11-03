import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { SubscriptionTemplatePage } from '@pages';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage, LoginPageMig as LoginPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_5.4 - A Monthly subscription with no closing limit is still terminated after
 *                      15 days unpaid
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_5.4
 *  Spec ID:         IS-CRM-FUNC-0196, IS-CRM-FUNC-0154, IS-CRM-FUNC-0197 / SC-21
 *                   Spec text  : a subscription whose template has no auto-close limit - both
 *                                Monthly templates today - is terminated, with the termination
 *                                notice of IS-CRM-FUNC-0155, once it has been unpaid for 15 days,
 *                                as today (0196). Collection is re-attempted once a day until it
 *                                is paid or terminated (0154), and the draft invoice of the unpaid
 *                                cycle is cancelled on termination (0197).
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v5 (2026-11-02), which SUPERSEDES the FRD.
 *                   Was        : IS-CRM-FUNC-0156 "Monthly retries indefinitely; an auto-close
 *                                limit on Monthly is Out of Scope" - RETIRED in spec v5. Before
 *                                that, "SC-21 / FUNC-0156", an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v5, 2026-11-02)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *
 *  INVERTED 2026-11-02, BODY REWRITTEN 2026-11-03. Aiva answered CRM-13832: the target is today's
 *  Production behaviour, so a Monthly subscription IS closed after 15 days unpaid. This case used
 *  to assert that it is NEVER closed and that no termination notice is sent, and it recorded VP3
 *  as an unscored observation because the old spec and the delivered behaviour disagreed. Spec v5
 *  settles that disagreement, so VP3 and VP4 are now ASSERTED, not observed. The Xray case
 *  CRM-13613 was rewritten on 2026-11-02 and the steps below mirror it.
 *
 *  Jira:            CRM-11806 (feature) / CRM-13832 (the spec question that inverted it)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08 (body realigned to spec v5 on 2026-11-03)
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/5.Failed-payments/tc-subscription-5-4-monthly-no-closing-limit-day-15-outcome.spec.ts
 *  Baseline TC ID  : subscription-5.4
 *  QA card         : SC-21  - "Subscription Test Cases" (CRM-12140, Nathan)
 *                    The baseline's "DO NOT SCORE - spec vs delivered" caveat is GONE: it existed
 *                    only because the spec contradicted the delivered behaviour. Spec v5 adopted
 *                    the delivered behaviour, so there is a single expected result to score again.
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription service https://subscription-crm-mig.nakivo.site (Odoo 19)
 *                    Customer portal https://subscription-crm-mig.nakivo.site/my
 *  Mechanical deviations from the baseline (and ONLY these):
 *    - baseUrl            -> baseUrl_mig
 *    - users.admin_crm    -> users.admin_crm_mig
 *    - LoginPage/HomePage -> LoginPageMig/HomePageMig (the sidebar theme hides the navbar)
 *    - TC id / file name  -> CRM-11806_x.y.z
 *  Beyond those, the EXPECTED RESULTS were changed on 2026-11-03 - and only because the spec they
 *  are keyed to changed. Where crm-mig behaves differently the assertion is meant to go RED.
 * --------------------------------------------------------------------------------------------
 *  ⛔ STILL SKIPPED - three blockers, none of them a defect in this case:
 *
 *   1. CRM-13828 - crm-mig has no daily billing run. This case needs the scheduled action
 *      "Subscriptions management" executed once per simulated day from day 0 to day 16. The
 *      "=> Generate Invoice" link is NOT a stand-in: it bills one cycle on demand and never
 *      re-attempts a declined collection, which is the whole subject of steps 2 and 4.
 *   2. CRM-13821 - the picked card is cleared from "Payment Token" on save, so the pre-condition
 *      cannot leave S holding the always-declining test card.
 *   3. Two SubscriptionPageEmbed methods step 1 and step 4 need are NOT ported to the embed and
 *      throw by name (measured 2026-10-20): openSubscriptionTemplatesList() and
 *      getContentText(). searchInList() / clearSearchFacets() were ported on 2026-11-03.
 *
 *  AND ONE MEASUREMENT GAP, recorded rather than papered over: "Auto Pay?" (the second half of
 *  VP1) is not exposed by SubscriptionTemplatePage.getSettings(), which returns recurrence,
 *  repeatEvery, paymentMode, closingLimit and invoiceMailTemplate. Payment Mode is a different
 *  control, not a rename of Auto Pay, so step 1 asserts the closing limit only and logs the gap.
 *
 *  TO UNBLOCK: close CRM-13821 and CRM-13828, port openSubscriptionTemplatesList() and
 *  getContentText(), add an Auto Pay reader, then set READY_FOR_VERIFICATION = true with the
 *  Reference Dev ran the days for, and change `test.skip(` to `test(`.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors CRM-13613 - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (https://crm-mig.nakivo.site) as Subscription staff Ho Quoc Anh (admin_crm_mig)
 *    Open CRM > Pipeline and create an Opportunity:
 *      - Opportunity = "AUTO-CRM-11806_5.4-<yyyyMMddHHmm>"
 *      - Customer    = "QA Test CRM-12548 Customer" (owner of the Stripe test card
 *                      "XXXXXXXXXXXX0341 (QA decline)", which the provider always declines)
 *    Click "Deal Element", set Pricelist = "Public Pricelist_USD (USD)" and add one Order Line:
 *      - Product     = "[CP-NC-O365] Office 365 for CSP - No Commitment" (Subscriptionable)
 *      - Ordered Qty = 10
 *    Click "SAVE", then "New quotation", then "CONFIRM"
 *    Click the "SUBxxxxx Subscription" smart button on the order (subscription S), click "EDIT":
 *      - Subscription Template = "Monthly Subscription"
 *      - Date of Next Invoice  = today
 *      - "Settings" tab > Payment Token = "XXXXXXXXXXXX0341 (QA decline)"
 *    Click "SAVE". Write down the Recurring Price as P (expected $ 7.00).
 *    This case runs through the DAILY BILLING RUN ("Subscriptions management"), NOT the
 *    "=> Generate Invoice" link.
 *
 *  Steps to reproduce:
 *   1. Open Subscriptions > Configuration > Subscription Templates > "Monthly Subscription" and
 *      read "Automatic closing limit" and "Auto Pay?"
 *   2. Have the daily billing run process S once (day 0), then have Dev run it for S each day up
 *      to day 16 - more than 15 days after the first declined attempt
 *   3. Open S and read the stage bar, "Date of Next Invoice" and the chatter
 *   4. Read the message history (chatter) of S and of its invoice
 *
 *  Verification Points:
 *   VP1. "Automatic closing limit" = 0 (no limit configured) and "Auto Pay?" = checked. A limit of
 *        0 does NOT exempt the subscription: IS-CRM-FUNC-0196 terminates it after 15 days unpaid
 *        all the same, as on Production
 *   VP2. Each run declines the charge (as in CRM-11806_5.1) and re-attempts collection once a day
 *        (IS-CRM-FUNC-0154), reusing the same draft invoice (IS-CRM-FUNC-0147)
 *   VP3. S IS closed for non-payment, exactly as a Quarterly or Yearly subscription would be
 *        (IS-CRM-FUNC-0196): Stage = Closed, and the chatter records that S was closed
 *        automatically after the failed payments
 *   VP4. A termination notice was sent to the customer (template "Invoice - AutoPay Failed")
 *        - IS-CRM-FUNC-0155, IS-CRM-FUNC-0196; the draft invoice of the unpaid cycle is Cancelled
 *        (IS-CRM-FUNC-0197); and reminder e-mails went out on days 1, 4, 8 and 15 of failed
 *        collection and on no other day (IS-CRM-FUNC-0153)
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_5\.4:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_5.4';
const ADMIN = users.admin_crm_mig;
const TEMPLATE_NAME = 'Monthly Subscription';

/** Set to true only after Dev has run the daily billing run for days 0-16 on a subscription. */
const READY_FOR_VERIFICATION = false;

/** The subscription Reference Dev ran those days for. Required when READY_FOR_VERIFICATION is true. */
const TARGET_SUBSCRIPTION_REFERENCE = '';

/** Spec v5: the reminder goes out on these days of failed collection and on NO other day (0153). */
const REMINDER_DAYS = [1, 4, 8, 15];

/** Spec v5, IS-CRM-FUNC-0196: terminated once it has been unpaid for this many days. */
const TERMINATION_DAY = 15;

const STEP = {
  s1: 'Step 1: Open Subscriptions > Configuration > Subscription Templates > "Monthly Subscription" and read "Automatic closing limit" and "Auto Pay?"',
  s2: 'Step 2: Have the daily billing run process S once (day 0), then have Dev run it for S each day up to day 16',
  s3: 'Step 3: Open S and read the stage bar, "Date of Next Invoice" and the chatter',
  s4: 'Step 4: Read the message history (chatter) of S and of its invoice',
} as const;

test.describe(`${TC_ID} - A Monthly subscription with no closing limit is still terminated after 15 days unpaid`, () => {
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

  test.skip(`${TC_ID}: A Monthly subscription with no closing limit is still terminated after 15 days unpaid @blocked-devrun @blocked-embed-port`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Without a Reference this case verifies nothing - fail before reading anything, never pass.
    expect(
      READY_FOR_VERIFICATION,
      'READY_FOR_VERIFICATION must be true: Dev has to run days 0-16 before this case means anything',
    ).toBe(true);
    expect(
      TARGET_SUBSCRIPTION_REFERENCE,
      'TARGET_SUBSCRIPTION_REFERENCE must name the subscription Dev ran days 0-16 for',
    ).not.toBe('');

    const loginPage = new LoginPage(page);
    const subscriptionPage = new SubscriptionPage(page);
    const templatePage = new SubscriptionTemplatePage(page);

    let closingLimit = '';
    let autoPay = false;
    let stageBar = '';
    let chatterText = '';
    let invoiceStatus = '';

    await test.step('Pre-condition: log in to the CRM as Subscription staff', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ADMIN.username, ADMIN.password, CommonUtils.waitTimes.login);
      console.log(`✓ Logged in as ${ADMIN.username}`);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await subscriptionPage.openSubscriptionTemplatesList();
      await templatePage.openByName(TEMPLATE_NAME);
      const settings = await templatePage.getSettings();
      closingLimit = settings.closingLimit === undefined || settings.closingLimit === null
        ? '' : String(settings.closingLimit);
      // `closingLimit` is parsed with a -1 sentinel when the field is empty - both readings mean
      // "no limit configured" for VP1.
      const limitIsZero = closingLimit === '' || closingLimit === '0' || closingLimit === '-1';

      // "Auto Pay?" IS NOT READ HERE. SubscriptionTemplatePage.getSettings() returns recurrence,
      // repeatEvery, paymentMode, closingLimit and invoiceMailTemplate - there is no Auto Pay
      // field on it, and the Payment Mode radio is a different control, not a rename of it.
      // Asserting one as the other would publish a verdict on a field this spec never looked at.
      // The half of VP1 that can be read is asserted; the other half is named as a gap.
      console.log('  - "Auto Pay?" NOT CHECKED HERE: SubscriptionTemplatePage exposes no Auto Pay');
      console.log(`  - Payment Mode read instead (for the record, NOT as Auto Pay): "${settings.paymentMode}"`);
      autoPay = false;

      logVerify(
        'VP1 (closing limit half)',
        '"Automatic closing limit" = 0 (no limit configured) - a limit of 0 does NOT exempt the subscription from the 15-day termination (IS-CRM-FUNC-0196)',
        `"Automatic closing limit" = "${closingLimit || '(empty)'}"`,
        limitIsZero,
      );

      expect(limitIsZero, `VP1: "${TEMPLATE_NAME}" should set no closing limit (0), read "${closingLimit}"`).toBe(true);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Monthly Subscription template settings').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`Dev runs "Subscriptions management" for ${TARGET_SUBSCRIPTION_REFERENCE} once per simulated day, day 0 -> day 16.`);

      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const hits = await subscriptionPage.searchInList(TARGET_SUBSCRIPTION_REFERENCE);
      expect(hits, `VP2: the Subscriptions list should hold exactly 1 subscription "${TARGET_SUBSCRIPTION_REFERENCE}"`).toBe(1);

      const invoiceCount = await subscriptionPage.getInvoiceCount();
      logVerify(
        'VP2',
        'Each run declines the charge and re-attempts collection once a day (IS-CRM-FUNC-0154), reusing the SAME draft invoice (IS-CRM-FUNC-0147) - so the whole dunning period leaves exactly 1 invoice',
        `"Invoices" smart button = ${invoiceCount} after ${TERMINATION_DAY + 1} daily runs`,
        invoiceCount === 1,
      );
      expect(invoiceCount, 'VP2: the retries must reuse one invoice, not raise one per day').toBe(1);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - after the daily runs').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      stageBar = await subscriptionPage.getState();
      const nextInvoice = await subscriptionPage.getDateOfNextInvoice();
      chatterText = await subscriptionPage.getChatterText();
      const closedAutomatically = /closed\s+automatically|automatic\s+payment\s+failed/i.test(chatterText);

      console.log(`  - Stage bar            : "${stageBar}"`);
      console.log(`  - Date of Next Invoice : "${nextInvoice}"`);

      logVerify(
        'VP3',
        `S IS closed for non-payment after ${TERMINATION_DAY} days unpaid, exactly as a Quarterly or Yearly subscription would be (IS-CRM-FUNC-0196): Stage = "Closed" and the chatter records the automatic closure`,
        `Stage = "${stageBar}"; automatic-closure line in the chatter = ${closedAutomatically}`,
        stageBar === 'Closed' && closedAutomatically,
      );

      // ASSERTED since spec v5 - this was an unscored observation while 0156 said Monthly is never
      // closed. 0156 is retired; 0196 requires exactly this.
      expect(stageBar, 'VP3: a Monthly subscription unpaid for 15 days should be Closed (IS-CRM-FUNC-0196)').toBe('Closed');
      expect(closedAutomatically, 'VP3: the chatter should record that S was closed automatically after the failed payments').toBe(true);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - subscription after day 16').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      const terminationNotice = /autopay\s*failed|termination\s+of\s+subscription|payment\s+failed/i.test(chatterText);
      logVerify(
        'VP4a',
        'A termination notice was sent to the customer (template "Invoice - AutoPay Failed") - IS-CRM-FUNC-0155, IS-CRM-FUNC-0196',
        `termination notice in the chatter = ${terminationNotice}`,
        terminationNotice,
      );
      expect(terminationNotice, 'VP4: a termination notice should have been sent to the customer').toBe(true);

      await subscriptionPage.openInvoices();
      invoiceStatus = await subscriptionPage.getContentText();
      const invoiceCancelled = /cancel+ed/i.test(invoiceStatus);
      logVerify(
        'VP4b',
        'The draft invoice of the unpaid cycle is Cancelled on termination (IS-CRM-FUNC-0197)',
        `invoice status reads "${invoiceStatus.replace(/\s+/g, ' ').slice(0, 120)}"`,
        invoiceCancelled,
      );
      expect(invoiceCancelled, 'VP4: on termination the unpaid cycle\'s draft invoice should be Cancelled (IS-CRM-FUNC-0197)').toBe(true);

      // Reminder days - counted from the billing date, NOT from the termination date.
      const reminderMatches = chatterText.match(/Invoice\s*-\s*AutoPay\s*To\s*Retry/gi) || [];
      logVerify(
        'VP4c',
        `Reminder e-mails went out on days ${REMINDER_DAYS.join(', ')} of failed collection and on NO other day (IS-CRM-FUNC-0153) - ${REMINDER_DAYS.length} in total`,
        `${reminderMatches.length} reminder e-mail(s) in the chatter`,
        reminderMatches.length === REMINDER_DAYS.length,
      );
      expect(
        reminderMatches.length,
        `VP4: exactly ${REMINDER_DAYS.length} reminders are due (days ${REMINDER_DAYS.join(', ')}); the per-day dates are checked in CRM-11806_5.7`,
      ).toBe(REMINDER_DAYS.length);

      console.log(`✅ ${TC_ID}: the Monthly subscription was terminated after ${TERMINATION_DAY} days unpaid, its draft invoice cancelled, and ${REMINDER_DAYS.length} reminders were sent`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - chatter and invoice after termination').catch(() => {});
    });
  });
});
