import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { DISCOUNT_MIG, Check, recordChecks, printVerifyAndAssertMig, baselineDetails } from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_3.4 - View a program's conditions and percentage in the Program editor   (crm-mig, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : CRM-12144_3.4
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 46, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_3.4 (Jira CRM-13790) read sale.coupon.program on pre-production, which has no Program editor - so this
 *                    port follows the crm-mig manual TC itself (the Program editor exists only on crm-mig)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-UI-0006
 * Source version   : master row CRM-12144_3.4 as read 2026-10-21 - re-check before trusting this spec
 * Host             : Program editor of crm-mig = Discount Service (https://discount-crm-mig.nakivo.site)
 * Run as           : QA's named Program editor account anh.ho@nakivo.com (users.admin_discount_mig) - CRM-12467
 *                    row 1.7 (Nathan Do, 2026-10-20: QA uses its own Program editor account)
 *
 * READ-ONLY: the spec opens the program table and reads it. It never clicks Add row, Save as version or Delete.
 * Evidence: the program table on screen (verify-point shots).
 *
 * Summary
 * -------
 * The active version's program table is opened in the Program editor; its result and condition columns are read,
 * then the Deal registration row (Reward percent, Scope, Target product codes, minimum amount).
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
 *    1. Open the program table of the active version
 *         -> Expected: The result columns are Promo code, Name, Reward percent, Scope and Target product codes;
 *            the condition columns hold the customer, the minimum amount, the minimum quantity, the validity
 *            window and the products
 *    2. Read the Deal registration row
 *         -> Expected: Reward percent = 10; Scope = specific_products; the Target product codes list the
 *            qualifying products; the minimum amount is 1,400.00 USD
 *
 *  How the screen maps to the expected result (Program editor read 2026-10-21, version 10 active):
 *    - "program table of the active version" = Graph view > Edit Table (decision table "promotion_programs"),
 *      header row 1 = Inputs | Outputs. Outputs = the result columns; Inputs = the condition columns.
 *    - the customer condition is written in the "Advanced" column (the manual TCs 1.2-1.13 enter
 *      "Customer condition (Advanced) = customer name is ..."); minimum amount = "Min amount"; minimum quantity =
 *      "Min qty"; validity window = "Valid from" + "Valid to"; products = "Products".
 *    - qualifying products: A2144B is in the Deal registration list, A2160B and A2165B (Support Services) are not
 *      (CRM-12467 row 3.6).
 * ================================================================================================
 */

const TC = 'CRM-12144_3.4';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with QA\'s named Program editor account (anh.ho@nakivo.com)',
  s1: 'Step 1: In the Program editor, open the program table of the active version (Graph > Edit Table)',
  s2: 'Step 2: In the Program editor, read the Deal registration row',
  verify: 'Verification',
} as const;

const EDITOR_ACCOUNT = users.admin_discount_mig;
const RESULT_COLUMNS = ['Promo code', 'Name', 'Reward percent', 'Scope', 'Target product codes'];
const CONDITION_COLUMNS: Array<{ holds: string; columns: string[] }> = [
  { holds: 'the customer', columns: ['Advanced'] },
  { holds: 'the minimum amount', columns: ['Min amount'] },
  { holds: 'the minimum quantity', columns: ['Min qty'] },
  { holds: 'the validity window', columns: ['Valid from', 'Valid to'] },
  { holds: 'the products', columns: ['Products'] },
];
const DECISION_TABLE = 'table:has(th:text-is("Inputs"))';
const unquote = (s: string): string => s.replace(/^\s*"|"\s*$/g, '').trim();

test.use({ ignoreHTTPSErrors: true }); // the Discount Service certificate chain is self-signed

