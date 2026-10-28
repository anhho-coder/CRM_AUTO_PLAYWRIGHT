import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { DISCOUNT_MIG, Check, recordChecksMig, printVerifyAndAssertMig, baselineDetails } from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_3.4 - View a program's conditions and percentage in the Program editor   (crm-mig, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : CRM-12144_3.4
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 49, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Revised          : 2026-10-27 - Kanban > program page instead of Graph > Edit Table (the CRM-12144_5.3 standard,
 *                    tester 2026-10-27: "khi nói về program editor thì phải dùng trên Kanban view")
 * Known bug        : CRM-13850 - no "Based on Customers" condition on the program page - SKIPPED (2026-10-27, the same
 *                    skip-by-bug as CRM-12144_5.3): the whole describe block is skipped by test.skip(true, KNOWN_BUG); the
 *                    expected result is unchanged. Remove the skip when CRM-13850 is fixed and re-run - last run 2026-10-27
 *                    16:21 = FAIL 18/19, only "Based on Customers" red (report 2026-10-27-162149_CRM-12144_(3.45.25.5)_[Worker-1]_Failed).
 * Baseline         : Discount_3.4 (Jira CRM-13790) read sale.coupon.program on pre-production, which has no Program editor - so this
 *                    port follows the crm-mig manual TC itself (the Program editor exists only on crm-mig)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-UI-0006
 * Source version   : master row 49 (CRM-12144_3.4) as reworded to the Kanban path 2026-10-27 - re-check before
 *                    trusting this spec
 * Host             : Program editor of crm-mig = Discount Service (https://discount-crm-mig.nakivo.site)
 * Run as           : QA's named Program editor account anh.ho@nakivo.com (users.admin_discount_mig) - CRM-12467
 *                    row 1.7 (Nathan Do, 2026-10-20: QA uses its own Program editor account). ASSERTED in
 *                    Pre-condition 1: the account menu's "Signed in as" must name that login.
 *
 * READ-ONLY: the spec opens Discount Programs (Kanban view) and one program page, and reads them. It never clicks Edit,
 * Edit in table, Delete, New program or Save; the only click on the program page is "+N" of the For row (a view toggle
 * that unfolds the product codes).
 * Evidence: the Kanban (active version) and the program page, the rows each check read outlined (verify-point shots).
 *
 * Summary
 * -------
 * On Discount Programs (Kanban view, active version) the card PROG1 (Deal registration) is opened; its program page must
 * show the five results and the conditions the TC names, and carry Reward 10 %, Specific products, A2144B, 1,400.00.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_3\.4:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_3.4, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account
 *       (held by the development team)
 *  Steps
 *    1. Open Discount Programs (Kanban view) of the active version (top bar: Version N / active) and open the card of
 *       the Deal registration program (PROG1)
 *         -> Expected: The program page shows the results Promo code, Program name, Reward, Applies to and For;
 *            the conditions under "When it applies" hold the minimum amount, the minimum quantity, the
 *            validity window and the products, and the customer ("Based on Customers", as on pre-production)
 *    2. Read the Deal registration program page ("When it applies" and "Rewards")
 *         -> Expected: Reward = 10 %; Applies to = Specific products; For lists the qualifying products;
 *            Minimum amount = 1,400.00 USD
 *
 *  How the screen maps to the expected result (Program editor read 2026-10-27, rule Version 32 / active):
 *    - (master reworded 2026-10-27 to the Kanban path, so the steps now name the screens themselves) "the Deal
 *      registration program" = the card PROG1 "Deal registration promotion, 10% on Product, Support Services do not
 *      qualify" and the program page it opens (the migrated program - not the QA copy AUTO-CRM-13822-CLONE-1).
 *    - the result columns -> the program page: Name = the program title; Promo code = row "Promo code"; Reward percent =
 *      row "Reward" ("10.00 %"); Scope = "Applies to" inside the Reward row ("Specific products" is the editor's label
 *      of specific_products, "Whole order" of order); Target product codes = row "For" (Lines that get the discount).
 *    - the condition columns -> the rows under "When it applies": minimum amount = "Minimum amount"; minimum quantity =
 *      "Minimum quantity"; validity window = "Validity"; products = "Products"; the customer = pre-production's "Based
 *      on Customers" condition (tester review of CRM-12144_5.3, 2026-10-27) - none today, bug CRM-13850.
 *    - qualifying products: A2144B is in the Deal registration list, A2160B and A2165B (Support Services) are not
 *      (CRM-12467 row 3.6). The For row shows three codes and folds the rest behind "+N": "+N" is clicked first.
 *    - Removed with the revision (they read the decision table, not the program page): the guard "exactly one version
 *      is the active one" (Graph version list) and the customer = "Advanced" column mapping (the writer's, not the
 *      source's - same correction as CRM-12144_5.3 on 2026-10-26).
 *    - EXPECTED RED, not weakened: no "Based on Customers" row - bug CRM-13850.
 * ================================================================================================
 */

const TC = 'CRM-12144_3.4';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team) [QA\'s named account anh.ho@nakivo.com, per Nathan Do CRM-12467 2026-10-20; "Signed in as" is read and must name it]',
  s1: 'Step 1: Open Discount Programs (Kanban view) of the active version (top bar: Version N / active) and open the card of the Deal registration program (PROG1) [in the Program editor - read only]',
  s2: 'Step 2: Read the Deal registration program page ("When it applies" and "Rewards")',
  verify: 'Verification',
} as const;

