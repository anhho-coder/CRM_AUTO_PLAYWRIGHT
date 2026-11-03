import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { logVerify, parseMMDDYYYY, dayDiff } from '@helpers/crm-11806-subscription.helper';
import { loginAsCrmAdminMig } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_9.3 - A next billing date set by hand more than one interval ahead is migrated
 *                      unchanged
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_9.3
 *  Spec ID:         IS-CRM-FUNC-0166, IS-CRM-FUNC-0168
 *                   Spec text  : each in-flight subscription's next billing date, amount, currency
 *                                and cycle position is preserved, INCLUDING a next billing date
 *                                set by hand more than one billing interval ahead (0168); the
 *                                template association and per-subscription settings are carried as
 *                                at the snapshot (0166).
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v5 (2026-11-02), which SUPERSEDES the FRD.
 *                   Was        : IS-CRM-FUNC-0169 "where stored billing settings disagree with how
 *                                it actually billed, the cadence is derived from the invoice
 *                                history" - RETIRED in spec v5. Before that, "US11 (Data
 *                                continuity)", an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v5, 2026-11-02)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *
 *  INVERTED 2026-11-02. Aiva answered CRM-13839: cadence is NOT derived from invoice history.
 *  This case used to assert that the migrated "Date of Next Invoice" is one month after the last
 *  invoice rather than one year, i.e. rebuilt from the dates. It now asserts the opposite - the
 *  date arrives unchanged. The real mismatch runs the other way: 92 In Progress subscriptions on
 *  the Monthly templates carry a hand-set next billing date more than two months ahead
 *  (e.g. SUB775 -> 2029-03-05, SUB1081 -> 2027-10-13, both verified on the migrated base
 *  2026-11-02), and each must arrive untouched. Xray case CRM-13626 was rewritten the same day.
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/9.Data-migration/tc-subscription-9-3-the-real-invoice-history-beats-the-template-recurrence.spec.ts
 *  Baseline TC ID  : subscription-9.3  (assertions below are the baseline's, copied verbatim)
 *  QA card         : (migration continuity - no SC card)  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *  ⛔ SKIPPED - [Manual]. Blocked by scope, not by a defect, and the scope changed on 2026-11-03.
 *
 *  THE OLD REASON NO LONGER HOLDS. It used to read "the migrated system does not exist yet".
 *  It does: crm-mig.nakivo.site answers, and steps 2-4 all run against it. That sentence was
 *  stale, not a blocker.
 *
 *  THE REAL BLOCKER is step 1. It reads the CURRENT system - Production - and this suite does not
 *  drive Production. Production is read-only, under a per-task call budget, and an unattended
 *  regression run competing with the sales team for that database is exactly what must not happen.
 *  So the "written down" half of this case is gathered BY HAND, once, and pasted into the
 *  constants below; automation then checks the crm-mig half against them.
 *
 *  WHY THIS CASE MATTERS (rewritten for spec v5): 92 In Progress subscriptions on the Monthly
 *  templates carry a "Date of Next Invoice" more than two months ahead - a date set by hand, i.e.
 *  yearly billing held by an operator rather than by the template (Aiva, CRM-13839, 2 Nov 2026).
 *  IS-CRM-FUNC-0168 requires each of those dates to arrive UNCHANGED. The retired
 *  IS-CRM-FUNC-0169 would have had the migration recompute them from the invoice history, which
 *  would have pulled all 92 forward and billed those customers early.
 *
 *  TO UNBLOCK: fill SNAPSHOT below from the Production record by hand, then change `test.skip(`
 *  to `test(`. Steps 2-4 need no Production access at all.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CURRENT system as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and find one In Progress subscription whose Subscription
 *      Template is a Monthly template but whose "Date of Next Invoice" is more than two months
 *      ahead - i.e. yearly billing held by a date set by hand. 92 such subscriptions exist
 *      (Aiva, CRM-13839, 2 Nov 2026); use SUB775 or SUB1081.
 *    Write down from its form:
 *      - Reference
 *      - Customer
 *      - Subscription Template
 *      - "Date of Next Invoice"
 *      - Recurring Price and Currency
 *      - "Auto set subscription to draft"
 *      - The Recurrence shown on that template
 *        (Subscriptions > Configuration > Subscription Templates)
 *
 *  Steps to reproduce (mirrors CRM-13626 - same order, same content):
 *   1. On the CURRENT system, compare the "Date of Next Invoice" written down against the
 *      Recurrence of its Subscription Template
 *   2. Log in to the MIGRATED system (crm-mig.nakivo.site) and open the same subscription by its
 *      Reference
 *   3. Read its "Date of Next Invoice", Subscription Template and "Auto set subscription to
 *      draft", and compare each against the value written down
 *   4. Read its Customer, Recurring Price, Currency and the stage bar
 *
 *  Verification Points:
 *   VP1. The two disagree: the template is Monthly while "Date of Next Invoice" is more than two
 *        months ahead - the date was set by hand
 *   VP2. The subscription is found by the same Reference
 *   VP3. All three arrived unchanged, exactly as at the snapshot (IS-CRM-FUNC-0166,
 *        IS-CRM-FUNC-0168):
 *        - "Date of Next Invoice" is the same date - it was NOT pulled back to one month after
 *          the last invoice, and NOT recomputed from the template
 *        - Subscription Template is the same Monthly template
 *        - "Auto set subscription to draft" carries the same setting
 *   VP4. Customer, Recurring Price, Currency and stage all match the values written down - the
 *        subscription is In Progress and its first post-cutover cycle is due on the unchanged date
 *
 *  NOTE ON THE FILE NAME: it still reads "the-real-invoice-history-beats-the-template-recurrence",
 *  which is the RETIRED requirement (IS-CRM-FUNC-0169). It is kept because CRM-13626's description
 *  points at this exact path; renaming the file without updating Jira would break that link. The
 *  title, the Spec IDs and every expected result below are the spec-v5 ones.
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_9\.3:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_9.3';

/**
 * The step-1 reading, taken from the CURRENT system BY HAND. Automation never reads Production.
 *
 * Leave `reference` empty and the case fails on its first assertion rather than passing on
 * nothing - an unfilled snapshot must never read as a green migration check.
 *
 * Aiva named SUB775 and SUB1081 on CRM-13839; both were confirmed on the migrated base on
 * 2026-11-02 (SUB775 -> 2029-03-05, SUB1081 -> 2027-10-13, Monthly template, In Progress). Those
 * are the MIGRATED values, which is the thing under test - the Production originals still have to
 * be read by hand and pasted here, or the case would be checking crm-mig against itself.
 */
const SNAPSHOT = {
  reference: '',
  customer: '',
  template: '',
  /** As the form shows it, e.g. '03/05/2029'. */
  dateOfNextInvoice: '',
  recurringPrice: 0,
  currency: '',
  autoSetToDraft: false,
  /** The Recurrence on that template, e.g. 'Months'. */
  templateRecurrence: '',
} as const;

/** IS-CRM-FUNC-0168 is about a date set by hand MORE THAN ONE INTERVAL ahead. */
const HAND_SET_THRESHOLD_MONTHS = 2;

test.describe(`${TC_ID} - A next billing date set by hand more than one interval ahead is migrated unchanged`, () => {
  // Declaration-level skip so the browser fixture never starts - see the [Manual] note above:
  // step 1 reads Production, which this suite does not drive. Fill SNAPSHOT by hand first.
  test.skip(`${TC_ID}: A next billing date set by hand more than one interval ahead is migrated unchanged @mig-ready`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);

    expect(
      SNAPSHOT.reference,
      'SNAPSHOT must be filled from the CURRENT system by hand before this case means anything',
    ).not.toBe('');

    await test.step('Step 1: On the CURRENT system, compare "Date of Next Invoice" against the template Recurrence', async () => {
      console.log(`\n--- Step 1 (read by hand from the CURRENT system) ---`);
      console.log(`  - Reference            : ${SNAPSHOT.reference}`);
      console.log(`  - Subscription Template: ${SNAPSHOT.template} (Recurrence "${SNAPSHOT.templateRecurrence}")`);
      console.log(`  - Date of Next Invoice : ${SNAPSHOT.dateOfNextInvoice}`);

      const parsed = parseMMDDYYYY(SNAPSHOT.dateOfNextInvoice);
      expect(parsed, `VP1: the snapshot date "${SNAPSHOT.dateOfNextInvoice}" should be parseable`).not.toBeNull();
      const monthsAhead = parsed ? dayDiff(new Date(), parsed) / 30.44 : 0;
      const isMonthly = /month/i.test(SNAPSHOT.templateRecurrence);

      logVerify(
        'VP1',
        `The two disagree: the template is Monthly while "Date of Next Invoice" is more than ${HAND_SET_THRESHOLD_MONTHS} months ahead - the date was set by hand`,
        `Recurrence "${SNAPSHOT.templateRecurrence}" (monthly = ${isMonthly}); the date is ~${monthsAhead.toFixed(1)} month(s) ahead`,
        isMonthly && monthsAhead > HAND_SET_THRESHOLD_MONTHS,
      );
      expect(isMonthly, `VP1: the template should be a Monthly one, read "${SNAPSHOT.templateRecurrence}"`).toBe(true);
      expect(monthsAhead, `VP1: the hand-set date should be more than ${HAND_SET_THRESHOLD_MONTHS} months ahead`).toBeGreaterThan(HAND_SET_THRESHOLD_MONTHS);
    });

    await test.step('Step 2: Log in to the MIGRATED system and open the subscription by its Reference', async () => {
      console.log(`\n--- Step 2 ---`);
      await loginAsCrmAdminMig(page);
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const hits = await subscriptionPage.searchInList(SNAPSHOT.reference);

      logVerify(
        'VP2',
        `The subscription is found on crm-mig by the same Reference "${SNAPSHOT.reference}"`,
        `${hits} match(es)`,
        hits === 1,
      );
      expect(hits, `VP2: "${SNAPSHOT.reference}" should be found exactly once on the migrated system`).toBe(1);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - the migrated subscription').catch(() => {});
    });

    await test.step('Step 3: Read "Date of Next Invoice", Subscription Template and "Auto set subscription to draft"', async () => {
      console.log(`\n--- Step 3 ---`);
      const migratedDate = await subscriptionPage.getDateOfNextInvoice();
      const migratedTemplate = await subscriptionPage.getSubscriptionTemplate();

      logVerify(
        'VP3a',
        `"Date of Next Invoice" arrived unchanged - still ${SNAPSHOT.dateOfNextInvoice}, NOT pulled back to one month after the last invoice and NOT recomputed from the template (IS-CRM-FUNC-0168)`,
        `migrated "Date of Next Invoice" = "${migratedDate}"`,
        migratedDate === SNAPSHOT.dateOfNextInvoice,
      );
      expect(migratedDate, 'VP3: the hand-set next billing date must be migrated unchanged (IS-CRM-FUNC-0168)').toBe(SNAPSHOT.dateOfNextInvoice);

      logVerify(
        'VP3b',
        `Subscription Template is the same Monthly template "${SNAPSHOT.template}" (IS-CRM-FUNC-0166)`,
        `migrated template = "${migratedTemplate}"`,
        migratedTemplate === SNAPSHOT.template,
      );
      expect(migratedTemplate, 'VP3: the template association is carried as at the snapshot (IS-CRM-FUNC-0166)').toBe(SNAPSHOT.template);

      // "Auto set subscription to draft" IS NOT READ. SubscriptionPageEmbed exposes two measured
      // checkboxes - to_renew and subscription_reminder - and this is neither. Asserting one of
      // them as this field would publish a verdict on a setting the spec never looked at.
      console.log('  - "Auto set subscription to draft" NOT CHECKED: no measured reader on the embed.');
      console.log('    VP3c stays a MANUAL check until the field name is dumped from the embed form.');
    });

    await test.step('Step 4: Read Customer, Recurring Price, Currency and the stage bar', async () => {
      console.log(`\n--- Step 4 ---`);
      const customer = await subscriptionPage.getCustomer();
      const price = await subscriptionPage.getRecurringPrice();
      const stage = await subscriptionPage.getState();

      logVerify(
        'VP4',
        `Customer "${SNAPSHOT.customer}", Recurring Price ${SNAPSHOT.recurringPrice} and stage "In Progress" all match the values written down`,
        `Customer "${customer}", Recurring Price ${price}, stage "${stage}"`,
        customer === SNAPSHOT.customer && price === SNAPSHOT.recurringPrice && stage === 'In Progress',
      );
      expect(customer, 'VP4: Customer should arrive unchanged').toBe(SNAPSHOT.customer);
      expect(price, 'VP4: Recurring Price should arrive unchanged').toBe(SNAPSHOT.recurringPrice);
      expect(stage, 'VP4: the subscription should still be In Progress').toBe('In Progress');

      // Currency is not exposed on its own by the embed page object - getRecurringPrice() returns
      // a number, not an amount with its currency. Named, not guessed.
      console.log(`  - Currency NOT CHECKED: the embed reader returns a bare number. Expected "${SNAPSHOT.currency}" - MANUAL.`);

      console.log(`✅ ${TC_ID}: ${SNAPSHOT.reference} kept its hand-set billing date through the migration`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - migrated values').catch(() => {});
    });
  });
});
