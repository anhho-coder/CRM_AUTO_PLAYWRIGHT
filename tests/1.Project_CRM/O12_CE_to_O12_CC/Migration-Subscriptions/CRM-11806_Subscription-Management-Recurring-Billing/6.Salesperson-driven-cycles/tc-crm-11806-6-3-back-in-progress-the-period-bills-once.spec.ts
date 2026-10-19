import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { InvoicePage } from '@pages';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage, LoginPageMig as LoginPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { logVerify, parseMMDDYYYY, dayDiff, todayMMDDYYYY } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_6.3 - A subscription put back to In Progress before its billing date bills
 *                    the period exactly once
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_6.3
 *  Spec ID:         IS-CRM-FUNC-0159, IS-CRM-FUNC-0191 / SC-24
 *                   Spec text  : a manual raise bills the cycle exactly once
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "SC-24 / FUNC-0159, FUNC-0191" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/6.Salesperson-driven-cycles/tc-subscription-6-3-back-in-progress-the-period-bills-once.spec.ts
 *  Baseline TC ID  : subscription-6.3  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-24  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *  ⛔ SKIPPED - BLOCKED ON MANUAL STEP
 *
 *  Step 2 asks the development team to run the billing day of "Date of Next Invoice", which is
 *  a scheduled job that the development team triggers for a named date on the CRM (crm-mig.nakivo.site). QA
 *  does not run this job. The test body is complete and needs no other edit; to unblock, wait
 *  until the development team can coordinate the billing run for the test's billing date.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login as Subscription staff with the "Manage Subscriptions" right (e.g. Anh Ho) on
 *      the CRM (crm-mig.nakivo.site) (crm-mig.nakivo.site)
 *    Create a new subscription in Subscriptions > Subscriptions with:
 *      - Customer = "Cust-Resume-<unique>"
 *      - Subscription Template = "Monthly Sub/Invoice only"
 *      - Start date = today
 *      - one Subscription Line, Product = "[CP-NC-O365] Office 365 for CSP - No Commitment",
 *        Quantity = 1
 *    Click "SAVE", move it to "In Progress", tick "Subscription Reminder" and set
 *      "Remind Before Days" = 10
 *    Ask the development team to flag it for manual invoicing and to run the reminder day, so
 *      the subscription is parked in "Draft"
 *    Note "Date of Next Invoice" and the "Invoices" count
 *
 *  Steps to reproduce:
 *   1. Confirm the stage bar reads "Draft", then click "IN PROGRESS" - do this before the
 *      billing date
 *   2. [MANUAL ONLY - the billing run is a scheduled job the development team triggers for
 *      a named date] Ask the development team to run the billing day of "Date of Next Invoice",
 *      once
 *   3. Reopen the subscription and read the "Invoices" smart button and "Date of Next Invoice"
 *   4. Open the newest invoice from "Invoices" and read the period it covers
 *
 *  Verification Points:
 *   1. The stage bar reads "In Progress"
 *   3. The "Invoices" count is exactly one higher than noted in the pre-conditions - not two
 *      higher; "Date of Next Invoice" has moved forward by one month
 *   4. Exactly one invoice covers that period; no second invoice exists for the same period
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_6\.3:" --project=chromium
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
const TC_ID = 'CRM-11806_6.3';
const ADMIN = users.admin_crm_mig;
const TEMPLATE = 'Monthly Sub/Invoice only';
const PRODUCT_SKU = 'CP-NC-O365';
const QUANTITY = 1;
const NEXT_DATE_TOLERANCE_DAYS = 2;

const STEP = {
  pre1: 'Pre-condition 1: Login as Subscription staff (Anh Ho) with "Manage Subscriptions" right on the CRM (crm-mig.nakivo.site)',
  pre2: 'Pre-condition 2: Create a new subscription in Subscriptions > Subscriptions',
  pre3: 'Pre-condition 3: Fill the subscription form (Customer / Template / Start Date / Product)',
  pre4: 'Pre-condition 4: Save subscription, move it to In Progress, tick Subscription Reminder with Remind Before Days = 10',
  pre5: 'Pre-condition 5: Ask development team to flag for manual invoicing and run reminder day, parking in Draft',
  pre6: 'Pre-condition 6: Note Date of Next Invoice and Invoices count',
  s1: 'Step 1: Confirm the stage bar reads "Draft", then click "IN PROGRESS" - do this before the billing date',
  s2: 'Step 2: [MANUAL ONLY - the billing run is a scheduled job the development team triggers for a named date] Ask the development team to run the billing day of "Date of Next Invoice", once',
  s3: 'Step 3: Reopen the subscription and read the "Invoices" smart button and "Date of Next Invoice"',
  s4: 'Step 4: Open the newest invoice from "Invoices" and read the period it covers',
} as const;

