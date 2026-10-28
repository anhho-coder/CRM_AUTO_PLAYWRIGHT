import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { Check, recordChecksMig, printVerifyAndAssertMig } from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_5.3 - Look for the Reseller / Distributor eligibility condition in the Program editor   (READ-ONLY)
 * ================================================================================================
 * Test Case ID     : CRM-12144_5.3
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 57, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Revised          : 2026-10-27 - Kanban > program page instead of Graph > Edit Table; program = AUTO-CRM-13822-CLONE-1;
 *                    Reseller / Distributor check = the two rows are there (tester decisions, see Automation notes)
 * Known bug        : CRM-13850 - no "Based on Customers" condition on the program page - SKIPPED (tester decision
 *                    2026-10-27): the whole describe block is skipped by test.skip(true, KNOWN_BUG); the expected result
 *                    is unchanged. Remove the skip when CRM-13850 is fixed and re-run - last run 2026-10-27 15:43 = FAIL
 *                    9/10, only the "Based on Customers" check red (report 2026-10-27-154336_CRM-12144_5.3_[Worker-1]_Failed).
 * Baseline         : none - no pre-production baseline (REQUIREMENT #8: written from the manual TC; not in
 *                    helpers/discount-mig.baseline-map.ts)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0087
 * Source           : master "Migration - Discount" row 57 - steps reworded to the Kanban path and Expected Result updated
 *                    on 2026-10-27 (first written from NEW_AND_UNSPECCED_TCS.md v2, section "CRM-12144_5.3", sha256
 *                    76232bfc9ba0 - that file now differs from the master and is no longer the source)
 * Source version   : master row 57 as read 2026-10-27 after the rewording - re-check before trusting this spec
 * Host             : Program editor of crm-mig = Discount Service (https://discount-crm-mig.nakivo.site)
 * Run as           : QA's named Program editor account anh.ho@nakivo.com (users.admin_discount_mig) - Nathan Do,
 *                    CRM-12467 2026-10-20, answer 4: "please uses your account and saves nothing". ASSERTED in
 *                    Pre-condition 1: the account menu's "Signed in as" must name that login.
 *
 * READ-ONLY: the spec opens Discount Programs (Kanban view) and one program page, and reads them. It never clicks Edit,
 * Edit in table, Delete, New program or Save, and saves nothing. No record is created, so there is no teardown.
 * Evidence: the Kanban (active version) and the program page (condition rows outlined) - verify-point shots.
 *
 * Summary
 * -------
 * On Discount Programs (Kanban view, active version) the program AUTO-CRM-13822-CLONE-1 is opened and the rows under "When
 * it applies" are read: "For reseller" + "For distributor" (ticked or not), the generic conditions, and - as on
 * pre-production - "Based on Customers" must be there.
 *
 * Command to run
 * --------------
 *   npx playwright test --project=chromium-headless --grep "CRM-12144_5\.3:"
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.3, master "Migration - Discount" row 57, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Look for the Reseller / Distributor eligibility condition in the Program editor (IS-CRM-FUNC-0087)
 *  Priority: P3 | Spec Areas: 0087 - no reseller condition
 *  Pre-conditions
 *    1. Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account
 *       (held by the development team)
 *  Executed Steps
 *    1. Open Discount Programs (Kanban view) of the active version (top bar: Version N / active) and open a program
 *       card in the Active column
 *    2. Read the rows under "When it applies" on the program page
 *  Expected Results
 *    2. The Reseller / Distributor condition is the two rows "For reseller" and "For distributor", ticked or not; the
 *       generic conditions (validity, products, minimum quantity, minimum amount) are present; the "Based on
 *       Customers" condition is present, as on pre-production
 *
 *  Automation notes
 *    - Revised 2026-10-27 (tester, review of report 2026-10-27-125254): the first version read Graph > Edit Table - the
 *      decision table's Inputs columns ("Reseller domain", "Distributor domain", ...). That is not the screen this TC is
 *      about. The spec now stays on Discount Programs (Kanban view), opens ONE program card and reads the program page.
 *    - How the screen maps to the steps (page read 2026-10-27, rule Version 32 / active):
 *        Step 1 (master reworded 2026-10-27: the Kanban view of the active version) = Discount Programs, top bar
 *               "Version N / active"; the program opened = card AUTO-CRM-13822-CLONE-1 "AUTO-CRM-13822-CLONE Deal
 *               registration promotion, 10% on Product, Support Services do not qualify" (tester's choice 2026-10-27).
 *               That program is QA test data (a copy of PROG1 published in rule v32 for CRM-13822): when it is removed
 *               from the rule, the Step 1 guard goes red - pick another card then.
 *        Step 2 the rows under "When it applies" on that program page (read 2026-10-27): Status, Validity,
 *               For reseller, For distributor, Minimum amount, Minimum quantity, Products.
 *    - Tester decision 2026-10-27 on the Reseller / Distributor half of the expected result: "có 2 ô đó là được rồi. Cho
 *      phép không tick" - the two rows "For reseller" and "For distributor" ARE expected on the program page, and an
 *      unticked box is allowed. Scored: both rows present; their tick state is printed, not scored. Master row 57
 *      carries it since 2026-10-27 (its Expected Result was updated on the master that day).
 *    - Tester review 2026-10-27 (report 2026-10-27-152715) on the customer: "TC 5.3 sai ở expectation về 'Based on
 *      customer'. Trên Pre-pro có nhưng Discount service không có. Chứ lỗi về generic condition là không đúng" - the
 *      customer is checked as pre-production's "Based on Customers" condition (Promotion Program > Conditions), NOT as
 *      a failing generic condition. Its evidence outlines the "When it applies" heading (the row is absent); the generic
 *      rows are no longer painted red.
 *    - Matching, on the row LABEL: validity = "Validity"; products = "Products"; minimum quantity = "Minimum quantity";
 *      minimum amount = "Minimum amount"; Based on Customers = a row whose label names the customers.
 *    - Step 1 has NO expected result in the source (REQUIREMENT #1b.4 - reported to the TC author): guards only - the
 *      top bar names an active version, and the card opens the program page of that name.
 *    - The "Advanced" section of the program page is printed as an observation (not scored).
 *    - EXPECTED RED, not weakened: no "Based on Customers" row - bug CRM-13850 (pre-production's Promotion Program has
 *      it under Conditions); the same gap was asked to the PM in CRM-13848.
 * ================================================================================================
 */

const TC = 'CRM-12144_5.3';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team) [QA\'s named account anh.ho@nakivo.com, per Nathan Do CRM-12467 2026-10-20; "Signed in as" is read and must name it]',
  s1: 'Step 1: Open Discount Programs (Kanban view) of the active version (top bar: Version N / active) and open a program card in the Active column [in the Program editor: the card AUTO-CRM-13822-CLONE-1 - read only]',
  s2: 'Step 2: Read the rows under "When it applies" on the program page [of AUTO-CRM-13822-CLONE-1]',
  verify: 'Verification',
} as const;

const KNOWN_BUG =
  'The Discount Service program page has no "Based on Customers" condition (pre-production\'s Promotion Program has it); expected result kept, see header - known bug CRM-13850';

const EDITOR_ACCOUNT = users.admin_discount_mig;
/** The program opened in Step 1 (tester's choice 2026-10-27): the CRM-13822 clone of Deal registration, Active column. */
const PROGRAM = {
  code: 'AUTO-CRM-13822-CLONE-1',
  name: 'AUTO-CRM-13822-CLONE Deal registration promotion, 10% on Product, Support Services do not qualify',
};
/** Tester decision 2026-10-27: both rows are expected on the program page; an unticked box is allowed. */
const PARTNER_ROWS = ['For reseller', 'For distributor'];
/** The generic conditions (tester review 2026-10-27: the customer is NOT scored as one of them), matched on the row label. */
const GENERIC_CONDITIONS: Array<{ holds: string; expected: string; match: RegExp }> = [
  { holds: 'the validity', expected: 'a "Validity" row', match: /^Validity$/i },
  { holds: 'the products', expected: 'a "Products" row', match: /^Products$/i },
  { holds: 'the minimum quantity', expected: 'a "Minimum quantity" row', match: /^Minimum quantity$/i },
  { holds: 'the minimum amount', expected: 'a "Minimum amount" row', match: /^Minimum amount$/i },
];
/** Pre-production's "Based on Customers" - a row whose label names the customers counts (bug CRM-13850: none today). */
const CUSTOMER_CONDITION = /customer/i;
const PARTNER_CONDITION = /reseller|distributor/i;

/** The page's arrows / chevrons as ASCII, for stdout and the evidence banner. */
const ascii = (s: string): string => s.replace(/\u2192/g, '->').replace(/\u203a/g, '>');

test.use({ ignoreHTTPSErrors: true, actionTimeout: CommonUtils.waitTimes.abnormalWait * 3 }); // the Discount Service certificate chain is self-signed

test.describe(`${TC} - Reseller / Distributor eligibility condition in the Program editor (crm-mig, read-only)`, () => {
  // Known bug CRM-13850: no "Based on Customers" condition on the program page - remove when it is fixed
  test.skip(true, KNOWN_BUG); // CRM-13850 (Open)

  test(`${TC}: Look for the Reseller / Distributor eligibility condition in the Program editor [CRM-13850]`, {
    tag: ['@no-preprod-baseline'],
    annotation: [
      { type: 'manual-tc', description: `${TC} (master "Migration - Discount" row 57, reworded 2026-10-27)` },
      { type: 'requirement', description: 'IS-CRM-FUNC-0087' },
      { type: 'issue', description: 'CRM-13850 - no "Based on Customers" condition on the program page (that Verify red until fixed)' },
    ],
  }, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const checks: Check[] = [];

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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 1 - program ${PROGRAM.code} opened from the Kanban`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const read = await editor.readProgramConditions();
      const rows = read.rows;
      const labels = rows.map((r) => r.label);
      console.log(`  Condition rows under "When it applies" (${rows.length}), in order:`);
      rows.forEach((r, i) => {
        console.log(`    ${String(i + 1).padStart(2)}. ${r.label}${r.hint ? ` (${r.hint})` : ''}`);
        console.log(`        value : ${ascii(r.value) || '(empty)'}${r.ticked === null ? '' : ` [${r.ticked ? 'ticked' : 'not ticked'}]`}`);
      });
      const rowSel = (label: string) => DiscountProgramEditorPageMig.conditionRowSelector(label);
      const allRows = [DiscountProgramEditorPageMig.PROGRAM_CONDITION_ROWS];

      // (a) Reseller / Distributor - owned by those two rows (or, when one is missing, by the whole list that was searched)
      const partnerRows = PARTNER_ROWS.map((label) => rows.find((r) => r.label === label));
      const tick = (t: boolean | null) => (t === null ? 'no checkbox' : t ? 'ticked' : 'not ticked');
      await recordChecksMig(page, testInfo, checks, [
        {
          what: 'Step 2 - the Reseller / Distributor condition is the two rows "For reseller" and "For distributor", ticked or not',
          expected: `both rows ${PARTNER_ROWS.map((l) => `"${l}"`).join(' and ')} under "When it applies"; an unticked box is allowed (tester decision 2026-10-27 - a missing row is a FAIL)`,
          actual: PARTNER_ROWS.map((l, i) => (partnerRows[i] ? `"${l}" (${partnerRows[i]!.value})` : `"${l}" MISSING`)).join(', '),
          passed: partnerRows.every((r) => !!r),
        },
      ], `${TC} - Step 2 Reseller Distributor condition`, partnerRows.every((r) => !!r) ? PARTNER_ROWS.map((l) => rowSel(l)) : allRows, 'bottom-right');
      partnerRows.forEach((r) => r && console.log(`  Observation (not scored) - "${r.label}" on ${PROGRAM.code}: ${tick(r.ticked)}`));

      // (b) the rows were read + the generic conditions - each generic condition owned by its own row
      const present = GENERIC_CONDITIONS.map((g) => ({ g, row: rows.find((r) => g.match.test(r.label)) }));
      await recordChecksMig(page, testInfo, checks, [
        {
          what: 'Step 2 - (guard) the condition rows under "When it applies" were read',
          expected: 'the "When it applies" section with at least 1 row',
          actual: read.sectionFound ? `${rows.length} row(s)` : '(section not found)',
          passed: read.sectionFound && rows.length > 0,
        },
        ...present.map(({ g, row }): Check => ({
          what: `Step 2 - the generic condition on ${g.holds} is present`,
          expected: g.expected,
          actual: row ? `"${row.label}" = ${ascii(row.value) || '(empty)'}` : `(no such row among: ${labels.join(', ') || 'none'})`,
          passed: !!row,
        })),
      ], `${TC} - Step 2 generic conditions present`,
      present.some((p) => !p.row) ? allRows : present.map((p) => rowSel(p.row!.label)), 'bottom-right');

      // (c) "Based on Customers" - ABSENT, so it has no row to outline: the section heading is outlined instead, and the
      // generic rows are NOT painted red (tester review 2026-10-27: the red rows read as a generic-condition failure)
      const customerRows = rows.filter((r) => CUSTOMER_CONDITION.test(r.label));
      await recordChecksMig(page, testInfo, checks, [
        {
          what: 'Step 2 - the "Based on Customers" condition is present, as on pre-production',
          expected: 'a row under "When it applies" whose label names the customers, as pre-production\'s Promotion Program has "Based on Customers" (Match all records) under Conditions (none is a FAIL - the Discount Service cannot limit a program to customers; bug CRM-13850)',
          actual: customerRows.length ? customerRows.map((r) => `"${r.label}"`).join(', ') : `no such row - the ${rows.length} rows are: ${labels.join(', ')}`,
          passed: customerRows.length > 0,
        },
      ], `${TC} - Step 2 Based on Customers`,
      customerRows.length ? customerRows.map((r) => rowSel(r.label)) : [DiscountProgramEditorPageMig.PROGRAM_CONDITIONS_HEADING], 'bottom-right');

      const others = labels.filter((l) => !PARTNER_CONDITION.test(l) && !CUSTOMER_CONDITION.test(l) && !GENERIC_CONDITIONS.some((g) => g.match.test(l)));
      console.log(`  Observation (not scored) - condition rows the TC does not name: ${others.length ? others.join(', ') : '(none)'}`);
      console.log(`  Observation (not scored) - "Advanced" section of ${PROGRAM.code}: ${read.advanced || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 2 - condition rows of ${PROGRAM.code} read`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
