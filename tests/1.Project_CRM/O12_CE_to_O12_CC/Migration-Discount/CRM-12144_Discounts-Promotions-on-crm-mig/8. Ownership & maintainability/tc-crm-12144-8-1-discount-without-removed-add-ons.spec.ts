import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { AppsModuleStatePageMig, DealElementPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  signInMig,
  recordSignedInRoleMig,
  recordSignedInUserMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  rewardRows,
  recordChecksMig,
  printVerifyAndAssertMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_8.1 - Apply a discount on a CRM without the removed discount add-ons   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_8.1
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 69, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Baseline         : none - no pre-production baseline (REQUIREMENT #8: written from the manual TC; not in
 *                    helpers/discount-mig.baseline-map.ts)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0095 (QI BC-06)
 * Source           : D:/Automation_CRM/[Migration] - memory/crm12144_new_scenarios_20261026/spec/NEW_AND_UNSPECCED_TCS.md
 *                    section "CRM-12144_8.1 (master row 69)" (2 steps) + its automation note for 8.1
 * Source version   : NEW_AND_UNSPECCED_TCS.md v2 - sha256 b8aa8c00737b
 *                    (sha256 of the lines from "## CRM-12144_8.1 " up to, not including, the next line made only of
 *                    dashes, CRLF -> LF, joined with "\n", first 12 hex; the automation-notes block above the existing
 *                    TCs is NOT in the hash). Recompute before trusting this spec:
 *                    node -e "const s=require('fs').readFileSync(process.argv[1],'utf8').replace(/\r\n/g,'\n').split('\n');
 *                    const i=s.findIndex(l=>l.startsWith('## '+process.argv[2]+' '));let j=i+1;while(j<s.length&&!/^-{3,}\s*$/.test(s[j]))j++;
 *                    console.log(require('crypto').createHash('sha256').update(s.slice(i,j).join('\n')).digest('hex').slice(0,12))"
 *                    "<Source>" CRM-12144_8.1
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Step 1 - Administration / Settings: Anh Ho (users.admin_crm_mig), Apps READ-ONLY;
 *                    Step 2 - Salesperson, Sales / User: Own Documents Only: Thomas Semerich (users.sale_ic_thomas_crm_mig).
 *                    Both ASSERTED in Pre-conditions 1 and 2: the session's login and the user's groups (res.groups full
 *                    names) must make the user a MEMBER of the group the TC names, implied membership included
 *                    (tester's rule 2026-10-19, re-confirmed 2026-10-27: a role is group membership, not the highest
 *                    level; Thomas also holds "Sales / User: All Documents" - printed as information, not scored).
 *                    One scored check each, with its own evidence shot (top-bar user name outlined, groups in the
 *                    banner).
 *                    Every mid-test user switch (signInMig) logs the old crm-mig session out server-side and reads the
 *                    session login back (a mismatch fails the sign-in); the step that acts then records a scored
 *                    "the step acts as <login>" check with its shot (review 2026-10-26: a cookie-only switch once left
 *                    the 7.5 qty-6 save to the administrator).
 *
 * Summary
 * -------
 * Apps (filter "Apps" removed) shows none of sale_coupon, website_sale_coupon, sale_subscription installed; a Deal
 * Element of A2144B x 5 with Deal registration still gets its reward line of -164.50.
 *
 * Command to run
 * --------------
 *   npx playwright test --project=chromium-headless --grep "CRM-12144_8\.1:"
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_8.1, master "Migration - Discount" row 69, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Apply a discount on a CRM without the removed discount add-ons (IS-CRM-FUNC-0095)
 *  Priority: P2 | Spec Areas: 0095 - no former add-ons
 *  Pre-conditions
 *    1. Login to crm-mig as an Administration / Settings user (e.g. Anh Ho); the development team runs this part when
 *       QA has no such user
 *    2. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *    3. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist (USD)          (crm-mig label: Public Pricelist_USD)
 *       [automation data, same as the suite's other specs]
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Thomas Semerich
 *    4. Create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with:
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *  Executed Steps
 *    1. As the administrator, open Apps, remove the Apps filter and search sale_coupon, website_sale_coupon and sale_subscription
 *    2. As the salesperson, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms =
 *       Immediate Payment, add A2144B with Ordered Qty 5, pick Deal registration and click Save
 *  Expected Results
 *    1. None of the three is installed
 *    2. The reward line of -164.50 is added: discounts are evaluated without the removed add-ons
 *
 *  Automation notes
 *    - Step 1 is READ-ONLY: Apps is opened in developer mode (the cards then show the technical name), the "Apps" facet
 *      is removed and each name is searched on its own. A module is "installed" when a card with exactly that
 *      technical name offers Uninstall. No card at all = the module is not on the server = not installed.
 *    - Step 1 guard: the same search for nakivo_promotion (BC-06 "Installed" list) must show its card as Installed - so
 *      "0 cards" for the three cannot come from a search or a card reader that finds nothing.
 *    - Step 2 also checks "exactly one reward line" (guard).
 *    - Evidence (review 2026-10-26): Step 1 takes one shot per screen state - the facets after the Apps filter is
 *      removed, then each of the four searches before the next one replaces it; Step 2 outlines the reward line's
 *      Unit Price cell and its caption, scrolled into view (the Order Lines table is wider than a 1920 px screen).
 *    - Role (review 2026-10-26): the role check passes only when the named group is the user's HIGHEST group of that
 *      application - "Sales / User: All Documents" implies "Own Documents Only", so membership alone proves nothing.
 * ================================================================================================
 */

const TC = 'CRM-12144_8.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig as an Administration / Settings user (e.g. Anh Ho); the development team runs this part when QA has no such user [the groups of the signed-in user are read: membership of Administration / Settings, implied membership included]',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich) [the groups of the signed-in user are read: membership of Sales / User: Own Documents Only, implied membership included]',
  pre3: 'Pre-condition 3: Create a new company in Contacts with: Name = Disc-Cust-<timestamp>; Type = end customer (no Reseller, no Distributor); Pricelist = Public Pricelist (USD) [on crm-mig]',
  pre4: 'Pre-condition 4: Create a new opportunity in CRM > Pipeline with: Name = Disc-Opp-<timestamp>; Customer = Disc-Cust-<timestamp> [on crm-mig, in the LIST view - the kanban quick-create card lacks these fields]',
  s1: 'Step 1: As the administrator, open Apps, remove the Apps filter and search sale_coupon, website_sale_coupon and sale_subscription [on crm-mig, read only; Apps in developer mode so the cards show the technical name]',
  s2: 'Step 2: As the salesperson, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 5, pick Deal registration and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const ADMIN = users.admin_crm_mig;
const SALES = users.sale_ic_thomas_crm_mig;
const REMOVED_ADD_ONS = ['sale_coupon', 'website_sale_coupon', 'sale_subscription'];
const GUARD_MODULE = 'nakivo_promotion';
const runs: DiscountRun[] = []; // every run of this file - the afterAll sweep re-checks them

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Apply a discount on a CRM without the removed discount add-ons (crm-mig)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
    runs.push(run);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRunMig(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: Apply a discount on a CRM without the removed discount add-ons`, {
    tag: ['@no-preprod-baseline'],
    annotation: [
      { type: 'manual-tc', description: `${TC} (master "Migration - Discount" row 69; NEW_AND_UNSPECCED_TCS.md v2 - sha256 b8aa8c00737b)` },
      { type: 'requirement', description: 'IS-CRM-FUNC-0095 (QI BC-06)' },
    ],
  }, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const appsPage = new AppsModuleStatePageMig(page);
    const checks: Check[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${ADMIN.username} (${ADMIN.displayName})`);
      await signInMig(page, ADMIN);
      // [INTERNAL check, Call API] the ROLE the TC names (tester decision 2026-10-26) - recorded with its own evidence shot:
      // the top-bar user name outlined, the groups in the banner (review 2026-10-26: a bare checks.push left a FAIL with no image)
      await recordSignedInRoleMig(page, testInfo, checks, ADMIN, 'Administration / Settings', 'Pre-condition 1', `${TC} - Pre-condition 1 role of the administrator`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the administrator');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      // [INTERNAL check, Call API] the ROLE the TC names (tester decision 2026-10-26) - recorded with its own evidence shot:
      // the top-bar user name outlined, the groups in the banner (review 2026-10-26: a bare checks.push left a FAIL with no image)
      await recordSignedInRoleMig(page, testInfo, checks, SALES, 'Sales / User: Own Documents Only', 'Pre-condition 2', `${TC} - Pre-condition 2 role of the salesperson`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - company created');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log(`  - Login : ${ADMIN.username} (${ADMIN.displayName})`);
      await signInMig(page, ADMIN);
      await recordSignedInUserMig(page, testInfo, checks, ADMIN, 'Step 1', `${TC} - Step 1 acts as the administrator`);
      const opened = await appsPage.openAppsDebug();
      const appsFacetGone = await appsPage.removeFacet('Apps');
      // one evidence shot per screen state: the facets after the Apps filter is removed, then each search on its own,
      // taken before the next search replaces it (review 2026-10-26: one shot after four searches showed only the last)
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 1 - (guard) Apps opened and the Apps filter removed', expected: 'Apps on screen, no "Apps" facet', actual: `Apps on screen = ${opened}, Apps facet removed = ${appsFacetGone}`, passed: opened && appsFacetGone },
      ], `${TC} - Step 1 Apps filter removed`, [appsPage.searchViewCss]);
      for (const name of REMOVED_ADD_ONS) {
        const cards = await appsPage.searchModules(name);
        const exact = cards.filter((c) => c.technicalName === name);
        const installed = exact.filter((c) => c.state === 'Installed');
        await recordChecksMig(page, testInfo, checks, [
          {
            what: `Step 1 - ${name} is not installed`,
            expected: 'no Installed card with this technical name (no card = not on the server)',
            actual: exact.length ? exact.map((c) => `${c.technicalName} = ${c.state}`).join(' | ') : `no card named ${name} (${cards.length} card(s) for the search)`,
            passed: installed.length === 0 && exact.every((c) => c.state !== 'unknown'),
          },
        ], `${TC} - Step 1 search ${name}`, [appsPage.searchViewCss, appsPage.kanbanCss]);
      }
      const guardCards = await appsPage.searchModules(GUARD_MODULE);
      const guard = guardCards.find((c) => c.technicalName === GUARD_MODULE);
      await recordChecksMig(page, testInfo, checks, [
        {
          what: `Step 1 - (guard) the same search finds an installed module (${GUARD_MODULE})`,
          expected: `${GUARD_MODULE} = Installed (otherwise "not found" for the three proves nothing)`,
          actual: guard ? `${guard.technicalName} = ${guard.state}` : `no card (${guardCards.length} card(s))`,
          passed: guard?.state === 'Installed',
        },
      ], `${TC} - Step 1 guard search ${GUARD_MODULE}`, [appsPage.searchViewCss, appsPage.kanbanCss]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Apps searched (administrator)');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      await recordSignedInUserMig(page, testInfo, checks, SALES, 'Step 2', `${TC} - Step 2 acts as the salesperson`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      const row = await dealElementPage.getOrderLineRowCells(0);
      console.log(`  - A2144B x 5 line Subtotal : ${row['Subtotal']}`);
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      await saveDealElement(page, run);
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      console.log(`  - Total : ${await dealElementPage.getSubtotalFooterValue('amount_total')}`);
      // the evidence outlines the reward's Unit Price cell (scrolled into view - the table is wider than the screen)
      await dealElementPage.markOrderLineCellMig(DISCOUNT_MIG.dealRegistrationProduct, 'Unit Price');
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 2 - (guard) exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 2 - the reward line is added', expected: '-164.50', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: money(rewards[0]?.['Unit Price'] ?? '') === -164.5 },
      ], `${TC} - Step 2 reward line without the removed add-ons`, [DealElementPageMig.ORDER_LINE_HEAD, DealElementPageMig.ORDER_LINE_CELL]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Deal registration saved (salesperson)');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