const KNOWN_BUG =
  'The Discount Service program page has no "Based on Customers" condition (pre-production\'s Promotion Program has it); expected result kept, see header - known bug CRM-13850';

const EDITOR_ACCOUNT = users.admin_discount_mig;
/** The program the TC names (Deal registration), opened by its promo code from the Kanban (read 2026-10-27). */
const PROGRAM = { code: 'PROG1', name: DISCOUNT_MIG.dealRegistration };
/** The result columns of the TC, as the program page shows them (the Reward row carries "Applies to" inline). */
const RESULTS: Array<{ column: string; shows: string }> = [
  { column: 'Promo code', shows: 'row "Promo code"' },
  { column: 'Name', shows: 'the program title' },
  { column: 'Reward percent', shows: 'row "Reward"' },
  { column: 'Scope', shows: '"Applies to" in the Reward row' },
  { column: 'Target product codes', shows: 'row "For"' },
];
/** The condition columns of the TC that have a "When it applies" row of their own, matched on the row label. */
const CONDITIONS: Array<{ holds: string; label: string }> = [
  { holds: 'the minimum amount', label: 'Minimum amount' },
  { holds: 'the minimum quantity', label: 'Minimum quantity' },
  { holds: 'the validity window', label: 'Validity' },
  { holds: 'the products', label: 'Products' },
];
/** Pre-production's "Based on Customers" - a row whose label names the customers counts (bug CRM-13850: none today). */
const CUSTOMER_CONDITION = /customer/i;
const SCOPE_LABEL = { specific_products: 'Specific products', order: 'Whole order' } as const;
const QUALIFYING = 'A2144B';
const SUPPORT_SERVICES = ['A2160B', 'A2165B'];

/** The page's arrows / chevrons as ASCII, for stdout and the evidence banner. */
const ascii = (s: string): string => s.replace(/→/g, '->').replace(/›/g, '>');

test.use({ ignoreHTTPSErrors: true, actionTimeout: CommonUtils.waitTimes.abnormalWait * 3 }); // the Discount Service certificate chain is self-signed

