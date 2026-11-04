import { Page, test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig, DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  newDiscountRun,
  recordChecksMig,
  printVerifyAndAssertMig,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_5.2 - Look for retired and expired programs on a new order and in the Program editor   (crm-mig + Program editor)
 * ================================================================================================
 * Test Case ID     : CRM-12144_5.2
 * Jira             : CRM-12296 (master "Migration - Discount" row 56)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Revised          : 2026-10-27 - the Program editor is read on Discount Programs in the KANBAN view (every card of every
 *                    column) instead of the List view - the CRM-12144_5.3 standard (tester 2026-10-27, translated: "the
 *                    Program editor is read in the Kanban view")
 *                    2026-11-03 - spec v7 re-sync (CRM-13848 B4, Aiva 2026-11-03): IS-CRM-FUNC-0086 is replaced by
 *                    IS-CRM-FUNC-0086-1 (enabled programs past their end date are carried over AS ENDED, keeping their
 *                    Production validity window) and IS-CRM-FUNC-0086-2 (archived programs are retired); the migration
 *                    audit is now delivered (Discounts Program Audit v2, 29 Oct 2026, Nathan Do on CRM-12144), so the
 *                    former BLOCKED expected result is scored and a step reads the validity windows (steps 1-3)
 * Baseline         : Discount_5.2 (Jira CRM-13795; tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/
 *                    tc-discount-5-2-retired-and-expired-programs.spec.ts) - pre-production; its API read of the
 *                    programs is replaced by the Program editor (no sale.coupon.program on crm-mig)
 * Spec             : [Migration] Discounts (Promotions) v7 - IS-CRM-FUNC-0086-1, IS-CRM-FUNC-0086-2 (Deal registration's
 *                    "no validity limit": IS-CRM-FUNC-0085)
 * Source version   : Jira CRM-12296 / master row 56 as re-synced to spec v7 on 2026-11-03 - re-check before trusting
 *                    this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) and the Program editor of crm-mig
 *                    (Discount Service, https://discount-crm-mig.nakivo.site)
 * Run as           : crm-mig - salesperson Thomas Semerich (users.sale_ic_thomas_crm_mig);
 *                    Program editor - QA's named account users.admin_discount_mig (CRM-12467 row 1.7) - READ ONLY
 *
 * Audit data (Discounts Program Audit v2, 29 Oct 2026, windows in UTC as Production stores them) - copied into
 * AUDIT_* below: 1 program carried over operating (PROG1, no start or end date), 15 carried over expired (14 of
 * 2019-2020 + PROG28 "Trade-in Promotion 5%"), 10 retired (archived on Production on 15 July 2020).
 *
 * Summary
 * -------
 * The Program editor holds no card for the 10 retired programs, a card in Ended for each of the 15 expired ones with the
 * audit's validity window, and Deal registration in Active with no validity limit; a new order offers no ended program.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_5\.2:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.2, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Look for retired and expired programs on a new order and in the Program editor (IS-CRM-FUNC-0086-1, IS-CRM-FUNC-0086-2)
 *  Priority: P3
 *  Pre-conditions
 *    1. Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account
 *       (held by the development team)
 *    2. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    3. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist (USD)          (crm-mig label: Public Pricelist_USD)
 *    4. Create a new opportunity in CRM > Pipeline with:
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *    5. Have the migration audit from the development team: Discounts Program Audit v2 (29 Oct 2026, attached to CRM-12144)
 *  Executed Steps
 *    1. In the Program editor, open Discount Programs (Kanban view) of the active version (top bar: Version N / active)
 *    2. Open the card of each program the audit carries over as expired, and the card of Deal registration (PROG1), and
 *       read the "Validity" row of each program page
 *    3. In crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms =
 *       Immediate Payment, add A2144B with Ordered Qty 5 and open the Promotion list
 *  Expected Results
 *    1. No card exists for any of the 10 programs the audit retires (PROG3, PROG4, PROG5, PROG6, PROG7, PROG8, PROG9,
 *       PROG16, PROG19, PROG21 - IS-CRM-FUNC-0086-2); each of the 15 programs the audit carries over as expired (PROG10,
 *       PROG11, PROG12, PROG13, PROG14, PROG15, PROG17, PROG18, PROG22, PROG23, PROG24, PROG25, PROG26, PROG27, PROG28) has
 *       a card in the Ended column (IS-CRM-FUNC-0086-1); the Deal registration card (PROG1) is in the Active column
 *    2. Each expired program's Validity equals its window in the audit (UTC), e.g. PROG15 = 30 Jun 2019, 21:00 -> 30 Sept
 *       2019, 20:59 and PROG28 "Trade-in Promotion 5%" = 31 May 2026, 17:00 -> 30 Sept 2026, 16:59; Deal registration's
 *       Validity = Any start -> No end (no validity limit, IS-CRM-FUNC-0085)
 *    3. No retired program is listed, and no program past its validity end date (e.g. "Trade-in Promotion 5%", valid
 *       to 2026-09-30)
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts. The Program editor is read on its own tab of the
 *  same browser context (ignoreHTTPSErrors, 1920x1080), so the crm-mig session is not disturbed. The baseline's
 *  JSON-RPC read of rule_date_to has no crm-mig equivalent: "past its validity end date" is judged from the Program
 *  editor's Kanban - the cards are grouped by status from Valid from / Valid to (Active / Scheduled / Ended / Needs the
 *  table), so a program listed on the Promotion list must have a card (matched by exact name) outside the Ended column.
 *  Cards are matched by promo code (the card's code pill). The page shows a window as "30 Jun 2019, 21:00 -> 30 Sept
 *  2019, 20:59" (read 2026-11-03, rule v55) - parsed to "2019-06-30 21:00 -> 2019-09-30 20:59" and compared with the
 *  audit's UTC window. The Program editor is read only (no Edit / Save / Delete). Teardown deletes the run's records;
 *  afterAll sweeps by run marker.
 *  "No retired program is listed" (step 3): a retired program has no card (step 1), so it is covered by "every listed
 *  program has a card outside Ended" - nine retired programs carry Deal registration's name, so a name alone cannot tell
 *  them apart from PROG1.
 * ================================================================================================
 */

const TC = 'CRM-12144_5.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team) - QA account users.admin_discount_mig',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: Create a new company in Contacts with Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist_USD',
  pre4: 'Pre-condition 4: Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre5: 'Pre-condition 5: Have the migration audit from the development team: Discounts Program Audit v2 (29 Oct 2026, attached to CRM-12144)',
  s1: 'Step 1: In the Program editor, open Discount Programs (Kanban view) of the active version (top bar: Version N / active) [every card of every column is read - read only]',
  s2: 'Step 2: Open the card of each program the audit carries over as expired, and the card of Deal registration (PROG1), and read the "Validity" row of each program page [read only]',
  s3: 'Step 3: In crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 5 and open the Promotion list',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig;
const SALES = users.sale_ic_thomas_crm_mig;
const EXPIRED_PROGRAM = 'Trade-in Promotion 5%';
/** The Kanban columns (cards are grouped by status from Valid from / Valid to). */
const ENDED_COLUMN = 'Ended';
const ACTIVE_COLUMN = 'Active';

/** Discounts Program Audit v2 (29 Oct 2026) - the one program carried over operating; no start or end date. */
const AUDIT_OPERATING = { code: 'PROG1', validity: 'Any start -> No end' };
/** Discounts Program Audit v2 - "Retired programs": archived on Production on 15 July 2020, not carried over. */
const AUDIT_RETIRED = ['PROG3', 'PROG4', 'PROG5', 'PROG6', 'PROG7', 'PROG8', 'PROG9', 'PROG16', 'PROG19', 'PROG21'];
/** Discounts Program Audit v2 - "Expired programs kept for history" + PROG28: promo code -> Production window (UTC). */
const AUDIT_EXPIRED: Record<string, string> = {
  PROG10: '2019-07-01 13:04 -> 2019-10-03 20:59',
  PROG11: '2019-06-30 21:00 -> 2019-10-03 20:59',
  PROG12: '2019-06-30 21:00 -> 2019-09-30 20:59',
  PROG13: '2019-06-30 21:00 -> 2019-09-30 20:59',
  PROG14: '2019-06-30 21:00 -> 2019-09-30 20:59',
  PROG15: '2019-06-30 21:00 -> 2019-09-30 20:59',
  PROG17: '2019-06-18 21:00 -> 2019-09-30 20:59',
  PROG18: '2019-06-18 21:00 -> 2019-09-30 20:59',
  PROG22: '2020-03-31 21:00 -> 2020-06-30 20:59',
  PROG23: '2020-03-31 21:00 -> 2020-06-30 20:59',
  PROG24: '2020-03-31 21:00 -> 2020-06-30 20:59',
  PROG25: '2020-03-31 21:00 -> 2020-06-30 20:59',
  PROG26: '2020-03-31 21:00 -> 2020-06-30 20:59',
  PROG27: '2020-03-31 21:00 -> 2020-06-30 20:59',
  PROG28: '2026-05-31 17:00 -> 2026-09-30 16:59',
};
const runs: DiscountRun[] = []; // every crm-mig run of this file - the afterAll sweep re-checks them

/** Page text as ASCII for stdout and the evidence banner (date chips carry an en dash, names an em dash, windows an arrow). */
const ascii = (s: string): string => s.replace(/[–—]/g, '-').replace(/→/g, '->').replace(/›/g, '>');

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Sept: '09', Oct: '10', Nov: '11', Dec: '12',
};
/** The page's window "30 Jun 2019, 21:00 -> 30 Sept 2019, 20:59" as "2019-06-30 21:00 -> 2019-09-30 20:59"; other text as shown. */
function normalizeWindow(shown: string): string {
  const one = (d: string, m: string, y: string, t: string) => `${y}-${MONTHS[m] ?? `?${m}`}-${d.padStart(2, '0')} ${t}`;
  const m = ascii(shown).match(/^(\d{1,2}) (\w+) (\d{4}), (\d{2}:\d{2}) -> (\d{1,2}) (\w+) (\d{4}), (\d{2}:\d{2})$/);
  return m ? `${one(m[1], m[2], m[3], m[4])} -> ${one(m[5], m[6], m[7], m[8])}` : ascii(shown);
}

test.use({ ignoreHTTPSErrors: true, actionTimeout: MIG_ACTION_TIMEOUT }); // the Discount Service certificate chain is self-signed

test.describe(`${TC} - Retired and expired programs (crm-mig + Program editor)`, () => {
  let created: DiscountRun[] = [];
  let editorPage: Page | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    created = [];
    editorPage = undefined;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await editorPage?.close().catch(() => {});
    editorPage = undefined;
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) {
      const errors: string[] = [];
      for (const run of created) await teardownDiscountRunMig(page, run, testInfo).catch((e: Error) => errors.push(e.message));
      if (errors.length) throw new Error(errors.join(' | '));
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: Retired and expired programs on a new order and in the Program editor`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const newRun = (): DiscountRun => {
      const run = newDiscountRun();
      created.push(run);
      runs.push(run);
      return run;
    };
    const run = newRun();
    let editor: DiscountProgramEditorPageMig | undefined;
    let cards: Awaited<ReturnType<DiscountProgramEditorPageMig['getKanbanCards']>> = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Login : ${EDITOR_ACCOUNT.username} (Program editor, own tab of the same browser context)`);
      editorPage = await page.context().newPage();
      await editorPage.setViewportSize({ width: 1920, height: 1080 });
      editor = new DiscountProgramEditorPageMig(editorPage);
      await editor.signIn(EDITOR_ACCOUNT);
      // the ROLE the TC names: a NAMED Program editor account - the account menu must say who is signed in
      const who = await editor.getSignedInAs({ keepOpen: true });
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: 'Pre-condition 1 - the Program editor session belongs to the named account (a FAIL means the run did not use the account the TC names)',
          expected: `"Signed in as" ${EDITOR_ACCOUNT.username}`,
          actual: who ? `"Signed in as" ${who}` : '(empty)',
          passed: who === EDITOR_ACCOUNT.username,
        },
      ], `${TC} - Pre-condition 1 Signed in as`, [DiscountProgramEditorPageMig.ACCOUNT_DROPDOWN], 'bottom-right');
      await editor.closeAccountMenu();
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Pre-condition 1 - signed in on the Program editor');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName}) on crm-mig`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompanyMig(page, run, SALES, DISCOUNT_MIG.pricelistUsd);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - USD company created on crm-mig');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - opportunity created on crm-mig');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      console.log('  - Source         : "Discounts Program Audit.pdf" v2 (last updated 29 Oct 2026), Nathan Do, attached to CRM-12144 on 2026-10-30');
      console.log(`  - Operating      : ${AUDIT_OPERATING.code} (no start or end date)`);
      console.log(`  - Expired (15)   : ${Object.keys(AUDIT_EXPIRED).join(', ')}`);
      console.log(`  - Retired (10)   : ${AUDIT_RETIRED.join(', ')}`);
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      if (!editor || !editorPage) throw new Error('The Program editor was not opened at Pre-condition 1');
      await editor.openProgramsKanban();
      const version = await editor.getActiveVersionNumber();
      cards = await editor.getKanbanCards();
      console.log(`  - Screen         : Discount Programs (Kanban view)`);
      console.log(`  - Active version : ${Number.isFinite(version) ? version : '(not shown)'}`);
      console.log(`  - Program cards  : ${cards.length}`);
      for (const c of cards) {
        console.log(`    - ${c.column.padEnd(16)} | ${c.code.padEnd(24)} | ${ascii(c.name).padEnd(70)} | ${ascii(c.tags.join(' | ')) || '(no chips)'}`);
      }
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: 'Step 1 - (guard) the Program editor shows an active rule version',
          expected: '"Version N / active" in the top bar, N a number',
          actual: Number.isFinite(version) ? `Version ${version} / active` : '(not shown)',
          passed: Number.isFinite(version),
        },
      ], `${TC} - Step 1 Kanban of the active version`, [DiscountProgramEditorPageMig.VERSION_CHIP], 'bottom-right');

      // (a) the 10 retired programs - ABSENT, so the whole board is outlined (no card of their own to mark)
      const retiredFound = cards.filter((c) => AUDIT_RETIRED.includes(c.code));
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: 'Step 1 - no card exists for any of the 10 programs the audit retires (IS-CRM-FUNC-0086-2)',
          expected: `0 cards with the promo code ${AUDIT_RETIRED.join(', ')} (a card is a FAIL - a retired program was carried over)`,
          actual: retiredFound.length ? `${retiredFound.length} found: ${retiredFound.map((c) => `${c.code} in ${c.column}`).join(', ')}` : `0 of the ${cards.length} cards`,
          passed: cards.length > 0 && retiredFound.length === 0,
        },
      ], `${TC} - Step 1 no card for a retired program`,
      retiredFound.length ? retiredFound.map((c) => DiscountProgramEditorPageMig.kanbanCardSelector(c.code)) : [DiscountProgramEditorPageMig.KANBAN_CARDS], 'bottom-right');

      // (b) the 15 expired programs - each owned by its card
      const expired = Object.keys(AUDIT_EXPIRED).map((code) => ({ code, card: cards.find((c) => c.code === code) }));
      const wrong = expired.filter((e) => !e.card || e.card.column !== ENDED_COLUMN);
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: `Step 1 - each of the ${expired.length} programs the audit carries over as expired has a card in the ${ENDED_COLUMN} column (IS-CRM-FUNC-0086-1)`,
          expected: `${expired.length} cards in ${ENDED_COLUMN}: ${expired.map((e) => e.code).join(', ')} (no card is a FAIL - the program was not carried over; another column is a FAIL - it is not shown as ended)`,
          actual: wrong.length
            ? `${expired.length - wrong.length} of ${expired.length} in ${ENDED_COLUMN}; not: ${wrong.map((e) => (e.card ? `${e.code} in ${e.card.column}` : `${e.code} no card`)).join(', ')}`
            : `${expired.length} of ${expired.length} in ${ENDED_COLUMN}`,
          passed: wrong.length === 0,
        },
      ], `${TC} - Step 1 expired programs in Ended`,
      expired.filter((e) => e.card).map((e) => DiscountProgramEditorPageMig.kanbanCardSelector(e.code)).concat(expired.some((e) => e.card) ? [] : [DiscountProgramEditorPageMig.KANBAN_CARDS]), 'bottom-right');

      // (c) Deal registration - owned by its card
      const operating = cards.find((c) => c.code === AUDIT_OPERATING.code);
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: `Step 1 - the Deal registration card (${AUDIT_OPERATING.code}) is in the ${ACTIVE_COLUMN} column`,
          expected: `card ${AUDIT_OPERATING.code} in ${ACTIVE_COLUMN} (another column, or no card, is a FAIL - the one operating program would not apply)`,
          actual: operating ? `card ${operating.code} in ${operating.column} (${ascii(operating.tags.join(' | ')) || 'no chips'})` : '(no card)',
          passed: !!operating && operating.column === ACTIVE_COLUMN,
        },
      ], `${TC} - Step 1 Deal registration in Active`,
      operating ? [DiscountProgramEditorPageMig.kanbanCardSelector(operating.code)] : [DiscountProgramEditorPageMig.KANBAN_CARDS], 'bottom-right');
      const others = cards.filter((c) => c.code !== AUDIT_OPERATING.code && !(c.code in AUDIT_EXPIRED));
      console.log(`  Observation (not scored) - cards the audit does not name: ${others.map((c) => `${c.code} "${ascii(c.name)}" (${c.column})`).join(', ') || '(none)'}`);
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Step 1 - Program editor Kanban of the active version');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      if (!editor || !editorPage) throw new Error('The Program editor was not opened at Pre-condition 1');
      const wanted: Array<{ code: string; expected: string; why: string }> = [
        ...Object.entries(AUDIT_EXPIRED).map(([code, expected]) => ({ code, expected, why: 'the audit\'s Production window, UTC (IS-CRM-FUNC-0086-1)' })),
        { code: AUDIT_OPERATING.code, expected: AUDIT_OPERATING.validity, why: 'no validity limit (IS-CRM-FUNC-0085)' },
      ];
      const validityRow = DiscountProgramEditorPageMig.conditionRowSelector('Validity');
      for (const w of wanted) {
        if (!cards.some((c) => c.code === w.code)) {
          checks.push({ what: `Step 2 - ${w.code} Validity = ${w.why}`, expected: w.expected, actual: '(no card to open - see Step 1)', passed: false });
          console.log(`  - ${w.code.padEnd(7)}: no card to open`);
          continue;
        }
        await editor.openProgramsKanban();
        const opened = await editor.openProgramByCode(w.code);
        const conditions = await editor.readProgramConditions();
        const row = conditions.rows.find((r) => r.label === 'Validity');
        const actual = row ? normalizeWindow(row.value) : '(no Validity row)';
        console.log(`  - ${w.code.padEnd(7)}: "${ascii(opened)}" | shown "${ascii(row?.value ?? '')}" | read as ${actual} | audit ${w.expected}`);
        await recordChecksMig(editorPage, testInfo, checks, [
          {
            what: `Step 2 - ${w.code} Validity = ${w.why}`,
            expected: `${w.expected} (another window is a FAIL - historical orders would replay against other terms)`,
            actual,
            passed: actual === w.expected,
          },
        ], `${TC} - Step 2 ${w.code} Validity`, [row ? validityRow : DiscountProgramEditorPageMig.PROGRAM_CONDITIONS_HEADING], 'bottom-right');
      }
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Step 2 - validity windows read on the program pages');
      await editor.openProgramsKanban();
      cards = await editor.getKanbanCards(); // back on the Kanban for Step 3 (re-tags the cards)
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.blurForm();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      console.log(`  - Promotion list (${options.length}): ${options.join(' | ') || '(empty)'}`);

      // (a) "Trade-in Promotion 5%" - owned by the Promotion list on crm-mig
      await recordChecksMig(page, testInfo, checks, [
        {
          what: `Step 3 - "${EXPIRED_PROGRAM}" is not listed`,
          expected: 'not listed (valid to 2026-09-30, past its validity end date)',
          actual: options.includes(EXPIRED_PROGRAM) ? 'listed' : `not listed - the list holds ${options.length}: ${options.join(' | ') || '(empty)'}`,
          passed: !options.includes(EXPIRED_PROGRAM),
        },
      ], `${TC} - Step 3 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList], 'bottom-right');
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Promotion list open on crm-mig');

      // (b) "no retired program, no program past its validity end date" - judged on the Program editor's Kanban (cards
      // grouped by status from Valid from / Valid to): every listed program must have a card, by exact name, outside Ended
      if (!editor || !editorPage) throw new Error('The Program editor was not opened at Pre-condition 1');
      cards = await editor.getKanbanCards(); // read again right before the shot: re-tags the cards (data-pw-card)
      const judged = options.map((name) => {
        const card = cards.find((c) => c.name.trim() === name.trim());
        return {
          name,
          card,
          valid: !!card && card.column !== ENDED_COLUMN,
          text: card ? `card ${card.code} in ${card.column} (${ascii(card.tags.join(' | ')) || 'no chips'})` : 'no Kanban card with that name',
        };
      });
      judged.forEach((j) => console.log(`    - ${ascii(j.name)} : ${j.text}`));
      const shown = judged.filter((j) => j.card).map((j) => DiscountProgramEditorPageMig.kanbanCardSelector(j.card!.code));
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: 'Step 3 - no retired program and no program past its validity end date is listed (Program editor Kanban, by exact name)',
          expected: `a non-empty Promotion list, every listed program on a Kanban card outside the "${ENDED_COLUMN}" column (a program in ${ENDED_COLUMN}, or with no card - a retired one has none - is a FAIL)`,
          actual: !options.length
            ? 'empty Promotion list'
            : judged.filter((j) => !j.valid).map((j) => `${ascii(j.name)}: ${j.text}`).join(' | ') || judged.map((j) => `${ascii(j.name)}: ${j.text}`).join(' | '),
          passed: options.length > 0 && judged.every((j) => j.valid),
        },
      ], `${TC} - Step 3 listed programs on the Kanban`, shown.length ? shown : [DiscountProgramEditorPageMig.KANBAN_CARDS], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Step 3 - listed programs on the Program editor Kanban');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
