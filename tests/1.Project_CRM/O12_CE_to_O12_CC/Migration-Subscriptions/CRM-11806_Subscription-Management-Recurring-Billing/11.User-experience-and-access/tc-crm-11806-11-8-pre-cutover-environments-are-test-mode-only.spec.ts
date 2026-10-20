import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { SubscriptionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { loginToMigCrm } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_11.8 - A pre-cutover environment cannot charge a real customer
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_11.8
 *  Spec ID:         IS-CRM-SEC-0016
 *                   Spec text  : "Before cutover, every environment holding migrated payment
 *                   references shall operate against the payment provider in test mode only, so
 *                   that no real customer can be charged from a pre-cutover environment (migrated
 *                   payment references are live; CRM-12137)."
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring
 *                   Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-11806 (feature) / CRM-12140 (implementation)
 *  QA card         : NONE - the PDF writes SEC-0016 off as out of the specification's scope. The
 *                   specification carries it as Functional under "User experience & access", and
 *                   its own parenthesis says why it matters: "migrated payment references are
 *                   live". Written 2026-10-19 on the tester's instruction to follow the spec.
 *  Automation-Type: new
 *  Automation-Date: 2026-10-19
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE) AND
 *                    Subscription service https://pre-sales-crm-mig.nakivo.site (Odoo 19, db odoo19)
 * --------------------------------------------------------------------------------------------
 *  THIS IS THE ONE CASE IN THE SUITE WHOSE FAILURE COSTS REAL MONEY.
 *
 *  SEC-0016 exists because the migrated payment references are the REAL ones. If any environment
 *  holding them is pointed at the provider in live mode, a billing run on a test base can charge
 *  an actual customer's card. So this case checks BOTH sides, and a single non-test provider on
 *  either side fails it.
 *
 *  THE TWO SIDES SPELL IT DIFFERENTLY - measured 2026-10-19, do not "simplify" this:
 *    - CRM (Odoo 12)      : model `payment.acquirer`, field `environment` in {'test','prod'}.
 *                           11 rows today, every one `environment = 'test'`.
 *    - service (Odoo 19)  : model `payment.provider` (renamed; `payment.acquirer` 404s), field
 *                           `state` in {'disabled','test','enabled'} - `enabled` IS live mode.
 *                           25 rows today, every one `state = 'disabled'`.
 *  A check written against one model name silently passes on the other side, because an unknown
 *  model raises - which a `.catch(() => [])` would turn into "nothing to complain about". Every
 *  read here is therefore asserted to have RETURNED ROWS before its contents are judged.
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a user who can read the payment configuration and
 *    whose peer session can read the subscription service (admin_crm_mig)
 *    No test data is created - this case only reads configuration
 *
 *  Steps to reproduce:
 *   1. Read every payment.acquirer on the CRM and its "environment"
 *   2. Read every payment.provider on the subscription service and its "state"
 *   3. Confirm the service holds migrated payment references, so SEC-0016 applies to it
 *
 *  Verification Points:
 *   VP1. The CRM read returned rows, and no acquirer is in production mode
 *   VP2. The service read returned rows, and no provider is in the "enabled" (live) state
 *   VP3. The service does hold payment references - so VP2 is not vacuously true of an empty base
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_11\.8:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_11.8';

/** Odoo 12 `payment.acquirer.environment` - anything that is not this is live. */
const CRM_TEST_ENVIRONMENT = 'test';
/** Odoo 19 `payment.provider.state` - 'enabled' is live; 'test' and 'disabled' cannot charge. */
const SERVICE_SAFE_STATES = ['test', 'disabled'];

const STEP = {
  pre1: 'Pre-condition 1: Login to the CRM (crm-mig.nakivo.site) as a user who can read the payment configuration',
  s1: 'Step 1: Read every payment.acquirer on the CRM and its "environment"',
  s2: 'Step 2: Read every payment.provider on the subscription service and its "state"',
  s3: 'Step 3: Confirm the service holds migrated payment references, so SEC-0016 applies to it',
  verify: 'Verification',
} as const;

