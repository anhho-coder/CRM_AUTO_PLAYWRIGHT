import { Page, test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { DealElementPageMig, DiscountServiceSettingsPageMig, ScheduledActionRunPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
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
 *  CRM-12144_7.5 - Quote in maintenance mode, then switch it off   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_7.5
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 67, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Baseline         : none - no pre-production baseline (REQUIREMENT #8: written from the manual TC; not in
 *                    helpers/discount-mig.baseline-map.ts)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-REL-0003, IS-CRM-FUNC-0076 (QI TC-22)
 * Source           : D:/Automation_CRM/[Migration] - memory/crm12144_new_scenarios_20261026/spec/NEW_AND_UNSPECCED_TCS.md
 *                    section "CRM-12144_7.5 (master row 67)" (5 steps) + its automation note for 7.5
 * Source version   : NEW_AND_UNSPECCED_TCS.md v2 - sha256 9788b3232d49
 *                    (sha256 of the lines from "## CRM-12144_7.5 " up to, not including, the next line made only of
 *                    dashes, CRLF -> LF, joined with "\n", first 12 hex; the automation-notes block above the existing
 *                    TCs is NOT in the hash). Recompute before trusting this spec:
 *                    node -e "const s=require('fs').readFileSync(process.argv[1],'utf8').replace(/\r\n/g,'\n').split('\n');
 *                    const i=s.findIndex(l=>l.startsWith('## '+process.argv[2]+' '));let j=i+1;while(j<s.length&&!/^-{3,}\s*$/.test(s[j]))j++;
 *                    console.log(require('crypto').createHash('sha256').update(s.slice(i,j).join('\n')).digest('hex').slice(0,12))"
 *                    "<Source>" CRM-12144_7.5
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Administration / Settings: Anh Ho (users.admin_crm_mig) - steps 1 and 5 (first half);
 *                    Salesperson, Sales / User: Own Documents Only: Thomas Semerich (users.sale_ic_thomas_crm_mig) - the rest.
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
 * SHARED STATE - read before running
 * ----------------------------------
 *  - Maintenance mode is a crm-mig-wide setting: while it is ON every quotation on crm-mig skips the request to the
 *    Discount Service (Nathan Do, CRM-12467). The spec switches it ON at step 1 and OFF at step 5, and AGAIN in an
 *    afterEach that always runs (read back after Save; a switch that stays ON fails the teardown), plus an afterAll
 *    safety net. Do not run it while another crm-mig Discount run is in flight.
 *  - Step 1 runs the archived job "NAKIVO Promotion: sync catalogue from Discount Service" (XML id
 *    nakivo_promotion.ir_cron_sync_promotions) once with Run Manually - the program list sync the TC asks for. The job
 *    stays archived; its schedule is not touched.
 *  - The Discount Service settings block shows the Discount Service Token: the URL / Token inputs are masked with CSS
 *    before the screen opens (DiscountServiceSettingsPageMig.maskSecretFields), and the Playwright trace is OFF for this
 *    file, so no screenshot, video frame or trace snapshot carries the token. The token is never read.
 *
 * Summary
 * -------
 * Admin runs the program sync and switches Maintenance mode on; the salesperson's Deal Element of A2144B x 4 (1,316.00,
 * below the 1,400.00 minimum) is offered Deal registration with no warning, saves Reward -131.60 with Promotion from
 * snapshot ticked, qty 5 gives -164.50; with the mode off again, qty 6 gives -197.40 and the snapshot mark is gone.
 *
 * Command to run
 * --------------
 *   npx playwright test --project=chromium-headless --grep "CRM-12144_7\.5:"
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_7.5, master "Migration - Discount" row 67, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Quote in maintenance mode, then switch it off (IS-CRM-REL-0003, IS-CRM-FUNC-0076)
 *  Priority: P2 | Spec Areas: REL-0003 - maintenance mode
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
 *    1. As the administrator, run "NAKIVO Promotion: sync catalogue from Discount Service" with Run Manually, then switch
 *       on Maintenance mode in Settings > Discount Service and save
 *    2. As the salesperson, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms =
 *       Immediate Payment, add A2144B with Ordered Qty 4 and open the Promotion list
 *    3. Pick Deal registration and click Save
 *    4. Change Ordered Qty to 5 and click Save
 *    5. As the administrator, switch Maintenance mode off and save; as the salesperson, change Ordered Qty to 6 and click Save
 *  Expected Results
 *    2. No Promotions unavailable warning; the list contains Deal registration although the Subtotal (1,316.00) is below 1,400.00
 *    3. Reward = -131.60; Promotion from snapshot is ticked
 *    4. Reward = -164.50
 *    5. Reward = -197.40, computed by the Discount Service; Promotion from snapshot is no longer ticked
 *
 *  Automation notes
 *    - Step 1 has NO expected result in the source (REQUIREMENT #1b.4 - reported to the TC author). The spec checks
 *      guards only: the job is found exactly once with Filters > "All" (this Odoo 12 build has no "Archived" filter on
 *      Scheduled Actions - "All" is the one that lists archived jobs; the list opens with the "All" facet already set),
 *      Run Manually is pressed in developer mode with no dialog after it, and Maintenance mode reads ON after Save.
 *      Settings > Discount Service = Settings > General Settings, tab "Discount Service" (QI p.41). Three evidence
 *      shots, one per screen: the list (job listed), the job form (Run Manually), the settings (switch).
 *    - Round 1 (2026-10-26 13:57) stopped at Step 1: the job listed 0 times (the name search pressed Backspace in the empty
 *      search box, which deletes the default "All" facet - now only typed text is cleared) and the Maintenance mode click timed out (its label is 0 px wide - the
 *      switch is now clicked on its drawn box). Both fixed in the page objects; the expected results are unchanged.
 *    - Step 2: "Promotions unavailable" is looked for as a dialog or a notification carrying that title or the QI's text
 *      "The Discount Service did not answer" - after the line is added and with the list open.
 *    - "Promotion from snapshot" (promo_from_snapshot) is HIDDEN by the view while it is False, so "no longer ticked"
 *      reads "not ticked (field hidden)". "Computed by the Discount Service" (step 5) is evidenced by that mark being
 *      cleared on the save that produced -197.40 - the mark is set only when the program came from the snapshot.
 *    - Steps 3-5 also check "exactly one reward line" (guard).
 *    - Evidence (review 2026-10-26): one shot per owning element - the order line's Subtotal / the reward's Unit Price
 *      cell with its caption, scrolled into view (the Order Lines table is wider than a 1920 px screen); the Promotion
 *      field with its open list; the "Promotion from snapshot" field (while the view hides it, the form group it would be
 *      drawn in); the warning check outlines the warning's box (.modal-content of a dialog, or the notification) and has
 *      no element to outline when no warning is drawn, so that shot carries the banner only.
 * ================================================================================================
 */

const TC = 'CRM-12144_7.5';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig as an Administration / Settings user (e.g. Anh Ho); the development team runs this part when QA has no such user [the groups of the signed-in user are read: membership of Administration / Settings, implied membership included]',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich) [the groups of the signed-in user are read: membership of Sales / User: Own Documents Only, implied membership included]',
  pre3: 'Pre-condition 3: Create a new company in Contacts with: Name = Disc-Cust-<timestamp>; Type = end customer (no Reseller, no Distributor); Pricelist = Public Pricelist (USD) [on crm-mig]',
  pre4: 'Pre-condition 4: Create a new opportunity in CRM > Pipeline with: Name = Disc-Opp-<timestamp>; Customer = Disc-Cust-<timestamp> [on crm-mig, in the LIST view - the kanban quick-create card lacks these fields]',
  s1: 'Step 1: As the administrator, run "NAKIVO Promotion: sync catalogue from Discount Service" with Run Manually, then switch on Maintenance mode in Settings > Discount Service and save [on crm-mig: Settings > Technical > Automation > Scheduled Actions in developer mode with the All filter - the job is archived; Settings > General Settings, tab Discount Service]',
  s2: 'Step 2: As the salesperson, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 4 and open the Promotion list',
  s3: 'Step 3: Pick Deal registration and click Save',
  s4: 'Step 4: Change Ordered Qty to 5 and click Save',
  s5: 'Step 5: As the administrator, switch Maintenance mode off and save; as the salesperson, change Ordered Qty to 6 and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const ADMIN = users.admin_crm_mig;
const SALES = users.sale_ic_thomas_crm_mig;
const SYNC_JOB = 'NAKIVO Promotion: sync catalogue from Discount Service';
const runs: DiscountRun[] = []; // every run of this file - the afterAll sweep re-checks them

/** Maintenance mode bookkeeping across the hooks: touched = this file clicked the switch; off = read back OFF since. */
const maintenance = { touched: false, confirmedOff: true };

/** Sign in as the administrator and switch Maintenance mode OFF, read back. Never throws; @returns '' or the problem. */
async function switchMaintenanceOff(page: Page): Promise<string> {
  try {
    await signInMig(page, ADMIN);
    const settings = new DiscountServiceSettingsPageMig(page);
    await settings.maskSecretFields();
    if (!(await settings.openDiscountServiceSettings())) return 'Settings > Discount Service did not open';
    const on = await settings.setMaintenanceMode(false);
    if (on) return 'Maintenance mode still reads ON after Save';
    maintenance.confirmedOff = true;
    return '';
  } catch (e) {
    return `switching Maintenance mode off failed: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`;
  }
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT, trace: 'off' }); // trace off: the settings screen holds the Discount Service Token

test.describe(`${TC} - Quote in maintenance mode, then switch it off (crm-mig)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
    runs.push(run);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    const errors: string[] = [];
    // FIRST: Maintenance mode back OFF - always, whatever the test did (crm-mig-wide switch)
    if (maintenance.touched && !maintenance.confirmedOff) {
      console.log('\n--- afterEach: switch Maintenance mode OFF (crm-mig-wide setting) ---');
      const problem = await switchMaintenanceOff(page);
      if (problem) {
        console.log(`  ! ${problem} - retrying once`);
        const again = await switchMaintenanceOff(page);
        if (again) errors.push(`MAINTENANCE MODE MAY STILL BE ON on crm-mig: ${again}`);
      }
      console.log(`  - Maintenance mode confirmed OFF: ${maintenance.confirmedOff}`);
    }
    if (!SKIP_CLEANUP) await teardownDiscountRunMig(page, run, testInfo).catch((e: Error) => errors.push(e.message));
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (errors.length) throw new Error(errors.join(' | '));
  });

  test.afterAll(async ({ browser }) => {
    if (maintenance.touched && !maintenance.confirmedOff) {
      test.setTimeout(CommonUtils.waitTimes.runningTestScript);
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();
      try {
        console.log('\n--- afterAll safety net: switch Maintenance mode OFF ---');
        const problem = await switchMaintenanceOff(page);
        console.log(problem ? `  ! ${problem} - REPORT IT: Maintenance mode may still be ON on crm-mig` : '  - Maintenance mode confirmed OFF');
      } finally {
        await context.close().catch(() => {});
      }
    }
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: Quote in maintenance mode, then switch it off`, {
    tag: ['@no-preprod-baseline'],
    annotation: [
      { type: 'manual-tc', description: `${TC} (master "Migration - Discount" row 67; NEW_AND_UNSPECCED_TCS.md v2 - sha256 9788b3232d49)` },
      { type: 'requirement', description: 'IS-CRM-REL-0003, IS-CRM-FUNC-0076 (QI TC-22)' },
    ],
  }, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const settingsPage = new DiscountServiceSettingsPageMig(page);
    const cronPage = new ScheduledActionRunPageMig(page);
    const checks: Check[] = [];
    let deUrl = '';

    /** Save the open Deal Element, then read its reward lines and the snapshot mark. */
    const saveAndRead = async (label: string): Promise<{ rewards: Array<Record<string, string>>; snapshot: string }> => {
      await saveDealElement(page, run);
      deUrl = page.url();
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      console.log(`  - [${label}] reward lines : ${rewards.length}; Unit Price ${rewards.map((r) => r['Unit Price']).join(' | ') || '(none)'}`);
      console.log(`  - [${label}] Promotion    : ${await dealElementPage.getAppliedPromotionName() || '(empty)'}`);
      const snapshot = await dealElementPage.getPromoFromSnapshotState();
      return { rewards, snapshot };
    };

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
      await settingsPage.maskSecretFields(); // before any settings screen is drawn
      // 1a - the archived sync job, Run Manually
      const listed = await cronPage.openScheduledActionsListDebug();
      const allSelected = await cronPage.ensureFilterSelected('All');
      const rows = await cronPage.countListedActionsNamed(SYNC_JOB);
      // evidence 1 of 3 - the LIST (what the "listed exactly once" check read)
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 1 - (guard) Scheduled Actions listed with Filters > All', expected: 'list on screen, "All" selected', actual: `list = ${listed}, All selected = ${allSelected}`, passed: listed && allSelected },
        { what: `Step 1 - (guard) the job "${SYNC_JOB}" is listed exactly once`, expected: '1 (0 = the archived job is not found, so it cannot be run)', actual: String(rows), passed: rows === 1 },
      ], `${TC} - Step 1 sync job listed`, [cronPage.listCss]);
      const opened = rows === 1 ? await cronPage.openListedAction(SYNC_JOB) : false;
      console.log(`  Observation (not scored) - the job's active marker: "${opened ? await cronPage.readActiveMarker() : '(form not opened)'}"`);
      const outcome = opened ? await cronPage.runManuallyAndReadOutcome() : { pressed: false, dialogText: '' };
      // evidence 2 of 3 - the job FORM after Run Manually, with a dialog if one is drawn (captured before it is closed)
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 1 - (guard) Run Manually pressed, no dialog after the run', expected: 'pressed, no dialog', actual: `pressed = ${outcome.pressed}, dialog = ${outcome.dialogText || '(none)'}`, passed: outcome.pressed && !outcome.dialogText },
      ], `${TC} - Step 1 sync job run manually`, opened ? [...(outcome.dialogText ? [cronPage.errorDialogCss] : []), cronPage.runManuallyCss] : [cronPage.listCss]); // the dialog only when one is drawn; form not opened -> the list it was not found on
      await cronPage.closeDialogIfAny();
      // 1b - Maintenance mode ON
      const settingsOpen = await settingsPage.openDiscountServiceSettings();
      if (!settingsOpen) throw new Error('Settings > General Settings > Discount Service did not open - Maintenance mode was not touched');
      console.log(`  Observation (not scored) - Maintenance mode before this run: ${(await settingsPage.isMaintenanceModeOn()) ? 'ON' : 'OFF'}`);
      maintenance.touched = true;
      maintenance.confirmedOff = false; // from here on the afterEach switches it off
      const on = await settingsPage.setMaintenanceMode(true);
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 1 - (guard) Maintenance mode reads ON after Save', expected: 'ON', actual: on ? 'ON' : 'OFF', passed: on },
      ], `${TC} - Step 1 Maintenance mode on`, [settingsPage.maintenanceFieldCss]);
      if (!on) throw new Error('Maintenance mode did not switch ON - steps 2-5 would not test maintenance mode');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - sync run, Maintenance mode ON (administrator)');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      await recordSignedInUserMig(page, testInfo, checks, SALES, 'Step 2', `${TC} - Step 2 acts as the salesperson`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 4);
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,316.00');
      // three evidence shots, one per owning element (review 2026-10-26): the line's Subtotal cell (scrolled into view -
      // the Order Lines table is wider than a 1920 px screen; shot before the list is opened, which a scroll could close),
      // then - with the Promotion list open - the Promotion field with its list, and the screen for the warning
      await dealElementPage.markOrderLineCellMig(DISCOUNT_MIG.listedProduct, 'Subtotal');
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 2 - the A2144B x 4 line Subtotal (below the 1,400.00 minimum)', expected: '1,316.00', actual: subtotal || '(empty)', passed: money(subtotal) === 1316 },
      ], `${TC} - Step 2 line Subtotal below the minimum`, [DealElementPageMig.ORDER_LINE_HEAD, DealElementPageMig.ORDER_LINE_CELL]);
      const afterLine = await dealElementPage.getPromotionsUnavailableNotices();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      const withList = await dealElementPage.getPromotionsUnavailableNotices();
      const warnings = [...afterLine, ...withList];
      await recordChecksMig(page, testInfo, checks, [
        {
          what: 'Step 2 - the Promotion list contains Deal registration although the Subtotal is below 1,400.00',
          expected: `${DISCOUNT_MIG.dealRegistration} (missing = maintenance mode still checks the minimum, or the snapshot list is empty)`,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_MIG.dealRegistration),
        },
      ], `${TC} - Step 2 Promotion list in maintenance mode`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList], 'bottom-right');
      // an absent warning has nothing to outline: the shot carries the banner only; a warning on screen is outlined
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 2 - no Promotions unavailable warning', expected: '(none) - after the line is added and with the Promotion list open', actual: warnings.length ? warnings.join(' | ') : '(none)', passed: warnings.length === 0 },
      ], `${TC} - Step 2 no Promotions unavailable warning`, withList.length ? [dealElementPage.promotionsUnavailableCss] : [], 'bottom-right');
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      const { rewards, snapshot } = await saveAndRead('qty 4');
      await dealElementPage.markOrderLineCellMig(DISCOUNT_MIG.dealRegistrationProduct, 'Unit Price');
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 3 - (guard) exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 3 - Reward', expected: '-131.60', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: money(rewards[0]?.['Unit Price'] ?? '') === -131.6 },
      ], `${TC} - Step 3 reward line`, [DealElementPageMig.ORDER_LINE_HEAD, DealElementPageMig.ORDER_LINE_CELL]);
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 3 - Promotion from snapshot is ticked', expected: 'ticked', actual: snapshot, passed: snapshot === 'ticked' },
      ], `${TC} - Step 3 Promotion from snapshot`, [snapshot === 'ticked' ? dealElementPage.promoFromSnapshotCss : dealElementPage.promoFromSnapshotGroupCss]); // hidden while False: outline its group
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 2-3 - Deal registration saved in maintenance mode');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.clickEdit();
      await dealElementPage.changeQtyInRow(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      const { rewards, snapshot } = await saveAndRead('qty 5');
      console.log(`  Observation (not scored) - Promotion from snapshot after step 4: ${snapshot}`);
      await dealElementPage.markOrderLineCellMig(DISCOUNT_MIG.dealRegistrationProduct, 'Unit Price');
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 4 - (guard) exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 4 - Reward', expected: '-164.50', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: money(rewards[0]?.['Unit Price'] ?? '') === -164.5 },
      ], `${TC} - Step 4 reward at qty 5`, [DealElementPageMig.ORDER_LINE_HEAD, DealElementPageMig.ORDER_LINE_CELL]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - quantity 5 saved in maintenance mode');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      // 5a - administrator: Maintenance mode OFF
      console.log(`  - Login : ${ADMIN.username} (${ADMIN.displayName})`);
      await signInMig(page, ADMIN);
      await recordSignedInUserMig(page, testInfo, checks, ADMIN, 'Step 5 (Maintenance mode off)', `${TC} - Step 5 acts as the administrator`);
      const settingsOpen = await settingsPage.openDiscountServiceSettings();
      const on = settingsOpen ? await settingsPage.setMaintenanceMode(false) : true;
      if (settingsOpen && !on) maintenance.confirmedOff = true;
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 5 - (guard) Maintenance mode reads OFF after Save', expected: 'OFF', actual: !settingsOpen ? '(settings did not open)' : on ? 'ON' : 'OFF', passed: settingsOpen && !on },
      ], `${TC} - Step 5 Maintenance mode off`, [settingsPage.maintenanceFieldCss]);
      if (on) throw new Error('Maintenance mode did not switch OFF - the qty 6 save would not reach the Discount Service');
      // 5b - salesperson: qty 6 on the same Deal Element
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      // the qty-6 save must be the salesperson's (review 2026-10-26: one run saved it as the administrator)
      await recordSignedInUserMig(page, testInfo, checks, SALES, 'Step 5 (Ordered Qty 6)', `${TC} - Step 5 acts as the salesperson`);
      await opportunityPage.openByUrlReloaded(deUrl);
      await dealElementPage.clickEdit();
      await dealElementPage.changeQtyInRow(DISCOUNT_MIG.listedProduct, 6);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,974.00');
      const { rewards, snapshot } = await saveAndRead('qty 6');
      await dealElementPage.markOrderLineCellMig(DISCOUNT_MIG.dealRegistrationProduct, 'Unit Price');
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 5 - (guard) exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 5 - Reward, computed by the Discount Service', expected: '-197.40', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: money(rewards[0]?.['Unit Price'] ?? '') === -197.4 },
      ], `${TC} - Step 5 reward line from the Discount Service`, [DealElementPageMig.ORDER_LINE_HEAD, DealElementPageMig.ORDER_LINE_CELL]);
      await recordChecksMig(page, testInfo, checks, [
        {
          what: 'Step 5 - Promotion from snapshot is no longer ticked',
          expected: 'not ticked (still ticked = the save did not go to the Discount Service)',
          actual: snapshot,
          passed: snapshot.startsWith('not ticked'),
        },
      ], `${TC} - Step 5 Promotion from snapshot`, [snapshot === 'ticked' ? dealElementPage.promoFromSnapshotCss : dealElementPage.promoFromSnapshotGroupCss]); // hidden while False: outline the group it would be drawn in
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Maintenance mode OFF, quantity 6 saved');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
