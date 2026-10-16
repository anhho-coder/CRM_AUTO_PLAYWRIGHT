import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_ENT_MONTHLY,
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin, logObservation } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_7.1 - Upsell is OFF; editing the Subscription lines is the mid-period path
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_7.1
 *  Spec ID:         US7 / SC-34
 *  Spec:            Subscription Test Cases (CRM-12140) - SC-34 - FUNC-0161
 *                   supersedes the FRD: [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature) / CRM-12140 (implementation)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/7.Lifecycle-change-upsell-renewal-suspension-closure/tc-subscription-7-1-upsell-off-lines-are-the-mid-period-path.spec.ts
 *  Baseline TC ID  : subscription-7.1  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-34 (DO NOT SCORE - spec vs delivered)  - "Subscription Test Cases"
 *                    (CRM-12140, Nathan)
 * --------------------------------------------------------------------------------------------
 *  DO NOT SCORE THIS CASE.
 *  SC-34 says so in those words. FUNC-0161 describes an upsell quotation; the delivered
 *  configuration switches upsell OFF. That difference IS this card's subject, so a verdict here
 *  would publish a ruling QA is not entitled to make: a PASS certifies that upsell is absent (which
 *  FUNC-0161 contradicts), a FAIL reports a defect against a configuration nobody has ruled on.
 *  VP1-VP4 therefore RECORD their readings through `logObservation()` instead of asserting them;
 *  only the pre-condition (the subscription has a real Recurring Price) is still a hard assertion.
 *  The document's own convention: "Record as an observation = a known difference between sources:
 *  write down what you saw and do not score it."
 *  Ruling open with the specification owner (PM) on CRM-11806 - restore the assertions only when
 *  the PM has said which side is the specification. Changed 2026-10-16 at the tester's direction.
 *  The sibling case under the same rule is CRM-11806_5.4 (SC-21).
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
 *    Login to the CRM (crm-mig.nakivo.site) as Subscription staff with the "Manage Subscriptions" right
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
 *    npx playwright test --grep "CRM-11806_7\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_7.1';

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

  test.skip(`${TC_ID}: The upsell quotation is switched off and a line added on the subscription is the mid-period path @blocked-devrun`, async ({ page }, testInfo) => {
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
      // NOT SCORED - SC-34 says "DO NOT SCORE THIS CARD". FUNC-0161 describes an upsell
      // quotation while the delivered configuration switches upsell off, and that difference is
      // the card's whole subject, so neither verdict may be published. Ruling open with the PM
      // on CRM-11806. (Changed 2026-10-16 at the tester's direction.)
      logObservation(
        'VP1 - upsell button in the subscription header',
        'FUNC-0161 describes an upsell quotation; the delivered configuration switches upsell off',
        present.length ? `still present: ${present.join(' | ')}` : 'none of the upsell labels is present',
      );
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
      // NOT SCORED - SC-34 says "DO NOT SCORE THIS CARD". FUNC-0161 describes an upsell
      // quotation while the delivered configuration switches upsell off, and that difference is
      // the card's whole subject, so neither verdict may be published. Ruling open with the PM
      // on CRM-11806. (Changed 2026-10-16 at the tester's direction.)
      logObservation(
        'VP2 - upsell entry in the "Action" menu',
        'FUNC-0161 describes an upsell quotation; the delivered configuration switches upsell off',
        found.length ? `the form text still mentions: ${found.join(' | ')}` : 'the form text mentions no upsell entry',
      );
    });

    await test.step(`Step 3: Add a second Subscription line (${SKU_ENT_MONTHLY} x 5) and save`, async () => {
      await subscriptionPage.clickEdit();
      await subscriptionPage.addSubscriptionLine(SKU_ENT_MONTHLY, 5);
      await subscriptionPage.save();
      await subscriptionPage.openByUrl(subscriptionUrl);

      const lineCount = await subscriptionPage.getLineCount();
      const products = await subscriptionPage.getAllLineProducts();
      const priceAfter = await subscriptionPage.getRecurringPrice();
      const hasBoth = products.some((p: any) => p.includes(SKU_O365)) && products.some((p: any) => p.includes(SKU_ENT_MONTHLY));

      logVerify(
        'VP3',
        `the second line is accepted and saved: 2 lines and a Recurring Price above ${priceBefore}`,
        `lines = ${lineCount}, products = [${products.join(' | ')}], Recurring Price = ${priceAfter} (was ${priceBefore})`,
        lineCount === 2 && hasBoth && priceAfter > priceBefore,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - second line saved on the subscription').catch(() => {});
      // NOT SCORED - SC-34 says "DO NOT SCORE THIS CARD". FUNC-0161 describes an upsell
      // quotation while the delivered configuration switches upsell off, and that difference is
      // the card's whole subject, so neither verdict may be published. Ruling open with the PM
      // on CRM-11806. (Changed 2026-10-16 at the tester's direction.)
      logObservation(
        'VP3 - editing the lines as the mid-period path',
        'the card expects the added line to be accepted and to bill from the next period',
        `lines = ${lineCount}, products = [${products.join(' | ')}], Recurring Price = ${priceAfter} (was ${priceBefore}), both SKUs listed = ${hasBoth}`,
      );
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
      // NOT SCORED - SC-34 says "DO NOT SCORE THIS CARD". FUNC-0161 describes an upsell
      // quotation while the delivered configuration switches upsell off, and that difference is
      // the card's whole subject, so neither verdict may be published. Ruling open with the PM
      // on CRM-11806. (Changed 2026-10-16 at the tester's direction.)
      logObservation(
        'VP4 - the stage after a line is added',
        'the card expects the stage NOT to move to "To Upsell"',
        `the stage bar reads "${stage}"`,
      );

      console.log(`OVERALL: ${TC_ID} is a DO-NOT-SCORE card (SC-34) - the four readings above are recorded, not scored.`);
      console.log('   The specification (FUNC-0161) and the delivered configuration disagree about upsell;');
      console.log('   the ruling is open with the specification owner (PM) on CRM-11806.');
    });
  });
});
