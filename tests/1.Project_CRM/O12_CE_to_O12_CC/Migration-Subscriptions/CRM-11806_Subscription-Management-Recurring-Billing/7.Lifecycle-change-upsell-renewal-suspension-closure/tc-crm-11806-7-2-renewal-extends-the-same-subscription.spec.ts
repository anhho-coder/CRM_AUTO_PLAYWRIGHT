import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { QuotationPage } from '@pages';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_ENT_MONTHLY,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  dayDiff,
  logVerify,
  monthsFromTodayMMDDYYYY,
  parseMMDDYYYY,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_7.2 - No renewal quotation is created from a subscription; it is extended in place
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_7.2
 *  Spec ID:         IS-CRM-FUNC-0200, IS-CRM-FUNC-0160 / SC-25
 *                   Spec text  : a subscription raises NO quotation of its own; quotations for
 *                                subscription products come from an opportunity (0200). A
 *                                subscription is extended by editing it in place - lines, price,
 *                                next billing date - billed from the next cycle (0160).
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v5 (2026-11-02), which SUPERSEDES the FRD.
 *                   Was        : IS-CRM-FUNC-0162 "a renewal quotation EXTENDS the existing
 *                                subscription" - RETIRED in spec v5. Was "US8 (Renewal)", an FRD
 *                                user story, replaced 2026-10-19.
 *
 *  INVERTED 2026-11-02. Aiva answered CRM-13836: renewing a subscription is not in use. No running
 *  subscription carries an End Date (Production, 2 Nov 2026), and the "Invalid Operation: Please
 *  create quotation by clicking the "New Quotation" button from an Opportunity !!!" message that
 *  SUB00191 answered with IS the expected result. Every assertion below used to say the opposite.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.

 *  WHY IT IS STILL SKIPPED (@blocked-embed-port)
 *  Measured 2026-10-20: clickNewInEmbed() timed out after 30 s - the embed's "New" button never
 *  became visible in the peer frame. The adapter reaches the screen but cannot start a new
 *  record from it. Not mail, not the product flag.
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/7.Lifecycle-change-upsell-renewal-suspension-closure/tc-subscription-7-2-renewal-extends-the-same-subscription.spec.ts
 *  Baseline TC ID  : subscription-7.2  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-25  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *    Create the subscription "Cust-Renew-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date today / End Date = today plus 1 month /
 *      To Renew ticked, with one line
 *      "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription" x 50
 *    Click "SAVE", click "IN PROGRESS"
 *    Write down the Reference and the End Date
 *    NOTE: "Create A Renewal Quotation" is hidden unless the subscription has an End Date or
 *          "To Renew" is ticked
 *
 *  Steps to reproduce:
 *   1. Click "Create A Renewal Quotation" in the subscription header
 *   2. On the created quotation read the Customer and the "Order Lines" tab
 *   3. Click "CONFIRM"
 *   4. Go back to the subscription and read its End Date and status bar
 *   5. Open Subscriptions > Subscriptions, search "Cust-Renew-<unique>" and count the records
 *
 *  Verification Points:
 *   VP2. The renewal quotation carries the same Customer and the same product line
 *   VP4. The original subscription is extended and still live: IN PROGRESS and a later End Date
 *   VP5. Exactly 1 subscription exists - the renewal created no second one
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_7\.2:" --project=chromium
 * ============================================================================================
 */

/**
 * NOTE 2026-10-12 - the "blocked-create" tag was REMOVED. It is no longer a blocker.
 *
 * The baseline's `Subscriptions > CREATE` does not exist on crm-mig, but the tester's instruction
 * is to use **Subscriptions > New** instead, and that stand-in is built and proven:
 * `createSubscriptionViaEmbed()` in helpers/crm-11806-mig-subscription.helper.ts drives
 * New -> fill -> cloud save, green in CRM-11806_11.2 and CRM-11806_11.1.
 * Whatever still keeps this spec skipped is named in its remaining @blocked-* tag, if any.
 */
const TC_ID = 'CRM-11806_7.2';