test.describe(`${TC} - Program conditions and percentage in the Program editor (crm-mig, read-only)`, () => {
  test(`${TC}: View a program's conditions and percentage in the Program editor`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    // the decision table renders its rows only in a large viewport (1280x720 left the body empty, 2026-10-21)
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const checks: Check[] = [];
    let table: Awaited<ReturnType<DiscountProgramEditorPageMig['readActiveDecisionTable']>> | undefined;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Program editor (Discount Service of crm-mig)`);
      console.log(`  - Login : ${EDITOR_ACCOUNT.username}`);
      await editor.signIn(EDITOR_ACCOUNT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on the Program editor');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const versions = await editor.getVersions();
      const active = versions.filter((v) => v.active);
      console.log(`  - Versions listed : ${versions.length}`);
      console.log(`  - Active version  : ${active.map((v) => v.label).join(' | ') || '(none)'}`);
      table = await editor.readActiveDecisionTable();
      console.log(`  - Result columns (Outputs)   : ${JSON.stringify(table.outputs)}`);
      console.log(`  - Condition columns (Inputs) : ${JSON.stringify(table.inputs)}`);
      console.log(`  - Other columns              : ${JSON.stringify(table.extra)}`);
      console.log(`  - Program rows               : ${table.rows.length}`);
      const s1: Check[] = [
        { what: 'Step 1 - exactly one version is the active one', expected: '1', actual: String(active.length), passed: active.length === 1 },
        {
          what: 'Step 1 - the result columns, in order',
          expected: RESULT_COLUMNS.join(', '),
          actual: table.outputs.join(', '),
          passed: JSON.stringify(table.outputs) === JSON.stringify(RESULT_COLUMNS),
        },
        ...CONDITION_COLUMNS.map((c): Check => {
          const present = c.columns.filter((col) => table!.inputs.includes(col));
          return {
            what: `Step 1 - a condition column holds ${c.holds}`,
            expected: c.columns.join(' + '),
            actual: present.length ? present.join(' + ') : '(none)',
            passed: present.length === c.columns.length,
          };
        }),
      ];
      const others = table.inputs.filter((col) => !CONDITION_COLUMNS.some((c) => c.columns.includes(col)));
      console.log(`  Observation (not scored) - condition columns the TC does not name: ${JSON.stringify(others)}`);
      await recordChecks(page, testInfo, checks, s1, `${TC} - Step 1 program table columns`, [DECISION_TABLE]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - program table of the active version');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const row = (table?.rows ?? []).find((r) => unquote(r['Name'] ?? '') === DISCOUNT_MIG.dealRegistration);
      for (const [k, v] of Object.entries(row ?? {})) console.log(`  - ${k.padEnd(22)}: ${v.length > 160 ? `${v.slice(0, 160)}...` : v}`);
      const codes: string[] = (row?.['Target product codes'] ?? '').match(/[A-Z0-9][A-Z0-9-]+/g) ?? [];
      const minAmount = parseFloat(((row?.['Min amount'] ?? '').match(/[\d.]+/) || ['NaN'])[0]);
      console.log(`  Observation (not scored) - currency of the minimum amount: the "Min amount" column converts the order to the company currency (USD) before comparing; the cell itself shows no currency.`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the Deal registration row exists', expected: 'present', actual: row ? 'present' : 'absent', passed: !!row },
        { what: 'Step 2 - Reward percent', expected: '10', actual: row?.['Reward percent'] ?? '', passed: parseFloat(row?.['Reward percent'] ?? '') === 10 },
        { what: 'Step 2 - Scope', expected: 'specific_products', actual: unquote(row?.['Scope'] ?? ''), passed: unquote(row?.['Scope'] ?? '') === 'specific_products' },
        { what: 'Step 2 - Target product codes list a qualifying product (A2144B)', expected: 'contains A2144B', actual: codes.includes('A2144B') ? 'contains A2144B' : `missing (${codes.length} codes)`, passed: codes.includes('A2144B') },
        { what: 'Step 2 - Target product codes leave out the Support Services products (A2160B, A2165B)', expected: 'neither listed', actual: ['A2160B', 'A2165B'].filter((c) => codes.includes(c)).join(', ') || 'neither listed', passed: !codes.includes('A2160B') && !codes.includes('A2165B') },
        { what: 'Step 2 - the minimum amount', expected: '1,400.00', actual: row?.['Min amount'] ?? '', passed: minAmount === 1400 },
      ], `${TC} - Step 2 Deal registration row`, [DECISION_TABLE]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Deal registration row read');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
