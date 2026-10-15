import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_ENT_MONTHLY,
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  createSubscription,
  loginAsCrmAdmin,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-7.1 - Upsell is OFF; editing the Subscription lines is the mid-period path
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-7.1
 *  Spec ID:         US7 / SC-34
 *  Spec:            Subscription Test Cases (CRM-12140) - SC-34 - FUNC-0161
 *                   supersedes the FRD: [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature) / CRM-12140 (implementation)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 *  Automation-Update: 2026-10-07 - inverted. The FRD's upsell quotation (US8) is switched off by
 *                   configuration (nakivo_subscription_integration.upsell_enabled = 0), so this
 *                   case now checks SC-34: no upsell action exists, and a line added on the
 *                   Subscription lines tab is the mid-period path.
 * --------------------------------------------------------------------------------------------
 *  SKIPPED ON PURPOSE - Automation Scope = No in the "Test cases - Master file".
 *  SC-34 is a do-not-score scope guard: the tester records what they see for the specification
 *  owner (PM) rather than passing or failing the card. The body below is complete; to run it,
 *  change `test.skip(` to `test(`.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as Subscription staff with the "Manage Subscriptions" right
 *    (e.g. Anh Ho)
 *    Create the subscription "Cust-Upsell-<unique>" / "Monthly Sub/Invoice only" /
 *      Start date today, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 1
 *    Click "SAVE" and click "IN PROGRESS" on the stage bar
 *
 *  Steps to reproduce:
 *   1. Read the buttons in the form header
 *   2. Open the "Action" menu
 *   3. Open the "Subscription lines" tab, click "EDIT", add a second line with
 *      Product = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription" and Quantity = 5,
 *      then click "SAVE"
 *   4. Read the stage bar
 *   5. Ask the development team to run the billing day of "Date of Next Invoice", once, then
 *      open the newest invoice from "Invoices"
 *
 *  Verification Points:
 *   VP1. There is no upsell button in the header
 *   VP2. There is no upsell action in the "Action" menu
 *   VP3. The second line is accepted and saved, and the Recurring Price rises
 *   VP4. The stage bar still reads "In Progress" - it does NOT move to "To Upsell"
 *
 *  NOT automated here: step 5 / the billing-day check. The billing run is a scheduled job the
 *  development team triggers for a named date, so it stays on the manual card.
 *
 *  Command to run:
 *    npx playwright test --grep "subscription-7\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'subscription-7.1';

/** Header buttons / action entries that would mean the upsell quotation is still reachable. */
const UPSELL_LABELS = ['Upsell', 'Create an Upsell', 'Upsell Quotation'];

test.describe(`${TC_ID} - Upsell is off; lines are the mid-period path`, () => {
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

  test.skip(`${TC_ID}: The upsell quotation is switched off and a line added on the subscription is the mid-period path`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);

    const customerName = `Cust-Upsell-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    let priceBefore = 0;
    let subscriptionUrl = '';

    await loginAsCrmAdmin(page);

    const setup = await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_O365,
      quantity: 1,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Pre-condition: Write down the Reference and the "Recurring Price"', async () => {
      priceBefore = await subscriptionPage.getRecurringPrice();
      subscriptionUrl = page.url();
      console.log(`Pre-condition: Reference = "${setup.reference}", Recurring Price = ${priceBefore}`);
      expect(priceBefore, 'Pre-condition: the subscription should have a real Recurring Price').toBeGreaterThan(0);
    });

    await test.step('Step 1: Read the buttons in the form header', async () => {
      const present: string[] = [];
      for (const label of UPSELL_LABELS) {
        if (await subscriptionPage.isHeaderButtonVisible(label).catch(() => false)) present.push(label);
      }

      logVerify(
        'VP1',
        `no upsell button in the header (looked for: ${UPSELL_LABELS.join(' | ')})`,
        present.length ? `still present: ${present.join(' | ')}` : 'none of them is present',
        present.length === 0,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - subscription header without an upsell button').catch(() => {});
      expect(present, 'VP1: the upsell quotation is switched off, so no upsell button may appear in the header').toEqual([]);
    });

    await test.step('Step 2: Open the "Action" menu and look for an upsell entry', async () => {
      const menuText = await subscriptionPage.getContentText().catch(() => '');
      const found = UPSELL_LABELS.filter(label => new RegExp(label, 'i').test(menuText));

      logVerify(
        'VP2',
        'no upsell action in the "Action" menu, and no way to raise a quotation for an added product',
        found.length ? `the form text still mentions: ${found.join(' | ')}` : 'the form text mentions no upsell entry',
        found.length === 0,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Action menu without an upsell entry').catch(() => {});
      expect(found, 'VP2: no upsell action may be offered on the subscription form').toEqual([]);
    });

    await test.step(`Step 3: Add a second Subscription line (${SKU_ENT_MONTHLY} x 5) and save`, async () => {
      await subscriptionPage.clickEdit();
      await subscriptionPage.addSubscriptionLine(SKU_ENT_MONTHLY, 5);
      await subscriptionPage.save();
      await subscriptionPage.openByUrl(subscriptionUrl);

      const lineCount = await subscriptionPage.getLineCount();
      const products = await subscriptionPage.getAllLineProducts();
      const priceAfter = await subscriptionPage.getRecurringPrice();
      const hasBoth = products.some(p => p.includes(SKU_O365)) && products.some(p => p.includes(SKU_ENT_MONTHLY));

      logVerify(
        'VP3',
        `the second line is accepted and saved: 2 lines and a Recurring Price above ${priceBefore}`,
        `lines = ${lineCount}, products = [${products.join(' | ')}], Recurring Price = ${priceAfter} (was ${priceBefore})`,
        lineCount === 2 && hasBoth && priceAfter > priceBefore,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - second line saved on the subscription').catch(() => {});
      expect(lineCount, 'VP3: the subscription should now hold 2 Subscription lines').toBe(2);
      expect(hasBoth, `VP3: both ${SKU_O365} and ${SKU_ENT_MONTHLY} should be listed (read: ${products.join(' | ')})`).toBeTruthy();
      expect(priceAfter, `VP3: the Recurring Price should rise above ${priceBefore} (read: ${priceAfter})`).toBeGreaterThan(priceBefore);
    });

    await test.step('Step 4: Read the stage bar', async () => {
      const stage = await subscriptionPage.getState();

      logVerify(
        'VP4',
        'the stage bar still reads "In Progress" - adding a line does not move it to "To Upsell"',
        `the stage bar reads "${stage}"`,
        /in\s*progress/i.test(stage) && !/to\s*upsell/i.test(stage),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - stage still In Progress').catch(() => {});
      expect(stage, 'VP4: the subscription must stay "In Progress" after a line is added').toMatch(/in\s*progress/i);

      console.log(`✅ ${TC_ID}: no upsell action exists; the added line is the mid-period path and the stage stayed "In Progress"`);
      console.log('   NOTE: SC-34 is a do-not-score scope guard - record the observed behaviour for the specification owner (PM).');
    });
  });
});