test.describe(`${TC_ID} - A renewal extends the same subscription`, () => {
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

  test.skip(`${TC_ID}: A subscription raises no renewal quotation; it is extended by editing it in place @blocked-embed-port`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);

    const customerName = `Cust-Renew-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    const nextInvoiceLater = monthsFromTodayMMDDYYYY(2);
    let reference = '';
    let priceBefore = 0;
    let nextInvoiceBefore = '';
    let subscriptionUrl = '';

    await loginAsCrmAdmin(page);

    const setup = await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_ENT_MONTHLY,
      quantity: 50,
      startDate: today,
    });
    reference = setup.reference;

    await test.step('Pre-condition: move the subscription to IN PROGRESS and write down its Reference, Recurring Price and Date of Next Invoice', async () => {
      // No End Date and no "To Renew": per Aiva on CRM-13836 (2 Nov 2026) no running subscription
      // carries an End Date, so setting one would test a state that does not occur.
      await subscriptionPage.setStage('In Progress');
      await subscriptionPage.waitForLoaded();

      priceBefore = await subscriptionPage.getRecurringPrice();
      nextInvoiceBefore = await subscriptionPage.getDateOfNextInvoice();
      subscriptionUrl = page.url();
      console.log(`Pre-condition: Reference = "${reference}", Recurring Price = ${priceBefore}, Date of Next Invoice = "${nextInvoiceBefore}"`);
      expect(reference, 'Pre-condition: the subscription should carry a Reference').not.toBe('');
    });

    await test.step('Step 1: Click "Create A Renewal Quotation" in the subscription header', async () => {
      const visible = await subscriptionPage.isHeaderButtonVisible('Create A Renewal Quotation');
      console.log(`  - "Create A Renewal Quotation" visible: ${visible}`);

      let refusalText = '';
      if (visible) {
        await subscriptionPage.clickHeaderButton('Create A Renewal Quotation');
        refusalText = await subscriptionPage.readAndDismissDialog();
        console.log(`  - dialog after the click: "${refusalText}"`);
      }

      // Two shapes are acceptable, and the Xray case CRM-13618 says so too: today the button is
      // there and refuses; IS-CRM-FUNC-0200 also allows hiding it, in which case there is nothing
      // to click. What is NOT acceptable is a quotation being created.
      const refused = !visible || /invalid\s*operation|new\s*quotation|opportunity/i.test(refusalText);
      const landedOnQuotation = /sale\.order|quotation/i.test(page.url());

      logVerify(
        'VP1',
        'no quotation is created from the subscription: either the button is absent (optional change in IS-CRM-FUNC-0200) or it refuses with "Invalid Operation: Please create quotation by clicking the "New Quotation" button from an Opportunity !!!"',
        `button visible = ${visible}, dialog = "${refusalText}", url after the click = "${page.url()}"`,
        refused && !landedOnQuotation,
      );

      let __verifyPassed = false;
      try {
        expect(refused, `VP1: the subscription must raise no renewal quotation. Button visible = ${visible}, dialog read: "${refusalText}"`).toBeTruthy();
        expect(landedOnQuotation, `VP1: the click must not open a quotation, but the page is now "${page.url()}"`).toBeFalsy();
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 1 - renewal quotation refused', passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step(`Step 2: Open Sales > Quotations and search for "${customerName}"`, async () => {
      // BLOCKED: counting quotations needs the embed list view, whose search methods are still
      // notPorted() on SubscriptionPageEmbed - see tests/_explore/subs-mig-embed-list-search-dom-20261102.
      // Deliberately left unimplemented rather than asserted loosely; the manual case covers VP2.
      console.log('Step 2 (VP2): not automated - no quotation list reader on the embed yet. Covered by the manual case CRM-13618.');
    });

    await test.step(`Step 3: Search "${customerName}" in Subscriptions and count the records`, async () => {
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const rows = await subscriptionPage.searchInList(customerName);

      logVerify(
        'VP3',
        `exactly 1 subscription exists for "${customerName}" - the attempt created no second one`,
        `the list returned ${rows} record(s)`,
        rows === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - still only one subscription').catch(() => {});
      expect(rows, `VP3: the refused renewal must not create a second subscription for "${customerName}"`).toBe(1);
    });

    await test.step(`Step 4: Edit the subscription in place - move "Date of Next Invoice" to ${nextInvoiceLater}`, async () => {
      await subscriptionPage.openByUrl(subscriptionUrl);
      await subscriptionPage.clickEdit();
      await subscriptionPage.setDateOfNextInvoice(nextInvoiceLater);
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();

      const nextInvoiceAfter = await subscriptionPage.getDateOfNextInvoice();
      const before = parseMMDDYYYY(nextInvoiceBefore);
      const after = parseMMDDYYYY(nextInvoiceAfter);
      const movedLater = !!(before && after && dayDiff(after, before) > 0);

      logVerify(
        'VP4',
        `the subscription is extended in place: "Date of Next Invoice" moves later than "${nextInvoiceBefore}" (IS-CRM-FUNC-0160)`,
        `Date of Next Invoice = "${nextInvoiceAfter}" (was "${nextInvoiceBefore}")`,
        movedLater,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - extended in place').catch(() => {});
      expect(movedLater, `VP4: "Date of Next Invoice" should move later than "${nextInvoiceBefore}", but it reads "${nextInvoiceAfter}"`).toBeTruthy();

      // The Xray case also changes the line Quantity from 50 to 60. The embed adapter has no
      // setter for an existing line's quantity (only addSubscriptionLine), so that half stays
      // manual; the price is read here only to show it did not change by itself.
      console.log(`  - Recurring Price after the in-place edit = ${await subscriptionPage.getRecurringPrice()} (was ${priceBefore}); the quantity change is manual-only`);
    });

    await test.step('Step 5: Read the Reference and the stage bar, then count the subscriptions again', async () => {
      const referenceAfter = await subscriptionPage.getCode();
      const state = await subscriptionPage.getState();

      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const rows = await subscriptionPage.searchInList(customerName);

      logVerify(
        'VP5',
        `same Reference ("${reference}"), still IN PROGRESS, and still exactly 1 subscription - extending it created no second one`,
        `Reference = "${referenceAfter}", state = "${state}", the list returned ${rows} record(s)`,
        referenceAfter === reference && /in\s*progress/i.test(state) && rows === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - one subscription, extended in place').catch(() => {});
      expect(referenceAfter, `VP5: the Reference should still be "${reference}" (read: "${referenceAfter}")`).toBe(reference);
      expect(state, `VP5: the subscription should still be IN PROGRESS (state read: "${state}")`).toMatch(/in\s*progress/i);
      expect(rows, `VP5: extending in place must not create a second subscription for "${customerName}"`).toBe(1);

      console.log(`✅ ${TC_ID}: subscription "${reference}" raised no quotation and was extended in place`);
    });
  });
});