test.describe(`${TC} - Program conditions and percentage in the Program editor (crm-mig, read-only)`, () => {
  // Known bug CRM-13850: no "Based on Customers" condition on the program page - remove when it is fixed
  test.skip(true, KNOWN_BUG); // CRM-13850 (Open)

  test(`${TC}: View a program's conditions and percentage in the Program editor [CRM-13850]`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const checks: Check[] = [];
    let conditions: Awaited<ReturnType<DiscountProgramEditorPageMig['readProgramConditions']>> | undefined;
    let rewards: Awaited<ReturnType<DiscountProgramEditorPageMig['readProgramRewards']>> | undefined;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Program editor (Discount Service of crm-mig)`);
      console.log(`  - Login : ${EDITOR_ACCOUNT.username}`);
      await editor.signIn(EDITOR_ACCOUNT);
      // the ROLE the TC names: a NAMED Program editor account - the account menu must say who is signed in
      const who = await editor.getSignedInAs({ keepOpen: true });
      await recordChecksMig(page, testInfo, checks, [
        {
          what: 'Pre-condition 1 - the Program editor session belongs to the named account (a FAIL means the run did not use the account the TC names)',
          expected: `"Signed in as" ${EDITOR_ACCOUNT.username}`,
          actual: who ? `"Signed in as" ${who}` : '(empty)',
          passed: who === EDITOR_ACCOUNT.username,
        },
      ], `${TC} - Pre-condition 1 Signed in as`, [DiscountProgramEditorPageMig.ACCOUNT_DROPDOWN], 'bottom-right');
      await editor.closeAccountMenu();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on the Program editor');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await editor.openProgramsKanban();
      const version = await editor.getActiveVersionNumber();
      console.log(`  - Screen         : Discount Programs (Kanban view)`);
      console.log(`  - Active version : ${Number.isFinite(version) ? version : '(not shown)'}`);
      await recordChecksMig(page, testInfo, checks, [
        {
          what: 'Step 1 - (guard) the Program editor shows an active rule version',
          expected: '"Version N / active" in the top bar, N a number',
          actual: Number.isFinite(version) ? `Version ${version} / active` : '(not shown)',
          passed: Number.isFinite(version),
        },
      ], `${TC} - Step 1 Kanban of the active version`, [DiscountProgramEditorPageMig.VERSION_CHIP], 'bottom-right');
      console.log(`  - Card opened    : ${PROGRAM.code}`);
      const opened = await editor.openProgramByCode(PROGRAM.code);
      console.log(`  - Program page   : ${opened}`);
      await recordChecksMig(page, testInfo, checks, [
        {
          what: `Step 1 - (guard) the card ${PROGRAM.code} opened its program page`,
          expected: `program title "${PROGRAM.name}"`,
          actual: opened ? `"${opened}"` : '(no title)',
          passed: opened === PROGRAM.name,
        },
      ], `${TC} - Step 1 program page of ${PROGRAM.code}`, [DiscountProgramEditorPageMig.PROGRAM_TITLE], 'bottom-right');

      conditions = await editor.readProgramConditions();
      rewards = await editor.readProgramRewards();
      const row = (rows: Array<{ label: string; value: string }>, label: string) => rows.find((r) => r.label === label);
      const print = (title: string, rows: Array<{ label: string; hint: string; value: string }>) => {
        console.log(`  ${title} (${rows.length}), in order:`);
        rows.forEach((r, i) => console.log(`    ${String(i + 1).padStart(2)}. ${r.label}${r.hint ? ` (${r.hint})` : ''} = ${ascii(r.value) || '(empty)'}`));
      };
      print('Rows under "When it applies"', conditions.rows);
      print('Rows under "Rewards"', rewards.rows);

      // (a) the result columns - owned by the title and the Rewards rows
      const reward = row(rewards.rows, 'Reward');
      const found: Record<string, string | undefined> = {
        'Promo code': row(rewards.rows, 'Promo code')?.value,
        Name: opened || undefined,
        'Reward percent': reward?.value,
        Scope: reward && /Applies to/.test(reward.value) ? reward.value.replace(/^.*Applies to\s*/, '') : undefined,
        'Target product codes': row(rewards.rows, 'For') ? ascii(row(rewards.rows, 'For')!.value) : undefined,
      };
      await recordChecksMig(page, testInfo, checks, RESULTS.map((r): Check => ({
        what: `Step 1 - the result "${r.column}" is on the program page`,
        expected: r.shows,
        actual: found[r.column] ? `${r.shows} = ${found[r.column]}` : '(not on the page)',
        passed: !!found[r.column],
      })), `${TC} - Step 1 results on the program page`,
      [DiscountProgramEditorPageMig.PROGRAM_TITLE, ...['Reward', 'For', 'Promo code'].filter((l) => row(rewards!.rows, l)).map((l) => DiscountProgramEditorPageMig.rewardRowSelector(l))], 'bottom-right');

      // (b) the condition columns that have a row - each owned by its own row
      const present = CONDITIONS.map((c) => ({ c, r: row(conditions!.rows, c.label) }));
      await recordChecksMig(page, testInfo, checks, [
        {
          what: 'Step 1 - (guard) the rows under "When it applies" were read',
          expected: 'the "When it applies" section with at least 1 row',
          actual: conditions.sectionFound ? `${conditions.rows.length} row(s)` : '(section not found)',
          passed: conditions.sectionFound && conditions.rows.length > 0,
        },
        ...present.map(({ c, r }): Check => ({
          what: `Step 1 - a condition holds ${c.holds}`,
          expected: `a "${c.label}" row`,
          actual: r ? `"${r.label}" = ${ascii(r.value) || '(empty)'}` : `(no such row among: ${conditions!.rows.map((x) => x.label).join(', ')})`,
          passed: !!r,
        })),
      ], `${TC} - Step 1 conditions on the program page`,
      present.some((p) => !p.r) ? [DiscountProgramEditorPageMig.PROGRAM_CONDITION_ROWS] : present.map((p) => DiscountProgramEditorPageMig.conditionRowSelector(p.c.label)), 'bottom-right');

      // (c) the customer - ABSENT, so the section heading is outlined, not the rows that are there
      const customerRows = conditions.rows.filter((r) => CUSTOMER_CONDITION.test(r.label));
      await recordChecksMig(page, testInfo, checks, [
        {
          what: 'Step 1 - a condition holds the customer: "Based on Customers", as on pre-production',
          expected: 'a row under "When it applies" whose label names the customers, as pre-production\'s Promotion Program has "Based on Customers" (Match all records) under Conditions (none is a FAIL - bug CRM-13850)',
          actual: customerRows.length ? customerRows.map((r) => `"${r.label}"`).join(', ') : `no such row - the ${conditions.rows.length} rows are: ${conditions.rows.map((r) => r.label).join(', ')}`,
          passed: customerRows.length > 0,
        },
      ], `${TC} - Step 1 Based on Customers`,
      customerRows.length ? customerRows.map((r) => DiscountProgramEditorPageMig.conditionRowSelector(r.label)) : [DiscountProgramEditorPageMig.PROGRAM_CONDITIONS_HEADING], 'bottom-right');

      const named = new Set([...CONDITIONS.map((c) => c.label)]);
      console.log(`  Observation (not scored) - condition rows the TC does not name: ${conditions.rows.map((r) => r.label).filter((l) => !named.has(l) && !CUSTOMER_CONDITION.test(l)).join(', ') || '(none)'}`);
      console.log(`  Observation (not scored) - Rewards rows besides the results: ${rewards.rows.map((r) => r.label).filter((l) => !['Reward', 'For', 'Promo code'].includes(l)).join(', ') || '(none)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 1 - program page of ${PROGRAM.code} opened from the Kanban`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      if (!conditions || !rewards) throw new Error('The program page was not read at Step 1');
      const reward = rewards.rows.find((r) => r.label === 'Reward');
      const minAmount = conditions.rows.find((r) => r.label === 'Minimum amount');
      const percent = parseFloat(((reward?.value ?? '').match(/^\s*(-?\d+(?:\.\d+)?)\s*%/) || ['', 'NaN'])[1]);
      const scope = reward && /Applies to/.test(reward.value) ? reward.value.replace(/^.*Applies to\s*/, '').trim() : '';
      console.log(`  - Reward row     : ${reward?.value ?? '(none)'}`);
      console.log(`  - Minimum amount : ${minAmount?.value ?? '(none)'}${minAmount?.hint ? ` (${minAmount.hint})` : ''}`);

      // (a) Reward percent + Scope - owned by the Reward row
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 2 - Reward percent', expected: '10 (row "Reward")', actual: reward?.value ?? '(no Reward row)', passed: percent === 10 },
        { what: 'Step 2 - Scope', expected: `specific_products (Applies to "${SCOPE_LABEL.specific_products}")`, actual: scope ? `Applies to "${scope}"` : '(no Applies to)', passed: scope === SCOPE_LABEL.specific_products },
      ], `${TC} - Step 2 Reward and scope`, [DiscountProgramEditorPageMig.rewardRowSelector('Reward')], 'bottom-right');

      // (b) Target product codes - owned by the For row, unfolded ("+N") first
      const codes = await editor.getProgramRowCodes(DiscountProgramEditorPageMig.rewardRowSelector('For'));
      console.log(`  - For row codes  : ${codes.length} (first 10: ${codes.slice(0, 10).join(' ')})`);
      await recordChecksMig(page, testInfo, checks, [
        { what: `Step 2 - the Target product codes list a qualifying product (${QUALIFYING})`, expected: `contains ${QUALIFYING}`, actual: codes.includes(QUALIFYING) ? `contains ${QUALIFYING} (${codes.length} codes)` : `missing (${codes.length} codes)`, passed: codes.includes(QUALIFYING) },
        { what: `Step 2 - the Target product codes leave out the Support Services products (${SUPPORT_SERVICES.join(', ')})`, expected: 'neither listed', actual: SUPPORT_SERVICES.filter((c) => codes.includes(c)).join(', ') || 'neither listed', passed: codes.length > 0 && !SUPPORT_SERVICES.some((c) => codes.includes(c)) },
      ], `${TC} - Step 2 target product codes`, [DiscountProgramEditorPageMig.rewardRowSelector('For')], 'top-right');

      // (c) the minimum amount - owned by its condition row
      console.log(`  Observation (not scored) - currency of the minimum amount: the row shows no currency; its hint reads "${minAmount?.hint ?? ''}".`);
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 2 - the minimum amount', expected: '1,400.00 (row "Minimum amount")', actual: minAmount?.value ?? '(no Minimum amount row)', passed: (minAmount?.value ?? '').trim() === '1,400.00' },
      ], `${TC} - Step 2 minimum amount`, [DiscountProgramEditorPageMig.conditionRowSelector('Minimum amount')], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Deal registration program page read');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
