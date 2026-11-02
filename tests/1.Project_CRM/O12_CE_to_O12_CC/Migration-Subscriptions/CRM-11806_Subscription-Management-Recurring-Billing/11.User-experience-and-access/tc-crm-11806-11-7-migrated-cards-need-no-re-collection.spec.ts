import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { SubscriptionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { loginToMigCrm } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_11.7 - Migrated payment methods need no card re-collection
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_11.7
 *  Spec ID:         IS-CRM-SEC-0015
 *                   Spec text  : "Migrating or re-establishing stored payment methods shall not
 *                   require card details to be re-collected from customers or handled by NAKIVO
 *                   staff."
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring
 *                   Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-11806 (feature) / CRM-12140 (implementation)
 *  QA card         : NONE - the PDF writes SEC-0015 off as out of the specification's scope. The
 *                   specification carries it as Functional under "User experience & access".
 *                   Written 2026-10-19 on the tester's instruction to follow the specification.
 *  Automation-Type: new
 *  Automation-Date: 2026-10-19
 *  Runs on         : Subscription service https://pre-sales-crm-mig.nakivo.site (Odoo 19, db odoo19)
 *                    read through the CRM's own authenticated peer session
 * --------------------------------------------------------------------------------------------
 *  HOW "NO RE-COLLECTION" IS MADE COUNTABLE.
 *
 *  "Shall not require card details to be re-collected" is an outcome, not a screen. The way to
 *  falsify it from the target is: find a subscription that auto-charges and has NO usable stored
 *  payment reference. Every such subscription is a customer who would have to re-enter a card,
 *  which is exactly what SEC-0015 forbids. So the case counts them, and the count must be
 *  reported - a non-zero count is the finding.
 *
 *  MEASURED ON THE PEER 2026-10-19, so the reader knows what "today" looks like:
 *    - payment.token               : 225 rows
 *    - sale.subscription with payment_token_id set : 287
 *    - every sampled token sits on payment.provider 25, "CRM mirror placeholder (do not enable)",
 *      whose state is `disabled`
 *    - payment.token rows carrying a masked number (`payment_details` set) : 0 of 225
 *
 *  THE LAST LINE IS REPORTED, NOT SCORED HERE. An empty `payment_details` is SEC-0014's subject
 *  ("a masked card number and the provider's own customer reference"), and SEC-0014 is covered by
 *  CRM-11806_11.3. This case would be overreaching to fail on it; it prints it so whoever reads
 *  the run sees it, and 11.3 owns the verdict.
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a user whose peer session can read the subscription
 *    service (admin_crm_mig)
 *    No test data is created - this case only reads the migrated corpus
 *
 *  Steps to reproduce:
 *   1. Count the stored payment tokens on the subscription service
 *   2. Count the subscriptions that carry a stored payment token
 *   3. Count the subscriptions on an auto-charging template that carry NO stored payment token
 *   4. Read the provider the migrated tokens sit on, and its state
 *
 *  Verification Points:
 *   VP1. Stored payment tokens exist on the service - the references were migrated, not dropped
 *   VP2. No subscription on an auto-charging template is left without a stored payment token
 *        (each one would mean a customer re-entering a card, which SEC-0015 forbids)
 *   VP3. The provider the migrated references sit on is recorded, with its state
 *   REPORTED, NOT SCORED: how many tokens carry a masked number - that is SEC-0014 / 11.3
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_11\.7:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_11.7';

/** The two templates the specification says bill in auto-charge mode (FUNC-0140-02 / -03). */
const AUTO_CHARGE_TEMPLATES = ['Monthly Subscription', 'Quarterly Subscription'];
/** How many offenders to NAME in the log. It caps the listing only - never the count. */
const SAMPLE_LIMIT = 20;

const STEP = {
  pre1: 'Pre-condition 1: Login to the CRM (crm-mig.nakivo.site) as a user whose peer session can read the subscription service',
  s1: 'Step 1: Count the stored payment tokens on the subscription service',
  s2: 'Step 2: Count the subscriptions that carry a stored payment token',
  s3: 'Step 3: Count the subscriptions on an auto-charging template that carry NO stored payment token',
  s4: 'Step 4: Read the provider the migrated tokens sit on, and its state',
  verify: 'Verification',
} as const;

test.describe(`${TC_ID} - Migrated payment methods need no card re-collection`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test(`${TC_ID}: Every auto-charging subscription keeps a stored payment reference after the migration @mig-live`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subs = new SubscriptionPageMig(page);
    let tokenCount = 0;
    let withToken = 0;
    let autoChargeTotal = 0;
    let autoChargeWithoutToken = 0;
    let orphans: any[] = [];
    let providers: string[] = [];
    let maskedCount = 0;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      await loginToMigCrm(page, users.admin_crm_mig);
      await subs.loginPresales();
      console.log('  OK - peer session open for the subscription service');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      tokenCount = await subs.presalesCallKw<number>('payment.token', 'search_count', [[]]);
      maskedCount = await subs.presalesCallKw<number>(
        'payment.token', 'search_count', [[['payment_details', '!=', false]]],
      );
      console.log(`  payment.token rows                 : ${tokenCount}`);
      console.log(`  …of those carrying a masked number : ${maskedCount}   [REPORTED, not scored - SEC-0014 / CRM-11806_11.3 owns this]`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      withToken = await subs.presalesCallKw<number>(
        'sale.subscription', 'search_count', [[['payment_token_id', '!=', false]]],
      );
      console.log(`  subscriptions with a stored token  : ${withToken}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const domain = [
        ['template_id.name', 'in', AUTO_CHARGE_TEMPLATES],
        ['stage_id.name', '!=', 'Closed'],
      ];
      const orphanDomain = [...domain, ['payment_token_id', '=', false]];
      // THE COUNT COMES FROM search_count, THE NAMES FROM A CAPPED search_read.
      // The first version of this step took `orphans.length` as the count with `limit: 50` on the
      // read, and the run duly reported "50 of 114" - which was the CAP, not the total. Reading a
      // capped page as a total is the same mistake that produced "the peer holds 200" when it held
      // 1,349; never let a `limit` answer a "how many" question.
      autoChargeTotal = await subs.presalesCallKw<number>('sale.subscription', 'search_count', [domain]);
      autoChargeWithoutToken = await subs.presalesCallKw<number>('sale.subscription', 'search_count', [orphanDomain]);
      orphans = await subs.presalesCallKw<any[]>(
        'sale.subscription', 'search_read',
        [orphanDomain, ['id', 'code', 'partner_id', 'template_id', 'stage_id']],
        { limit: SAMPLE_LIMIT, order: 'id asc' },
      );
      console.log(`  live subscriptions on ${AUTO_CHARGE_TEMPLATES.join(' / ')} : ${autoChargeTotal}`);
      console.log(`  …of those with NO stored payment token             : ${autoChargeWithoutToken}  (counted, not sampled)`);
      // Name them. A bare count sends the next reader back to the database.
      for (const o of orphans) {
        console.log(`    ${o.code}  ${o.template_id?.[1]}  stage=${o.stage_id?.[1]}  customer=${o.partner_id?.[1]}`);
      }
      if (autoChargeWithoutToken > orphans.length) {
        console.log(`    … and ${autoChargeWithoutToken - orphans.length} more (this listing is capped at ${SAMPLE_LIMIT}; the COUNT above is the total)`);
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const rows = await subs.presalesCallKw<any[]>(
        'payment.provider', 'search_read', [[], ['id', 'name', 'state']], { limit: 60 },
      );
      providers = (rows || []).map((r: any) => `${r.id} "${r.name}" state=${r.state}`);
      const sample = await subs.presalesCallKw<any[]>(
        'payment.token', 'search_read', [[], ['provider_id']], { limit: 5 },
      );
      const used = [...new Set((sample || []).map((t: any) => `${t.provider_id?.[0]} "${t.provider_id?.[1]}"`))];
      console.log(`  providers on the service : ${rows?.length ?? 0}`);
      console.log(`  the migrated tokens sit on: ${used.join(' | ') || '(no token read back)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - payment references read from the service').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n=============== VERIFY ${TC_ID} ===============`);
      console.log('VP1 - the payment references survived the migration');
      console.log('  Expected: at least one payment.token on the subscription service');
      console.log(`  Actual  : ${tokenCount}`);
      console.log('VP2 - no auto-charging subscription would need a card re-entered');
      console.log(`  Expected: 0 live subscriptions on ${AUTO_CHARGE_TEMPLATES.join(' / ')} without a stored token`);
      console.log(`  Actual  : ${autoChargeWithoutToken} of ${autoChargeTotal}`);
      console.log('VP3 - the provider the references sit on, recorded');
      console.log(`  Actual  : ${providers.length} provider(s); see Step 4 for which one holds the tokens`);
      console.log(`REPORTED, NOT SCORED: ${maskedCount} of ${tokenCount} tokens carry a masked number (SEC-0014 / CRM-11806_11.3)`);
      console.log('==================================================');

      expect(tokenCount, 'VP1: the migration should have brought stored payment references across').toBeGreaterThan(0);
      expect(withToken, 'VP1: at least one subscription should point at a stored payment token').toBeGreaterThan(0);
      expect(
        autoChargeWithoutToken,
        `VP2: every live auto-charging subscription must keep a stored payment reference - ${autoChargeWithoutToken} would need the customer to re-enter a card, which IS-CRM-SEC-0015 forbids`,
      ).toBe(0);
      expect(providers.length, 'VP3: the service should expose its payment providers').toBeGreaterThan(0);
    });
  });
});