test.describe(`${TC_ID} - A pre-cutover environment cannot charge a real customer`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test(`${TC_ID}: Neither the CRM nor the subscription service can reach the payment provider in live mode @mig-live`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subs = new SubscriptionPageMig(page);
    let crmRows: any[] = [];
    let crmLive: any[] = [];
    let svcRows: any[] = [];
    let svcLive: any[] = [];
    let tokenCount = 0;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      await loginToMigCrm(page, users.admin_crm_mig);
      await subs.loginPresales();
      console.log('  OK - signed in on the CRM and on the subscription service');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      crmRows = await subs.readKw<any[]>(
        'payment.acquirer', 'search_read', [[], ['name', 'provider', 'environment', 'website_published']],
        { limit: 60 },
      );
      crmLive = (crmRows || []).filter((r: any) => String(r.environment) !== CRM_TEST_ENVIRONMENT);
      console.log(`  payment.acquirer rows on the CRM : ${crmRows?.length ?? 0}`);
      for (const r of crmRows || []) {
        console.log(`    ${String(r.name).padEnd(24)} provider=${r.provider} environment=${r.environment}` +
                    `${r.website_published ? '  [published to the portal]' : ''}`);
      }
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      svcRows = await subs.presalesCallKw<any[]>(
        'payment.provider', 'search_read', [[], ['name', 'code', 'state']], { limit: 80 },
      );
      svcLive = (svcRows || []).filter((r: any) => !SERVICE_SAFE_STATES.includes(String(r.state)));
      const tally: Record<string, number> = {};
      for (const r of svcRows || []) tally[String(r.state)] = (tally[String(r.state)] ?? 0) + 1;
      console.log(`  payment.provider rows on the service : ${svcRows?.length ?? 0}`);
      console.log(`  state tally                          : ${JSON.stringify(tally)}`);
      for (const r of svcLive) console.log(`    LIVE: ${r.name} (code=${r.code}, state=${r.state})`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      tokenCount = await subs.presalesCallKw<number>('payment.token', 'search_count', [[]]);
      console.log(`  payment.token rows on the service : ${tokenCount}`);
      console.log('  (SEC-0016 applies to an environment HOLDING migrated references - this is that check)');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - payment configuration read from both sides').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n=============== VERIFY ${TC_ID} ===============`);
      console.log('VP1 - the CRM cannot charge for real');
      console.log(`  Expected: at least one payment.acquirer row, and 0 with environment != "${CRM_TEST_ENVIRONMENT}"`);
      console.log(`  Actual  : ${crmRows?.length ?? 0} row(s), ${crmLive.length} in production mode` +
                  `${crmLive.length ? ' -> ' + crmLive.map((r: any) => `${r.name}=${r.environment}`).join(', ') : ''}`);
      console.log('VP2 - the subscription service cannot charge for real');
      console.log(`  Expected: at least one payment.provider row, and 0 in a state outside [${SERVICE_SAFE_STATES.join(', ')}]`);
      console.log(`  Actual  : ${svcRows?.length ?? 0} row(s), ${svcLive.length} live` +
                  `${svcLive.length ? ' -> ' + svcLive.map((r: any) => `${r.name}=${r.state}`).join(', ') : ''}`);
      console.log('VP3 - the service really does hold migrated references');
      console.log(`  Expected: more than 0 payment.token rows, so VP2 is not vacuous`);
      console.log(`  Actual  : ${tokenCount}`);
      console.log('==================================================');

      expect(crmRows?.length ?? 0, 'VP1: the payment.acquirer read returned nothing - the check cannot be trusted').toBeGreaterThan(0);
      expect(
        crmLive,
        `VP1: no CRM payment acquirer may run outside "${CRM_TEST_ENVIRONMENT}" before cut-over - the migrated references are live cards`,
      ).toEqual([]);
      expect(svcRows?.length ?? 0, 'VP2: the payment.provider read returned nothing - the check cannot be trusted').toBeGreaterThan(0);
      expect(
        svcLive,
        `VP2: no provider on the subscription service may be in a live state before cut-over - the migrated references are live cards`,
      ).toEqual([]);
      expect(tokenCount, 'VP3: the service should hold the migrated payment references this case is about').toBeGreaterThan(0);
    });
  });
});
