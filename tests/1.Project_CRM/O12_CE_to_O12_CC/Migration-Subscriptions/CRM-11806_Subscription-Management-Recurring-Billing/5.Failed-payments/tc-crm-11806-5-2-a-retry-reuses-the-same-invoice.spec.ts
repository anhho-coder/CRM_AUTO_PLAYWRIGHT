import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { InvoicePage } from '@pages';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_AUTOCHARGE,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_5.2 - Retrying a declined collection reuses the SAME invoice
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_5.2
 *  Spec ID:         IS-CRM-FUNC-0147, IS-CRM-FUNC-0154 / SC-19
 *                   Spec text  : later attempts retry the cycle’s EXISTING unpaid invoice - no additional invoice for the same cycle
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "US10 (Dunning)" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/5.Failed-payments/tc-subscription-5-2-a-retry-reuses-the-same-invoice.spec.ts
 *  Baseline TC ID  : subscription-5.2  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-19  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *  ⛔ SKIPPED - BLOCKED ON TEST DATA, not on a defect.
 *
 *  Needs a saved card that the payment provider ALWAYS DECLINES, which cannot be created from the
 *  CRM UI (the card is typed on the provider's own page).
 *
 *  TO UNBLOCK: put the automation customer carrying the declining test card in
 *  DECLINING_CARD_CUSTOMER below and change `test.skip(` to `test(`.
 *
 *  NOTE - this case guards the SAME defect family as subscription-5.2 [CRM-12188], where a second
 *  billing run on a healthy subscription DOES raise a second invoice. If that defect also applies
 *  to the retry path, expect this case to fail on VP3/VP4 and to need a test.fail() marking.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a CRM administrator (e.g. Anh Ho)
 *    Ask the CRM admin team for a saved card that the payment provider always declines
 *    Create the subscription for that customer / Public Pricelist_USD (USD) /
 *      "Monthly Subscription" / Start Date today, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 10
 *    Open the "Settings" tab and set Payment Token = the declining test card
 *    Click "SAVE", click "IN PROGRESS", set "Date of Next Invoice" = today and save
 *    Click the "=> Generate Invoice" link once so the first attempt has already been declined
 *
 *  Steps to reproduce:
 *   1. Click the "Invoices" smart button, count the invoices and write down each invoice number
 *   2. Go back to the subscription and click the "=> Generate Invoice" link again to re-attempt
 *   3. Click the "Invoices" smart button and count the invoices again
 *   4. Compare the invoice numbers now listed against the ones written down in step 1
 *
 *  Verification Points:
 *   VP1. Exactly 1 invoice exists after the first declined attempt, count = 1
 *   VP3. Still exactly 1 invoice exists after the retry, count = 1
 *   VP4. The same invoice is retried, not a new one - the customer is never billed twice
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_5\.2:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_5.2';

/** Set this to the automation customer that carries an always-declining test card. */
const DECLINING_CARD_CUSTOMER = '';

test.describe(`${TC_ID} - A retry reuses the same invoice`, () => {
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

  // Declaration-level skip so the browser fixture never starts - see the BLOCKED note above.
  test.skip(`${TC_ID}: Re-attempting a declined collection retries the same invoice instead of raising a second one @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);
    const today = todayMMDDYYYY();

    let returnUrl = '';
    let numbersBefore: string[] = [];

    expect(DECLINING_CARD_CUSTOMER, 'DECLINING_CARD_CUSTOMER must name a customer that carries an always-declining test card').not.toBe('');

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName: DECLINING_CARD_CUSTOMER,
      template: TEMPLATE_MONTHLY_AUTOCHARGE,
      productSku: SKU_O365,
      quantity: 10,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Pre-condition: Click the "=> Generate Invoice" link once so the first attempt is declined', async () => {
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await subscriptionPage.openByUrl(returnUrl);
    });

    await test.step('Step 1: Count the invoices and write down each invoice number', async () => {
      const count = await subscriptionPage.getInvoiceCount();

      await subscriptionPage.openInvoices();
      numbersBefore = await invoicePage.getAllRowInvoiceNumbers();

      logVerify(
        'VP1',
        'exactly 1 invoice exists after the first declined attempt, count = 1',
        `"Invoices" smart button = ${count}, invoice numbers listed = [${numbersBefore.join(' | ')}]`,
        count === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - one invoice after the first decline').catch(() => {});
      expect(count, 'VP1: the first declined attempt should leave exactly one invoice').toBe(1);
    });

    await test.step('Step 2-3: Re-attempt the collection and count the invoices again', async () => {
      await subscriptionPage.openByUrl(returnUrl);
      const billing = await subscriptionPage.clickGenerateInvoice();
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await subscriptionPage.openByUrl(returnUrl);

      const countAfter = await subscriptionPage.getInvoiceCount();

      logVerify(
        'VP3',
        'still exactly 1 invoice exists after the retry, count = 1',
        `"Invoices" smart button after the retry = ${countAfter}`,
        countAfter === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - still one invoice after the retry').catch(() => {});
      expect(countAfter, 'VP3: retrying a declined collection must not raise a second invoice for the same cycle').toBe(1);
    });

    await test.step('Step 4: Compare the invoice numbers against the ones written down', async () => {
      await subscriptionPage.openInvoices();
      const numbersAfter = await invoicePage.getAllRowInvoiceNumbers();

      const identical = numbersAfter.length === numbersBefore.length
        && numbersAfter.every((n, i) => n === numbersBefore[i]);

      logVerify(
        'VP4',
        'the same invoice is retried, not a new one - the customer is never billed twice for one cycle',
        `before = [${numbersBefore.join(' | ')}], after = [${numbersAfter.join(' | ')}]`,
        identical,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - same invoice number after the retry').catch(() => {});
      expect(numbersAfter, `VP4: the retry should reuse the same invoice (before: ${numbersBefore.join(' | ')}, after: ${numbersAfter.join(' | ')})`).toEqual(numbersBefore);

      console.log(`✅ ${TC_ID}: the retry reused the same invoice`);
    });
  });
});