test.describe(`${TC_ID} - A subscription put back to In Progress before billing date bills once`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // A subscription that has produced an invoice cannot be cleanly deleted, so it is left
    // behind on purpose. Every run creates its own uniquely-named Customer, so re-runs never collide.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip(`${TC_ID}: A subscription put back to In Progress before billing date bills the period exactly once @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const unique = CommonUtils.generateUniqueId();
    const customerName = `Cust-Resume-${unique}`;
    let reference = '';
    let subscriptionUrl = '';
    let dateOfNextInvoiceAtPre = '';
    let invoiceCountAtPre = -1;

    // ===================== Pre-conditions =====================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`Logging in as ${ADMIN.username}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ADMIN.username, ADMIN.password, CommonUtils.waitTimes.login);
      console.log('✓ Logged in');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('Opening the Subscriptions list and creating a new subscription');
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clickCreate();
      console.log('✓ New subscription form opened');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      console.log(`  - Customer              : ${customerName}`);
      console.log(`  - Subscription Template : ${TEMPLATE}`);
      console.log(`  - Start Date            : ${todayMMDDYYYY()}`);
      console.log(`  - Product               : ${PRODUCT_SKU}, Quantity = ${QUANTITY}`);
      await subscriptionPage.fillMany2One('partner_id', customerName, true);
      await subscriptionPage.fillMany2One('template_id', TEMPLATE);
      await subscriptionPage.setDateField('date_start', todayMMDDYYYY());
      await subscriptionPage.addSubscriptionLine(PRODUCT_SKU, QUANTITY);
      console.log('✓ Subscription form filled');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      console.log('Saving subscription, moving to In Progress, setting Subscription Reminder');
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      reference = await subscriptionPage.getCode();
      console.log(`  - Reference = "${reference}"`);
      await subscriptionPage.setStage('In Progress');
      await subscriptionPage.setCheckbox('reminder_ids', true);
      await subscriptionPage.fillMany2One('reminder_before_days', '10');
      console.log('✓ Subscription moved to In Progress, Reminder configured');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      console.log('NOTE: Development team should flag for manual invoicing and run reminder day');
      console.log('This marks the subscription as Draft and sets up the reminder cycle');
      subscriptionUrl = page.url();
      console.log(`  - Subscription URL: ${subscriptionUrl}`);
      console.log('✓ Step depends on manual development team intervention');
    });

    await test.step(STEP.pre6, async () => {
      console.log(`\n--- ${STEP.pre6} ---`);
      console.log('Reading current state before development team runs reminder job');
      dateOfNextInvoiceAtPre = await subscriptionPage.getDateOfNextInvoice();
      invoiceCountAtPre = await subscriptionPage.getInvoiceCount();
      console.log(`  - Date of Next Invoice: "${dateOfNextInvoiceAtPre}"`);
      console.log(`  - Invoices count: ${invoiceCountAtPre}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - subscription state before reminder job').catch(() => {});
    });

    // ===================== Steps to reproduce =====================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log('Verifying stage bar reads "Draft", then clicking IN PROGRESS');
      const stateBeforeClick = await subscriptionPage.getState();
      console.log(`  - State before click: "${stateBeforeClick}"`);

      await subscriptionPage.setStage('In Progress');
      const stateAfterClick = await subscriptionPage.getState();
      console.log(`  - State after click: "${stateAfterClick}"`);

      console.log('====================  VERIFY ====================');
      console.log(`  Expected: State bar = "In Progress"`);
      console.log(`  Actual  : State bar = "${stateAfterClick}"`);
      console.log(`  Result  : ${stateAfterClick === 'In Progress' ? 'PASS' : 'FAIL'}`);
      console.log(`OVERALL  : ${stateAfterClick === 'In Progress' ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      let __verifyPassed = false;
      try {
        expect(stateBeforeClick, 'The subscription should be in Draft after the reminder job parks it').toBe('Draft');
        expect(stateAfterClick, 'VP1: The stage bar should read "In Progress"').toBe('In Progress');
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 1 - subscription moved back to In Progress', passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('NOTE: This is a manual step. The development team must trigger the billing job');
      console.log(`for the Date of Next Invoice ("${dateOfNextInvoiceAtPre}") on the CRM (crm-mig.nakivo.site).`);
      console.log('Once the job completes, the test can resume from Step 3.');
      console.log('✓ Step is manual - awaiting development team action');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log('Reopening the subscription to read the current state after billing');
      await subscriptionPage.openByUrl(subscriptionUrl);
      const dateOfNextInvoiceAfter = await subscriptionPage.getDateOfNextInvoice();
      const invoiceCountAfter = await subscriptionPage.getInvoiceCount();

      console.log(`  - Invoices count before: ${invoiceCountAtPre}`);
      console.log(`  - Invoices count after: ${invoiceCountAfter}`);
      console.log(`  - Date of Next Invoice (before): "${dateOfNextInvoiceAtPre}"`);
      console.log(`  - Date of Next Invoice (after): "${dateOfNextInvoiceAfter}"`);

      // Parse dates to verify advancement
      const dateBefore = parseMMDDYYYY(dateOfNextInvoiceAtPre);
      const dateAfter = parseMMDDYYYY(dateOfNextInvoiceAfter);
      const diff = dateAfter && dateBefore ? dayDiff(dateAfter, dateBefore) : 0;

      const invoiceDelta = invoiceCountAfter - invoiceCountAtPre;

      console.log('====================  VERIFY ====================');
      console.log(`  Expected: Invoices count = ${invoiceCountAtPre} + 1 (exactly one higher, not two); Date advanced by one month`);
      console.log(`  Actual  : Invoices count delta = ${invoiceDelta}; Date advanced by ${diff} day(s)`);
      console.log(`  Result  : ${invoiceDelta === 1 && Math.abs(diff - 30) <= NEXT_DATE_TOLERANCE_DAYS ? 'PASS' : 'FAIL'}`);
      console.log(`OVERALL  : ${invoiceDelta === 1 && Math.abs(diff - 30) <= NEXT_DATE_TOLERANCE_DAYS ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - subscription state after billing').catch(() => {});

      let __verifyPassed = false;
      try {
        expect(invoiceDelta, 'VP3: Exactly ONE invoice should be created (not zero, not two)').toBe(1);
        expect(dateAfter, `VP3: Date of Next Invoice should be parseable (got "${dateOfNextInvoiceAfter}")`).not.toBeNull();
        expect(
          Math.abs(diff - 30),
          `VP3: Date of Next Invoice should advance by one month (was "${dateOfNextInvoiceAtPre}", now "${dateOfNextInvoiceAfter}")`
        ).toBeLessThanOrEqual(NEXT_DATE_TOLERANCE_DAYS);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 3 - invoice count incremented by exactly one, date advanced', passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log('Opening Invoices list to verify exactly one invoice was created');

      // Get the recurring price before navigating away
      const recurringPrice = await subscriptionPage.getRecurringPrice();

      // Open invoices list
      await subscriptionPage.openInvoices();
      const invoiceRowCount = await invoicePage.getInvoiceListRowCount();
      console.log(`  - Invoice list row count: ${invoiceRowCount}`);

      // Open the first (and only) invoice
      await invoicePage.openFirstInvoiceRow();
      console.log('✓ Invoice detail page opened');

      // Read invoice properties
      const invoiceTotalRaw = await invoicePage.getInvoiceTotal();
      await invoicePage.clickOtherInforTab();
      const invoiceSourceDoc = await invoicePage.getSourceDocument();

      // Parse amount for numeric comparison
      const parseAmount = (raw: string): number => {
        return parseFloat((raw || '').replace(/ /g, ' ').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
      };

      const invoiceTotalNumeric = parseAmount(invoiceTotalRaw);

      console.log('====================  VERIFY ====================');
      console.log(`  Expected: Exactly one invoice listed; Source Document includes reference "${reference}"`);
      console.log(`  Actual  : Invoice list = ${invoiceRowCount}; Source Document = "${invoiceSourceDoc}"`);
      console.log(`  Result  : ${invoiceRowCount === 1 && invoiceSourceDoc.includes(reference) ? 'PASS' : 'FAIL'}`);
      console.log(`OVERALL  : ${invoiceRowCount === 1 && invoiceSourceDoc.includes(reference) ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      let __verifyPassed = false;
      try {
        expect(invoiceRowCount, 'VP4: Exactly one invoice should be listed').toBe(1);
        expect(invoiceSourceDoc, `VP4: Source Document should reference the subscription "${reference}"`).toContain(reference);
        expect(invoiceTotalNumeric, `VP4: Invoice total should match Recurring Price (${recurringPrice})`).toBe(recurringPrice);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 4 - invoice verified with correct Source Document and Total', passed: __verifyPassed }).catch(() => {});
      }

      console.log(`✅ ${TC_ID}: subscription moved back to In Progress billed the period exactly once`);
    });
  });
});
