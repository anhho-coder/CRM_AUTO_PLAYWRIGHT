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
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_7.3 - Closing a subscription stops its billing
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_7.3
 *  Spec ID:         US9 (Termination)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/7.Lifecycle-change-upsell-renewal-suspension-closure/tc-subscription-7-3-closing-a-subscription-stops-billing.spec.ts
 *  Baseline TC ID  : subscription-7.3  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-07  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *    Create the subscription "Cust-Close-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date today, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 10
 *    Click "SAVE", click "IN PROGRESS", set "Date of Next Invoice" = today and save
 *    NOTE: the "Close" button only appears while the subscription is IN PROGRESS or TO UPSELL
 *
 *  Steps to reproduce:
 *   1. Click the "Close" button in the subscription header
 *   2. In the dialog pick a Close Reason and confirm
 *   3. Read the status bar and the "Close Reason" field on the form
 *   4. Look for "Date of Next Invoice" and the "=> Generate Invoice" link
 *   5. Click the "Invoices" smart button and count the invoices
 *
 *  Verification Points:
 *   VP3. The subscription is closed with its reason kept: status bar CLOSED and "Close Reason"
 *        showing the reason picked in step 2
 *   VP4. Both "Date of Next Invoice" and the "=> Generate Invoice" link are gone
 *   VP5. No invoice has been created, count = 0 - billing has stopped
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_7\.3:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_7.3';

test.describe(`${TC_ID} - Closing a subscription stops billing`, () => {
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

  test.skip(`${TC_ID}: Closing a subscription keeps its reason, removes the billing controls and raises no invoice @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const customerName = `Cust-Close-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    let pickedReason = '';

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_O365,
      quantity: 10,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Pre-condition check: the "Close" button is offered while the subscription is IN PROGRESS', async () => {
      const closeVisible = await subscriptionPage.isHeaderButtonVisible('Close');
      console.log(`  - "Close" header button visible while IN PROGRESS: ${closeVisible}`);
      expect(closeVisible, 'Pre-condition: the "Close" button should be offered on an IN PROGRESS subscription').toBeTruthy();
    });

    await test.step('Step 1-2: Click "Close" and pick a Close Reason in the dialog', async () => {
      pickedReason = await subscriptionPage.closeSubscription();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - close reason picked and confirmed').catch(() => {});
      expect(pickedReason, 'Step 2: the Close dialog should offer at least one Close Reason to pick').not.toBe('');
    });

    await test.step('Step 3: Read the status bar and the "Close Reason" on the form', async () => {
      const state = await subscriptionPage.getState();
      const closeReason = await subscriptionPage.getCloseReason();

      logVerify(
        'VP3',
        `the subscription is CLOSED and keeps the reason picked in step 2 ("${pickedReason}")`,
        `state = "${state}", Close Reason = "${closeReason}"`,
        /closed/i.test(state) && closeReason.includes(pickedReason),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - subscription closed').catch(() => {});

      expect(state, `VP3: the subscription should be CLOSED (state read: "${state}")`).toMatch(/closed/i);
      expect(closeReason, `VP3: the form should keep the reason picked in step 2 ("${pickedReason}", read: "${closeReason}")`).toContain(pickedReason);
    });

    await test.step('Step 4: Look for "Date of Next Invoice" and the "=> Generate Invoice" link', async () => {
      const dateVisible = await subscriptionPage.isDateOfNextInvoiceVisible();
      const linkVisible = await subscriptionPage.isGenerateInvoiceVisible();

      logVerify(
        'VP4',
        'both "Date of Next Invoice" and the "=> Generate Invoice" link are gone - a closed subscription is no longer in progress',
        `"Date of Next Invoice" visible = ${dateVisible}, "=> Generate Invoice" visible = ${linkVisible}`,
        !dateVisible && !linkVisible,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - billing controls gone').catch(() => {});

      expect(dateVisible, 'VP4: "Date of Next Invoice" should disappear once the subscription is closed').toBeFalsy();
      expect(linkVisible, 'VP4: the "=> Generate Invoice" link should disappear once the subscription is closed').toBeFalsy();
    });

    await test.step('Step 5: Click the "Invoices" smart button and count the invoices', async () => {
      const invoiceCount = await subscriptionPage.getInvoiceCount();

      logVerify(
        'VP5',
        'no invoice has been created, count = 0 - billing has stopped for this subscription',
        `"Invoices" smart button = ${invoiceCount}`,
        invoiceCount === 0,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - no invoice raised').catch(() => {});
      expect(invoiceCount, 'VP5: a subscription closed before any billing run should hold no invoice').toBe(0);

      console.log(`✅ ${TC_ID}: closing the subscription kept the reason and stopped billing`);
    });
  });
});
