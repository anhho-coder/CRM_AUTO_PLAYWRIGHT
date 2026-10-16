import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  logVerify,
  monthsFromTodayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_7.4 - A subscription left in Draft stops billing SILENTLY
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_7.4
 *  Spec ID:         US9 (Termination) / US14 (Visibility)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/7.Lifecycle-change-upsell-renewal-suspension-closure/tc-subscription-7-4-a-draft-subscription-stops-billing-silently.spec.ts
 *  Baseline TC ID  : subscription-7.4  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-06  - "Subscription Test Cases" (CRM-12140, Nathan)
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription service https://subscription-crm-mig.nakivo.site (Odoo 19)
 *                    Customer portal https://subscription-crm-mig.nakivo.site/my
 *  Mechanical deviations from the baseline (and ONLY these):
 *    - baseUrl            -> baseUrl_mig
 *    - users.admin_crm    -> users.admin_crm_mig
 *    - LoginPage/HomePage -> LoginPageMig/HomePageMig (the sidebar theme hides the navbar)
 *    - TC id / file name  -> CRM-11806_x.y.z
 *  No expected value, count or string was changed. Where crm-mig behaves differently the
 *  assertion is meant to go RED - that red is the migration finding.
 * --------------------------------------------------------------------------------------------
 *  BLOCKED on crm-mig - B1 cleared 2026-10-08; B2 still open, so this spec stays skipped:
 *   B1. Rights   : CLEARED 2026-10-08. res.groups 115 "Subscriptions / See Subscriptions" and 116
 *                  "Subscriptions / Manage Subscriptions" now both hold uid 9685
 *                  (anh.ho@nakivo.com), and all ten Subscriptions menus render for it
 *                  (1436 root, 1475/1437/1476/1477, 1478/1479/1480/1481/1482).
 *                  Still denied to that account even so: nakivo.subscription.config (992) and
 *                  nakivo.embed.host (991) - assert through the UI or the Odoo 19 service, never
 *                  on the embed plumbing.
 *   B2. Platform : crm-mig carries NO sale.subscription model (ir.model holds only nakivo.subscription.config and nakivo.subscription.client; sale_subscription is state=uninstallable). The subscription itself lives on the Odoo 19 service subscription-crm-mig.nakivo.site and the CRM renders its screens as an EMBED, so the baseline's "Subscriptions > CREATE a subscription" path does not exist here - on crm-mig a subscription is born only by confirming a quotation that carries a Subscriptionable product.
 *                  -> the creation steps need a SubscriptionPageMig that drives the order path
 *                     on the CRM and reads the Odoo 19 service over its own authenticated
 *                     JSON-RPC (the MigPreSalePage pattern). The Subscriptions screens ARE now
 *                     reachable for that exploration since B1 was cleared.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a CRM administrator (e.g. Anh Ho)
 *    Create the subscription "Cust-Draft-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date = today minus 1 month, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 10
 *    Click "SAVE"
 *    Leave the status bar on DRAFT - do NOT click IN PROGRESS
 *
 *  Steps to reproduce:
 *   1. Confirm the status bar highlights DRAFT
 *   2. Look at the right-hand column of the form for "Date of Next Invoice"
 *   3. Look for the "=> Generate Invoice" link
 *   4. Click the "Invoices" smart button and count the invoices
 *   5. Check whether any warning or activity has been raised on the subscription
 *
 *  Verification Points:
 *   VP1. The subscription is in DRAFT
 *   VP2. "Date of Next Invoice" is not shown at all while the subscription is in Draft
 *   VP3. The "=> Generate Invoice" link is not shown either
 *   VP4. No invoice has been created, count = 0
 *   VP5. Nothing warns anybody - no activity, message or alert about the missed billing
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_7\.4:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_7.4';

test.describe(`${TC_ID} - A Draft subscription stops billing silently`, () => {
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

  test.skip(`${TC_ID}: A subscription left in Draft never bills and raises no warning about it @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const customerName = `Cust-Draft-${CommonUtils.generateUniqueId()}`;
    const startedAMonthAgo = monthsFromTodayMMDDYYYY(-1);

    await loginAsCrmAdmin(page);

    // nextInvoiceDate is deliberately omitted so the helper leaves the record in DRAFT.
    const setup = await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_O365,
      quantity: 10,
      startDate: startedAMonthAgo,
    });

    await test.step('Step 1: Confirm the status bar highlights DRAFT', async () => {
      const state = await subscriptionPage.getState();

      logVerify(
        'VP1',
        'the subscription is in DRAFT',
        `state = "${state}", Start Date = ${startedAMonthAgo} (one month ago, so a cycle is already due)`,
        /draft/i.test(state),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - subscription left in Draft').catch(() => {});
      expect(state, `VP1: the subscription should still be in DRAFT (state read: "${state}")`).toMatch(/draft/i);
    });

    await test.step('Step 2-3: Look for "Date of Next Invoice" and the "=> Generate Invoice" link', async () => {
      logVerify(
        'VP2 + VP3',
        'neither "Date of Next Invoice" nor the "=> Generate Invoice" link is shown while the subscription is in Draft - there is no way to bill from this screen',
        `"Date of Next Invoice" visible = ${setup.dateVisibleInDraft}, "=> Generate Invoice" visible = ${setup.linkVisibleInDraft}`,
        !setup.dateVisibleInDraft && !setup.linkVisibleInDraft,
      );

      expect(setup.dateVisibleInDraft, 'VP2: "Date of Next Invoice" must not be rendered while the subscription is in Draft').toBeFalsy();
      expect(setup.linkVisibleInDraft, 'VP3: the "=> Generate Invoice" link must not be rendered while the subscription is in Draft').toBeFalsy();
    });

    await test.step('Step 4: Click the "Invoices" smart button and count the invoices', async () => {
      const invoiceCount = await subscriptionPage.getInvoiceCount();

      logVerify(
        'VP4',
        'no invoice has been created, count = 0',
        `"Invoices" smart button = ${invoiceCount}`,
        invoiceCount === 0,
      );

      expect(invoiceCount, 'VP4: a Draft subscription should never have billed, even with a start date a month in the past').toBe(0);
    });

    await test.step('Step 5: Check whether any warning or activity has been raised', async () => {
      const chatterPresent = await subscriptionPage.hasChatter();
      const chatterText = await subscriptionPage.getChatterText();
      const activityCount = await subscriptionPage.getActivityCount();

      // The point of the case is that NOTHING warns anybody. Prove the chatter was really read
      // before treating its silence as evidence, then look for any billing-related warning.
      const WARNING_MARKERS = /overdue|not billed|missed|reminder|warning|payment failed|alert/i;
      const warningFound = WARNING_MARKERS.test(chatterText);

      logVerify(
        'VP5',
        'nothing warns anybody - no activity, message or alert is raised about the subscription not being billed',
        `chatter present = ${chatterPresent}, scheduled activities = ${activityCount}, billing-warning marker found = ${warningFound}, history = "${chatterText.slice(0, 400)}"`,
        chatterPresent && activityCount === 0 && !warningFound,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - nothing warns about the missed billing').catch(() => {});

      expect(chatterPresent, 'VP5: the subscription message history must be present before its silence means anything').toBeTruthy();
      expect(activityCount, 'VP5: no activity should be scheduled about the subscription not being billed').toBe(0);
      expect(warningFound, `VP5: no billing warning should be raised - a subscription left in Draft simply stops billing silently. Found in: "${chatterText.slice(0, 400)}"`).toBeFalsy();

      console.log(`✅ ${TC_ID}: the Draft subscription never billed and nothing warned about it`);
    });
  });
});
